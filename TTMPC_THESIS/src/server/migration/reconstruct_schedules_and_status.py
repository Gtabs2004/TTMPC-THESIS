"""
Reconstruct amortization schedules for legacy loans and produce status reports.

Reads:
  - Normalized_Loan_Applications_v1.csv  (743 loans with terms + application dates)
  - legacy_payments_import.csv           (6045 payments already keyed by TTMPCL-###)

Writes (into this same folder):
  - reconstructed_schedules.sql          (INSERTs into loan_schedules, wrapped in BEGIN/COMMIT)
  - loan_status_report.csv               (one row per loan)
  - member_latest_loan_summary.csv       (one row per member: latest loan only)
  - reconstruction_errors.csv            (loans that could not be simulated)

Formulas mirror main.py:build_single_schedule_row + main.py:1266-1272 delinquency
flags. Penalty amount = 2% * overdue_installment * missed_months, applied only
past the 3-month grace deadline (compounding per missed month).

This script performs NO database writes. It only reads CSVs and emits files.
"""

from __future__ import annotations

import calendar
import csv
import sys
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

HERE = Path(__file__).resolve().parent
APPS_CSV = HERE / "Normalized_Loan_Applications_v1.csv"
PAYMENTS_CSV = HERE / "legacy_payments_import.csv"

OUT_SQL = HERE / "reconstructed_schedules.sql"
OUT_STATUS = HERE / "loan_status_report.csv"
OUT_LATEST = HERE / "member_latest_loan_summary.csv"
OUT_ERRORS = HERE / "reconstruction_errors.csv"

TWO = Decimal("0.01")
TODAY = date.today()

# --- Interest rates in PERCENT per month ---
# Pulled from Supabase `loan_types.interest_rate` at runtime (source of truth).
# Fallbacks used only if the DB row is missing OR NULL for that code.
INTEREST_RATE_PCT_FALLBACK = {
    "CONSOLIDATED": Decimal("0.83"),
    "EMERGENCY": Decimal("2"),
    "BONUS": Decimal("0"),
    "NONMEMBER_BONUS": Decimal("0"),
}
INTEREST_RATE_PCT: dict[str, Decimal] = {}  # populated by load_interest_rates()


def load_interest_rates() -> None:
    """Populate INTEREST_RATE_PCT from Supabase loan_types (real values)."""
    import sys as _sys
    _sys.path.insert(0, str(HERE.parent))
    import applicationConfirmation as _ac
    sb, _, _ = _ac._load_runtime_config()
    r = sb.table("loan_types").select("code, interest_rate").execute()
    for row in r.data or []:
        code = (row.get("code") or "").strip().upper()
        rate = row.get("interest_rate")
        if code and rate is not None:
            INTEREST_RATE_PCT[code] = Decimal(str(rate))
    # Backfill any missing codes with fallbacks
    for code, fallback in INTEREST_RATE_PCT_FALLBACK.items():
        INTEREST_RATE_PCT.setdefault(code, fallback)
    print(f"  Loaded interest rates (%/month): {dict((k, str(v)) for k, v in INTEREST_RATE_PCT.items())}")

# Penalty rate percent per main.py:759 — 1% for bonus, 2% for others.
PENALTY_RATE_PCT = {
    "BONUS": Decimal("1"),
    "NONMEMBER_BONUS": Decimal("1"),
}
DEFAULT_PENALTY_RATE_PCT = Decimal("2")


def money(v: Decimal) -> Decimal:
    return v.quantize(TWO, rounding=ROUND_HALF_UP)


def add_months(base: date, months: int) -> date:
    idx = base.month - 1 + months
    y = base.year + idx // 12
    m = idx % 12 + 1
    d = min(base.day, calendar.monthrange(y, m)[1])
    return date(y, m, d)


def parse_date(s: str) -> date | None:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def normalize_type(raw: str) -> str:
    t = (raw or "").strip().lower()
    if "consolidated" in t:
        return "CONSOLIDATED"
    if "emergency" in t:
        return "EMERGENCY"
    if "bonus" in t:
        return "BONUS"
    return (raw or "").strip().upper()


@dataclass
class ScheduleRow:
    installment_no: int
    due_date: date
    expected_principal: Decimal
    expected_interest: Decimal
    expected_amount: Decimal
    remaining_after: Decimal
    penalty_rate_pct: Decimal


