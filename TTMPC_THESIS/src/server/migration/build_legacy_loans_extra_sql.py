"""
Phase 1: Migrate the 31 historical loans that are in Master_Analytical_Matrix.csv
but NOT in df_modeling_export (1).csv (which we migrated previously).

All 31 have a valid MasterUUID linkable via the bridge, full features in the
matrix, and active payment activity in Normalized_Payments.csv (611 payments
across the 31 loans).

Output:
  - legacy_loans_extra_bulk_insert.sql  (paste into Supabase SQL Editor)

Idempotent: ON CONFLICT (control_number) DO NOTHING.
Triggers bypassed via session_replication_role for the transaction.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent

MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
DF_CSV = REPO / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
BRIDGE = HERE / "member_bridge_final.csv"
OUT_SQL = HERE / "legacy_loans_extra_bulk_insert.sql"
OUT_PENDING = HERE / "pending_date_review.csv"

LOAN_TYPE_ID = {"Consolidated": 1, "Emergency": 3}


def sql_str(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def sql_jsonb(obj: dict) -> str:
    return sql_str(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def parse_date(value: str) -> str:
    """Matrix dates look like '2023-11-21 00:00:00'. Take the date part.
    Returns empty string for invalid/missing values (e.g. literal '0')."""
    s = (value or "").strip().split(" ")[0]
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return s
    return ""


def derive_loan_status(loan_amount: float, actual_paid: float) -> str:
    """Use total paid vs loan amount to set a sensible status.
    Without true interest/term info, we approximate: if paid >= 95% of principal,
    consider fully paid; otherwise partially paid."""
    if loan_amount <= 0:
        return "fully paid"
    ratio = actual_paid / loan_amount
    if ratio >= 0.95:
        return "fully paid"
    return "partially paid"


def main() -> int:
    if not MATRIX_CSV.exists():
        print(f"ERROR: missing {MATRIX_CSV}", file=sys.stderr)
        return 2
    if not BRIDGE.exists():
        print(f"ERROR: missing {BRIDGE}", file=sys.stderr)
        return 2

    df_loans: set[str] = set()
    with DF_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            df_loans.add(row["LoanID"])

    bridge: dict[str, str] = {}
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bridge[row["csv_uuid"]] = row["member_id"]

    matrix_rows = list(csv.DictReader(MATRIX_CSV.open("r", encoding="utf-8-sig", newline="")))
    extras = [r for r in matrix_rows if r["LoanID"] not in df_loans]

    inserts: list[str] = []
    skipped: list[dict] = []
    pending: list[dict] = []
    status_counter = {"fully paid": 0, "partially paid": 0}

    for r in extras:
        master_uuid = (r.get("MasterUUID") or "").strip()
        loan_code = (r.get("LoanCode") or "").strip()
        loan_id = (r.get("LoanID") or "").strip()
        loan_type = (r.get("LoanType") or "").strip()
        try:
            loan_amount = float(r.get("LoanAmount") or 0)
        except ValueError:
            skipped.append({"loan_code": loan_code, "reason": "bad LoanAmount"})
            continue
        try:
            actual_paid = float(r.get("Actual_Total_Paid") or 0)
        except ValueError:
            actual_paid = 0.0
        application_date = parse_date(r.get("ApplicationDate") or "")

        member_id = bridge.get(master_uuid)
        if not member_id:
            skipped.append({"loan_code": loan_code, "reason": f"member not in bridge: {master_uuid}"})
            continue

        type_id = LOAN_TYPE_ID.get(loan_type)
        if type_id is None:
            skipped.append({"loan_code": loan_code, "reason": f"unknown LoanType: {loan_type}"})
            continue

        if not application_date:
            pending.append({
                "LoanCode": loan_code,
                "LoanID": loan_id,
                "MasterUUID": master_uuid,
                "LoanAmount": loan_amount,
                "LoanType": loan_type,
                "ApplicationDate_raw": (r.get("ApplicationDate") or "").strip(),
                "LastName": r.get("LastName", ""),
                "FirstName": r.get("FirstName", ""),
                "reason": "ApplicationDate invalid; need real date",
            })
            continue

        loan_status = derive_loan_status(loan_amount, actual_paid)
        status_counter[loan_status] += 1

        raw_payload = {
            "legacy": True,
            "legacy_loan_uuid": loan_id,
            "legacy_loan_type": loan_type,
            "source": "Master_Analytical_Matrix",
            "actual_total_paid": round(actual_paid, 2),
        }

        values = (
            f"({sql_str(loan_code)}, "
            f"{sql_str(member_id)}, "
            f"{type_id}, "
            f"{loan_amount:.2f}, "
            f"{loan_amount:.2f}, "
            f"{sql_str(application_date)}::date, "
            f"{sql_str(loan_status)}, "
            f"{sql_str(loan_status)}, "
            f"'new', "
            f"{sql_jsonb(raw_payload)}, "
            f"{sql_str(application_date)}::timestamptz, "
            f"{sql_str(application_date)}::timestamptz)"
        )
        inserts.append(values)

    lines: list[str] = []
    lines.append("-- Bulk insert of the 31 extra historical loans from Master_Analytical_Matrix.csv")
    lines.append(f"-- Generated rows : {len(inserts)}")
    lines.append(f"-- Skipped rows   : {len(skipped)}")
    lines.append(f"-- Status split   : {status_counter}")
    lines.append(f"-- Source         : {MATRIX_CSV.name}")
    lines.append("--")
    lines.append("-- Run once in the Supabase SQL Editor.")
    lines.append("-- Idempotent: ON CONFLICT (control_number) DO NOTHING.")
    lines.append("-- Triggers bypassed via session_replication_role for this transaction.")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("SET LOCAL session_replication_role = 'replica';")
    lines.append("")
    lines.append("INSERT INTO public.loans (")
    lines.append("    control_number, member_id, loan_type_id,")
    lines.append("    loan_amount, principal_amount, application_date,")
    lines.append("    loan_status, application_status, application_type,")
    lines.append("    raw_payload, created_at, updated_at")
    lines.append(") VALUES")
    lines.append(",\n".join("    " + v for v in inserts))
    lines.append("ON CONFLICT (control_number) DO NOTHING;")
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")
    lines.append("-- Verify after commit:")
    lines.append("--   SELECT count(*) FROM public.loans WHERE raw_payload->>'legacy' = 'true';")
    lines.append("--     expected: 597 (566 already + 31 new)")
    lines.append("--   SELECT loan_status, count(*) FROM public.loans")
    lines.append("--     WHERE raw_payload->>'source' = 'Master_Analytical_Matrix' GROUP BY loan_status;")
    lines.append("")

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    # Write pending CSV
    if pending:
        with OUT_PENDING.open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(pending[0].keys()))
            w.writeheader()
            w.writerows(pending)

    print(f"Matrix loans         : {len(matrix_rows)}")
    print(f"Already in Supabase  : {len(df_loans)}")
    print(f"Extras (to migrate)  : {len(extras)}")
    print(f"Inserts emitted      : {len(inserts)}")
    print(f"Skipped              : {len(skipped)}")
    print(f"Pending date review  : {len(pending)} -> {OUT_PENDING.name}")
    print(f"Status split         : {status_counter}")
    if skipped:
        for s in skipped[:5]:
            print(f"  - skipped: {s['loan_code']}: {s['reason']}")
    if pending:
        for p in pending:
            print(f"  - pending: {p['LoanCode']} ({p['LastName']}, {p['FirstName']}) - {p['reason']}")
    print(f"\nOutput: {OUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
