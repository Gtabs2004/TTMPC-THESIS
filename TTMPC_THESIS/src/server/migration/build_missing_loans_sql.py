"""
Generate SQL to insert the 178 historical loans that are in
Normalized_Loan_Applications.csv but not yet in Supabase.

  - 31 loans: have a real MasterUUID -> link to actual member via bridge
  - 147 loans: have blank MasterUUID -> link to placeholder member

Also writes an audit CSV that lists every loan needing reassignment so the
team can fill in the real member later.

Outputs:
  - missing_loans_bulk_insert.sql
  - orphan_loans_audit.csv
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent

NEW_BASELINE = HERE / "Normalized_Loan_Applications.csv"
BRIDGE = HERE / "member_bridge_final.csv"
PLACEHOLDER_ID_FILE = HERE / "placeholder_member_id.txt"
DATA_LOANS_SQL = REPO / "src" / "data" / "loans_rows.sql"

OUT_SQL = HERE / "missing_loans_bulk_insert.sql"
OUT_AUDIT = HERE / "orphan_loans_audit.csv"

LOAN_TYPE_ID = {
    "Consolidated": 1,
    "Emergency": 3,
}


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_jsonb(obj: dict) -> str:
    return sql_str(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def main() -> int:
    if not PLACEHOLDER_ID_FILE.exists():
        print("ERROR: run insert_placeholder_member.py first.", file=sys.stderr)
        return 2

    placeholder_member_id = PLACEHOLDER_ID_FILE.read_text(encoding="utf-8").strip()
    print(f"Placeholder member id: {placeholder_member_id}")

    # Bridge: csv_uuid -> member_id
    bridge: dict[str, str] = {}
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bridge[row["csv_uuid"]] = row["member_id"]
    print(f"Bridge entries: {len(bridge)}")

    # Currently in Supabase (parse from loans_rows.sql)
    already_in_supabase: set[str] = set()
    text = DATA_LOANS_SQL.read_text(encoding="utf-8")
    for m in re.finditer(r"'(TTMPCL-\d+)'", text):
        already_in_supabase.add(m.group(1))
    print(f"Loans already in Supabase: {len(already_in_supabase)}")

    # Read baseline + keep only what's missing
    baseline_rows = list(csv.DictReader(NEW_BASELINE.open("r", encoding="utf-8-sig", newline="")))
    missing = [r for r in baseline_rows if r["LoanCode"] not in already_in_supabase]
    print(f"Baseline loans   : {len(baseline_rows)}")
    print(f"Missing to insert: {len(missing)}")

    inserts: list[str] = []
    audit_rows: list[dict] = []
    skipped: list[dict] = []
    n_real = 0
    n_placeholder = 0

    for r in missing:
        loan_code = r["LoanCode"].strip()
        loan_id = r["LoanID"].strip()
        master_uuid = (r["MasterUUID"] or "").strip()
        amount_raw = r["LoanAmount"].strip()
        application_date = r["ApplicationDate"].strip().split(" ")[0]
        loan_type = r["LoanType"].strip()

        type_id = LOAN_TYPE_ID.get(loan_type)
        if type_id is None:
            skipped.append({"loan_code": loan_code, "reason": f"Unknown LoanType: {loan_type!r}"})
            continue

        try:
            loan_amount = float(amount_raw)
        except ValueError:
            skipped.append({"loan_code": loan_code, "reason": f"Bad LoanAmount: {amount_raw!r}"})
            continue

        if not application_date:
            skipped.append({"loan_code": loan_code, "reason": "Missing ApplicationDate"})
            continue

        # Decide member: real or placeholder.
        if master_uuid and master_uuid in bridge:
            member_id = bridge[master_uuid]
            needs_assignment = False
            n_real += 1
        else:
            member_id = placeholder_member_id
            needs_assignment = True
            n_placeholder += 1
            audit_rows.append({
                "control_number": loan_code,
                "legacy_loan_uuid": loan_id,
                "loan_amount": f"{loan_amount:.2f}",
                "application_date": application_date,
                "loan_type": loan_type,
                "legacy_master_uuid_blank": "true",
                "assigned_member_uuid": "",  # human fills this in later
                "notes": "",
            })

        raw_payload = {
            "legacy": True,
            "legacy_loan_uuid": loan_id,
            "legacy_loan_type": loan_type,
            "legacy_master_uuid": master_uuid,
            "source": "Normalized_Loan_Applications",
            "needs_borrower_assignment": needs_assignment,
        }

        values = (
            f"({sql_str(loan_code)}, "
            f"{sql_str(member_id)}, "
            f"{type_id}, "
            f"{loan_amount:.2f}, "
            f"{loan_amount:.2f}, "
            f"{sql_str(application_date)}::date, "
            f"'fully paid', "
            f"'fully paid', "
            f"'new', "
            f"{sql_jsonb(raw_payload)}, "
            f"{sql_str(application_date)}::timestamptz, "
            f"{sql_str(application_date)}::timestamptz)"
        )
        inserts.append(values)

    # SQL file
    lines: list[str] = []
    lines.append("-- Insert the 178 historical loans missing from Supabase.")
    lines.append(f"-- Generated   : {len(inserts)} inserts")
    lines.append(f"--   with real member        : {n_real}")
    lines.append(f"--   to placeholder member   : {n_placeholder}  (needs_borrower_assignment=true)")
    lines.append(f"-- Skipped     : {len(skipped)}")
    lines.append(f"-- Source      : Normalized_Loan_Applications.csv")
    lines.append(f"-- Placeholder : TTMPC-294 ({placeholder_member_id})")
    lines.append("--")
    lines.append("-- Idempotent via ON CONFLICT. Triggers bypassed for the transaction.")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")
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
    lines.append("--   SELECT count(*) FROM public.loans WHERE raw_payload->>'legacy' = 'true';  -- expect 744")
    lines.append("--   SELECT count(*) FROM public.loans WHERE raw_payload->>'needs_borrower_assignment' = 'true';  -- expect 147")
    lines.append("")
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    # Audit CSV
    if audit_rows:
        keys = list(audit_rows[0].keys())
        with OUT_AUDIT.open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=keys)
            w.writeheader()
            w.writerows(audit_rows)

    print(f"\nResults:")
    print(f"  Inserts                    : {len(inserts)}")
    print(f"    real member              : {n_real}")
    print(f"    placeholder member       : {n_placeholder}")
    print(f"  Skipped                    : {len(skipped)}")
    if skipped:
        for s in skipped[:5]:
            print(f"    - {s}")
    print(f"\nOutputs:")
    print(f"  {OUT_SQL.name}")
    print(f"  {OUT_AUDIT.name}  ({len(audit_rows)} rows for borrower reassignment)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