def build_schedule(
    loan_type: str,
    principal: Decimal,
    term_months: int,
    monthly_rate_decimal: Decimal,
    first_due: date,
) -> list[ScheduleRow]:
    """
    Mirror main.py:build_single_schedule_row.
      - CONSOLIDATED / BONUS: constant principal/term + flat interest on original principal.
      - EMERGENCY: equal-principal-in-cents, last month cleanup, interest on ending balance.
    """
    penalty_pct = PENALTY_RATE_PCT.get(loan_type, DEFAULT_PENALTY_RATE_PCT)
    rows: list[ScheduleRow] = []

    if loan_type == "EMERGENCY":
        total_p_cents = int((principal * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        monthly_p_cents = total_p_cents // term_months
        balance_cents = total_p_cents
        for n in range(1, term_months + 1):
            if n >= term_months:
                p_cents = balance_cents
            else:
                p_cents = min(monthly_p_cents, balance_cents)
            ending_cents = balance_cents - p_cents
            i_cents = int((Decimal(ending_cents) * monthly_rate_decimal).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP))
            p = Decimal(p_cents) / 100
            i = Decimal(i_cents) / 100
            rows.append(ScheduleRow(
                installment_no=n,
                due_date=add_months(first_due, n - 1),
                expected_principal=p,
                expected_interest=i,
                expected_amount=p + i,
                remaining_after=Decimal(ending_cents) / 100,
                penalty_rate_pct=penalty_pct,
            ))
            balance_cents = ending_cents
    else:
        principal_comp = money(principal / Decimal(term_months))
        interest_comp = money(principal * monthly_rate_decimal)
        remaining = principal
        for n in range(1, term_months + 1):
            remaining = max(remaining - principal_comp, Decimal("0"))
            rows.append(ScheduleRow(
                installment_no=n,
                due_date=add_months(first_due, n - 1),
                expected_principal=principal_comp,
                expected_interest=interest_comp,
                expected_amount=money(principal_comp + interest_comp),
                remaining_after=remaining,
                penalty_rate_pct=penalty_pct,
            ))
    return rows


def allocate_payments_fifo(schedule: list[ScheduleRow], total_paid: Decimal) -> tuple[list[str], int]:
    """
    Walk schedule row-by-row deducting from total_paid. Returns:
      - per-row status list ('paid' / 'partial' / 'unpaid')
      - index of first not-fully-paid row (next-due), or len(schedule) if all paid
    Interest is expected+interest merged into expected_amount — we allocate against the
    total expected_amount (this matches how legacy CSV payments actually cleared installments;
    payment splits between principal/interest are not tracked in the legacy source).
    """
    remaining = total_paid
    statuses: list[str] = []
    next_due_idx = len(schedule)
    for i, row in enumerate(schedule):
        if remaining >= row.expected_amount:
            statuses.append("paid")
            remaining -= row.expected_amount
        elif remaining > 0:
            statuses.append("partial")
            if next_due_idx == len(schedule):
                next_due_idx = i
            remaining = Decimal("0")
        else:
            statuses.append("unpaid")
            if next_due_idx == len(schedule):
                next_due_idx = i
    return statuses, next_due_idx


def compute_penalty(
    schedule: list[ScheduleRow],
    statuses: list[str],
    next_due_idx: int,
) -> tuple[Decimal, int]:
    """
    Penalty = 2% (or 1% bonus) * overdue_installment_amount * missed_months,
    only applied past the 3-month grace deadline. Compounds per missed month
    across every unpaid installment whose due_date + 3mo < today.
    Returns (total_penalty, months_delinquent_of_earliest_missed).
    """
    total_penalty = Decimal("0")
    earliest_missed_months = 0
    for i, row in enumerate(schedule):
        if statuses[i] == "paid":
            continue
        penalty_start = add_months(row.due_date, 3)
        if TODAY <= penalty_start:
            continue
        # months past the penalty_start (compounding factor)
        months_past = (TODAY.year - penalty_start.year) * 12 + (TODAY.month - penalty_start.month)
        if TODAY.day >= penalty_start.day:
            months_past += 1  # matches compute_missed_due_dates cross-day logic
        months_past = max(months_past, 1)
        pen = money(row.expected_amount * (row.penalty_rate_pct / 100) * months_past)
        total_penalty += pen
        if i == next_due_idx:
            earliest_missed_months = months_past
    return total_penalty, earliest_missed_months


def read_loans() -> list[dict]:
    with APPS_CSV.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def read_payment_totals() -> dict[str, Decimal]:
    totals: dict[str, Decimal] = {}
    with PAYMENTS_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            loan_id = (row.get("loan_id") or "").strip()
            if not loan_id:
                continue
            amt = Decimal(str(row.get("amount_paid") or "0"))
            totals[loan_id] = totals.get(loan_id, Decimal("0")) + amt
    return totals


def read_payment_dates() -> dict[str, list[date]]:
    """Return sorted list of payment_dates per loan_id, for restructure detection."""
    dates: dict[str, list[date]] = {}
    with PAYMENTS_CSV.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            loan_id = (row.get("loan_id") or "").strip()
            d = parse_date(row.get("payment_date") or "")
            if not loan_id or not d:
                continue
            dates.setdefault(loan_id, []).append(d)
    for k in dates:
        dates[k].sort()
    return dates


def detect_restructured(
    loans_by_member: dict[str, list[dict]],
    payment_dates: dict[str, list[date]],
) -> set[str]:
    """
    For each member, walk loans in application_date order. If loan N had >=6
    payments recorded before loan N+1's application_date, loan N is restructured
    (superseded by N+1). Returns set of loan_ids to mark Restructured.
    """
    restructured: set[str] = set()
    for member_loans in loans_by_member.values():
        # Bucket by loan_type: a member can have 1 Consolidated + 1 Emergency
        # concurrently, but only one of each type — so restructure chains are
        # per-type, not per-member.
        by_type: dict[str, list[dict]] = {}
        for l in member_loans:
            if not l.get("_app_date"):
                continue
            by_type.setdefault(l.get("_loan_type") or "", []).append(l)
        for type_loans in by_type.values():
            ordered = sorted(type_loans, key=lambda l: l["_app_date"])
            for i in range(len(ordered) - 1):
                older = ordered[i]
                newer = ordered[i + 1]
                paid_before_new = sum(
                    1 for pd in payment_dates.get(older["loan_id"], []) if pd < newer["_app_date"]
                )
                if paid_before_new >= 6:
                    restructured.add(older["loan_id"])
    return restructured


def sql_escape(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float, Decimal)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def main() -> int:
    if not APPS_CSV.exists():
        print(f"ERROR: {APPS_CSV} not found", file=sys.stderr)
        return 1
    if not PAYMENTS_CSV.exists():
        print(f"ERROR: {PAYMENTS_CSV} not found", file=sys.stderr)
        return 1

    load_interest_rates()
    loans = read_loans()
    payment_totals = read_payment_totals()
    payment_dates = read_payment_dates()
    print(f"Loaded {len(loans)} loans, {len(payment_totals)} distinct loan_ids with payments")

    # First pass: parse loan metadata + group by member for restructure detection.
    parsed_loans: list[dict] = []
    loans_by_member: dict[str, list[dict]] = {}
    for loan in loans:
        loan_id = (loan.get("LoanCode") or "").strip()
        master_uuid = (loan.get("MasterUUID") or "").strip()
        app_date = parse_date(loan.get("ApplicationDate") or "")
        entry = {
            "loan_id": loan_id,
            "master_uuid": master_uuid,
            "_app_date": app_date,
            "_loan_type": normalize_type(loan.get("LoanType") or ""),
            "_raw": loan,
        }
        parsed_loans.append(entry)
        if master_uuid and app_date:
            loans_by_member.setdefault(master_uuid, []).append(entry)

    restructured_ids = detect_restructured(loans_by_member, payment_dates)
    print(f"Detected {len(restructured_ids)} restructured (superseded) loans")

    sql_lines: list[str] = [
        "-- Reconstructed loan_schedules for legacy loans (Normalized_Loan_Applications_v1.csv)",
        "-- Amortization mirrors main.py:build_single_schedule_row.",
        "-- schedule_id prefix 'LEGACY_' so rollback is easy:",
        "--   DELETE FROM loan_schedules WHERE schedule_id LIKE 'LEGACY_%';",
        "-- Wrapped in a single transaction for atomicity.",
        "",
        "BEGIN;",
        "",
    ]

    status_rows: list[dict] = []
    errors: list[dict] = []
    per_member_loans: dict[str, list[dict]] = {}

    for entry in parsed_loans:
        loan = entry["_raw"]
        loan_id = entry["loan_id"]
        master_uuid = entry["master_uuid"]
        is_restructured = loan_id in restructured_ids
        member_name = (loan.get("Name") or "").strip()
        loan_type = normalize_type(loan.get("LoanType") or "")
        try:
            principal = Decimal(str(loan.get("LoanAmount") or "0"))
            term = int(float(loan.get("LoanTerm") or 0))
        except (ValueError, ArithmeticError) as e:
            errors.append({"loan_id": loan_id, "reason": f"bad numeric: {e}"})
            continue
        app_date = parse_date(loan.get("ApplicationDate") or "")

        if not loan_id or principal <= 0 or term <= 0 or not app_date:
            errors.append({
                "loan_id": loan_id or "(missing)",
                "reason": f"missing fields: principal={principal}, term={term}, app_date={app_date}",
            })
            continue

        rate_pct = INTEREST_RATE_PCT.get(loan_type)
        if rate_pct is None:
            errors.append({"loan_id": loan_id, "reason": f"unknown loan_type: {loan_type}"})
            continue
        monthly_rate = rate_pct / 100

        first_due = add_months(app_date, 1)
        schedule = build_schedule(loan_type, principal, term, monthly_rate, first_due)

        total_paid = payment_totals.get(loan_id, Decimal("0"))
        statuses, next_due_idx = allocate_payments_fifo(schedule, total_paid)

        expected_total = sum((r.expected_amount for r in schedule), Decimal("0"))
        expected_principal_total = sum((r.expected_principal for r in schedule), Decimal("0"))
        expected_interest_total = sum((r.expected_interest for r in schedule), Decimal("0"))
        outstanding = max(expected_total - total_paid, Decimal("0"))
        # Split outstanding proportional to remaining principal:interest ratio.
        outstanding_principal = Decimal("0")
        outstanding_interest = Decimal("0")
        for i, row in enumerate(schedule):
            if statuses[i] == "paid":
                continue
            if statuses[i] == "partial":
                # rough split of the partial: proportional
                pending = row.expected_amount - (total_paid - sum(
                    (r.expected_amount for j, r in enumerate(schedule) if statuses[j] == "paid"),
                    Decimal("0"),
                ))
                if row.expected_amount > 0:
                    outstanding_principal += money(pending * (row.expected_principal / row.expected_amount))
                    outstanding_interest += money(pending * (row.expected_interest / row.expected_amount))
            else:
                outstanding_principal += row.expected_principal
                outstanding_interest += row.expected_interest

        # Delinquency
        penalty_amount, months_delinquent = compute_penalty(schedule, statuses, next_due_idx)

        if is_restructured:
            loan_status = "Restructured"
            next_due_date = None
            next_due_amount = Decimal("0")
            penalty_amount = Decimal("0")
            months_delinquent = 0
        elif next_due_idx >= len(schedule):
            loan_status = "Fully Paid"
            next_due_date = None
            next_due_amount = Decimal("0")
        else:
            next_due_date = schedule[next_due_idx].due_date
            next_due_amount = schedule[next_due_idx].expected_amount
            grace = add_months(next_due_date, 3)
            loan_status = "Delinquent" if TODAY > grace else "Active"

        # Emit SQL for schedule rows.
        # Respects idx_loan_schedules_one_active_due_per_loan (only one row per
        # loan may be Unpaid/Pending/Overdue).
        #
        # Active (non-restructured) loans:
        #   - all Paid installments (matching allocated payments)
        #   - PLUS exactly one Unpaid row = the current-due installment
        # Restructured loans (superseded by a newer loan for the same borrower/type):
        #   - emit installments dated ON OR BEFORE the restructure date as Paid
        #     (so members see their history in SOA)
        #   - no Unpaid rows (loan is closed via restructure)
        #   - installments dated after the restructure never actually came due
        emit_indices: list[int] = []
        if is_restructured:
            # Find the newer loan's application date for this borrower/type to
            # know the cutoff for "installments that actually came due".
            restructure_cutoff = None
            same_type_loans = [
                l for l in loans_by_member.get(master_uuid, [])
                if l.get("_loan_type") == loan_type
                and l.get("_app_date")
                and l["loan_id"] != loan_id
                and l["_app_date"] > app_date
            ]
            if same_type_loans:
                restructure_cutoff = min(l["_app_date"] for l in same_type_loans)
            for i, row in enumerate(schedule):
                if restructure_cutoff is None or row.due_date <= restructure_cutoff:
                    emit_indices.append(i)
        else:
            for i, st in enumerate(statuses):
                if st == "paid":
                    emit_indices.append(i)
            # Add exactly one active row: the next-due installment (if any).
            if next_due_idx < len(schedule):
                emit_indices.append(next_due_idx)
        schedule_iter = [(i, schedule[i]) for i in emit_indices]
        for i, row in schedule_iter:
            sched_id = f"LEGACY_{loan_id}_{row.installment_no:02d}"
            if is_restructured:
                db_status = "Paid"  # Restructured loans: all emitted rows are historical/closed
            else:
                db_status = "Paid" if statuses[i] == "paid" else "Unpaid"
            sql_lines.append(
                "INSERT INTO public.loan_schedules "
                "(schedule_id, loan_id, installment_no, due_date, expected_principal, "
                "expected_interest, penalty, remaining_principal, expected_amount, "
                "principal_component, interest_component, schedule_status) VALUES ("
                f"{sql_escape(sched_id)}, {sql_escape(loan_id)}, {row.installment_no}, "
                f"{sql_escape(row.due_date.isoformat())}, {row.expected_principal}, "
                f"{row.expected_interest}, {row.penalty_rate_pct}, {row.remaining_after}, "
                f"{row.expected_amount}, {row.expected_principal}, {row.expected_interest}, "
                f"{sql_escape(db_status)}"
                ") ON CONFLICT (loan_id, installment_no) DO NOTHING;"
            )

        # Build status report row
        report_row = {
            "loan_id": loan_id,
            "master_uuid": master_uuid,
            "member_name": member_name,
            "loan_type": loan_type,
            "principal": str(principal),
            "term_months": term,
            "application_date": app_date.isoformat(),
            "first_due_date": first_due.isoformat(),
            "monthly_installment": str(schedule[0].expected_amount),
            "expected_total": str(money(expected_total)),
            "expected_principal_total": str(money(expected_principal_total)),
            "expected_interest_total": str(money(expected_interest_total)),
            "total_paid": str(money(total_paid)),
            "outstanding_balance": str(money(outstanding)),
            "outstanding_principal": str(money(outstanding_principal)),
            "outstanding_interest": str(money(outstanding_interest)),
            "loan_status": loan_status,
            "next_due_date": next_due_date.isoformat() if next_due_date else "",
            "next_due_amount": str(money(next_due_amount)),
            "months_delinquent": months_delinquent,
            "penalty_amount": str(money(penalty_amount)),
        }
        status_rows.append(report_row)
        per_member_loans.setdefault(master_uuid, []).append(report_row)

    # Latest loan per member = max application_date
    latest_rows = []
    for uuid, ls in per_member_loans.items():
        latest = max(ls, key=lambda r: r["application_date"])
        latest_rows.append(latest)

    sql_lines.append("")
    sql_lines.append("COMMIT;")

    OUT_SQL.write_text("\n".join(sql_lines), encoding="utf-8")
    print(f"Wrote {OUT_SQL}  ({len(sql_lines):,} lines)")

    def write_csv(path: Path, rows: list[dict]):
        if not rows:
            path.write_text("", encoding="utf-8")
            return
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)

    write_csv(OUT_STATUS, status_rows)
    write_csv(OUT_LATEST, latest_rows)
    write_csv(OUT_ERRORS, errors)

    print(f"Wrote {OUT_STATUS}     ({len(status_rows):,} rows)")
    print(f"Wrote {OUT_LATEST}    ({len(latest_rows):,} rows)")
    print(f"Wrote {OUT_ERRORS}   ({len(errors):,} rows)")

    # Summary
    by_status: dict[str, int] = {}
    for r in status_rows:
        by_status[r["loan_status"]] = by_status.get(r["loan_status"], 0) + 1
    print("\nStatus breakdown:")
    for s, c in sorted(by_status.items()):
        print(f"  {s}: {c}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
