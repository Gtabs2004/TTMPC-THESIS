"""
Backfill NULL fields on legacy loans in the `loans` table.

Reads:
  - Normalized_Loan_Applications_v1.csv (743 loans)
  - Supabase loan_types (real interest rates)

Writes:
  - backfill_loans_fields.sql — UPDATE statements for term, interest_rate,
    monthly_amortization, total_interest on each legacy loan.

Amortization formulas mirror main.py:build_single_schedule_row:
  CONSOLIDATED/BONUS: monthly = (principal / term) + (principal * rate)
                      total_interest = principal * rate * term
  EMERGENCY: diminishing balance — total_interest computed per installment,
             monthly_amortization = first installment amount (matches
             loan_calculator behavior)

Only emits UPDATEs — does NOT change loan_status, member_id, or amount fields.

NO DB writes. Emits SQL only.
"""

from __future__ import annotations

import csv
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

APPS_CSV = HERE / "Normalized_Loan_Applications_v1.csv"
OUT_SQL = HERE / "backfill_loans_fields.sql"

TWO = Decimal("0.01")


def money(v: Decimal) -> Decimal:
    return v.quantize(TWO, rounding=ROUND_HALF_UP)


def normalize_type(raw: str) -> str:
    t = (raw or "").strip().lower()
    if "consolidated" in t:
        return "CONSOLIDATED"
    if "emergency" in t:
        return "EMERGENCY"
    if "bonus" in t:
        return "BONUS"
    return (raw or "").strip().upper()


def compute_amortization(loan_type: str, principal: Decimal, term: int,
                         monthly_rate: Decimal) -> tuple[Decimal, Decimal]:
    """
    Return (monthly_amortization, total_interest).
    Mirrors main.py:build_single_schedule_row summed over `term` installments.
    """
    if term <= 0 or principal <= 0:
        return Decimal("0"), Decimal("0")

    if loan_type == "EMERGENCY":
        # Diminishing balance — walk installments to compute total interest.
        total_p_cents = int((principal * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        monthly_p_cents = total_p_cents // term
        balance_cents = total_p_cents
        total_interest_cents = 0
        first_installment_cents = 0
        for n in range(1, term + 1):
            if n >= term:
                p_cents = balance_cents
            else:
                p_cents = min(monthly_p_cents, balance_cents)
            ending_cents = balance_cents - p_cents
            i_cents = int((Decimal(ending_cents) * monthly_rate).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP))
            total_interest_cents += i_cents
            if n == 1:
                first_installment_cents = p_cents + i_cents
            balance_cents = ending_cents
        return (Decimal(first_installment_cents) / 100,
                Decimal(total_interest_cents) / 100)
    else:
        # CONSOLIDATED / BONUS: straight-line principal + flat interest.
        principal_comp = money(principal / Decimal(term))
        interest_comp = money(principal * monthly_rate)
        monthly = money(principal_comp + interest_comp)
        total_interest = money(interest_comp * Decimal(term))
        return monthly, total_interest


def load_interest_rates() -> dict[str, Decimal]:
    sb, _, _ = ac._load_runtime_config()
    r = sb.table("loan_types").select("code, interest_rate").execute()
    rates: dict[str, Decimal] = {}
    for row in r.data or []:
        code = (row.get("code") or "").strip().upper()
        rate = row.get("interest_rate")
        if code and rate is not None:
            rates[code] = Decimal(str(rate))
    # Fallbacks
    rates.setdefault("CONSOLIDATED", Decimal("0.83"))
    rates.setdefault("EMERGENCY", Decimal("2"))
    rates.setdefault("BONUS", Decimal("0"))
    rates.setdefault("NONMEMBER_BONUS", Decimal("0"))
    return rates


def main() -> int:
    print("Loading loan_types rates...")
    rates = load_interest_rates()
    print(f"  Rates (%/month): {dict((k, str(v)) for k, v in rates.items())}")

    with APPS_CSV.open(encoding="utf-8-sig", newline="") as f:
        loans = list(csv.DictReader(f))
    print(f"  Loaded {len(loans)} loan rows from CSV")

    lines = [
        "-- Backfill NULL fields on legacy loans (term, interest_rate,",
        "--   monthly_amortization, total_interest) from",
        "--   Normalized_Loan_Applications_v1.csv.",
        "--",
        "-- Only updates rows where the field is currently NULL — safe to re-run.",
        "-- Does NOT touch loan_status, member_id, principal_amount, or loan_amount.",
        "--",
        "-- Rollback: no automatic rollback; if you need to revert, set the",
        "-- affected fields back to NULL:",
        "--   UPDATE loans SET term=NULL, interest_rate=NULL,",
        "--       monthly_amortization=NULL, total_interest=NULL",
        "--   WHERE raw_payload->>'legacy' = 'true';",
        "",
        "BEGIN;",
        "",
    ]

    skipped = 0
    emitted = 0
    for loan in loans:
        loan_id = (loan.get("LoanCode") or "").strip()
        loan_type = normalize_type(loan.get("LoanType") or "")
        try:
            principal = Decimal(str(loan.get("LoanAmount") or "0"))
            term = int(float(loan.get("LoanTerm") or 0))
        except (ValueError, ArithmeticError):
            skipped += 1
            continue
        if not loan_id or principal <= 0 or term <= 0:
            skipped += 1
            continue

        rate_pct = rates.get(loan_type)
        if rate_pct is None:
            skipped += 1
            continue
        monthly_rate = rate_pct / 100

        monthly_amort, total_interest = compute_amortization(
            loan_type, principal, term, monthly_rate)

        # Emit UPDATE, guarded by COALESCE so we don't overwrite existing values.
        lines.append(
            "UPDATE public.loans SET "
            f"term = COALESCE(term, {term}), "
            f"interest_rate = COALESCE(interest_rate, {rate_pct}), "
            f"monthly_amortization = COALESCE(monthly_amortization, {monthly_amort}), "
            f"total_interest = COALESCE(total_interest, {total_interest}) "
            f"WHERE control_number = '{loan_id}';"
        )
        emitted += 1

    lines.append("")
    lines.append("COMMIT;")
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {OUT_SQL}")
    print(f"  Emitted: {emitted} UPDATE statements")
    print(f"  Skipped: {skipped} rows (bad data / missing fields)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
