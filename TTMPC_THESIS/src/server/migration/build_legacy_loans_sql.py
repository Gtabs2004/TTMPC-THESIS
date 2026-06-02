"""
Generate a single SQL file that bulk-inserts all 566 historical loans from
df_modeling_export (1).csv into public.loans, using the bridge to translate
CSV MasterUUID -> Supabase member.id.

Output:
  - legacy_loans_bulk_insert.sql

You then run that file once in the Supabase SQL Editor (or via psql with the
service role connection). It is idempotent: ON CONFLICT (control_number) DO
NOTHING, so re-running is safe.

Triggers are bypassed for the transaction via
    SET LOCAL session_replication_role = 'replica';
which only applies to the current transaction. Triggers re-enable on COMMIT.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent

LOAN_CSV = REPO / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
BRIDGE = HERE / "member_bridge_final.csv"
OUT_SQL = HERE / "legacy_loans_bulk_insert.sql"

LOAN_TYPE_ID = {
    "Consolidated": 1,
    "Emergency": 3,
}


def sql_str(value: str) -> str:
    """Single-quote a SQL string literal, escaping embedded quotes."""
    return "'" + value.replace("'", "''") + "'"


def sql_jsonb(obj: dict) -> str:
    """Cast a JSON object to jsonb literal."""
    return sql_str(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def main() -> int:
    if not LOAN_CSV.exists():
        print(f"ERROR: missing {LOAN_CSV}", file=sys.stderr)
        return 2
    if not BRIDGE.exists():
        print(f"ERROR: missing {BRIDGE}", file=sys.stderr)
        return 2

    # csv_uuid -> member_id
    bridge: dict[str, str] = {}
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bridge[row["csv_uuid"]] = row["member_id"]

    rows = list(csv.DictReader(LOAN_CSV.open("r", encoding="utf-8-sig", newline="")))

    inserts: list[str] = []
    skipped: list[dict] = []
    unknown_types: set[str] = set()

    for r in rows:
        master_uuid = (r.get("MasterUUID") or "").strip()
        loan_code = (r.get("LoanCode") or "").strip()
        loan_id = (r.get("LoanID") or "").strip()
        loan_amount_raw = (r.get("LoanAmount") or "").strip()
        application_date = (r.get("ApplicationDate") or "").strip()
        loan_type = (r.get("LoanType") or "").strip()

        member_id = bridge.get(master_uuid)
        if not member_id:
            skipped.append({"loan_code": loan_code, "reason": f"MasterUUID not in bridge: {master_uuid}"})
            continue

        type_id = LOAN_TYPE_ID.get(loan_type)
        if type_id is None:
            unknown_types.add(loan_type)
            skipped.append({"loan_code": loan_code, "reason": f"Unknown LoanType: {loan_type!r}"})
            continue

        try:
            loan_amount = float(loan_amount_raw)
        except ValueError:
            skipped.append({"loan_code": loan_code, "reason": f"Bad LoanAmount: {loan_amount_raw!r}"})
            continue

        if not application_date:
            skipped.append({"loan_code": loan_code, "reason": "Missing ApplicationDate"})
            continue

        raw_payload = {
            "legacy": True,
            "legacy_loan_uuid": loan_id,
            "legacy_loan_type": loan_type,
            "source": "df_modeling_export",
        }

        values = (
            f"({sql_str(loan_code)}, "                          # control_number
            f"{sql_str(member_id)}, "                            # member_id
            f"{type_id}, "                                       # loan_type_id
            f"{loan_amount:.2f}, "                               # loan_amount
            f"{loan_amount:.2f}, "                               # principal_amount
            f"{sql_str(application_date)}::date, "               # application_date
            f"'fully paid', "                                    # loan_status
            f"'fully paid', "                                    # application_status
            f"'new', "                                           # application_type
            f"{sql_jsonb(raw_payload)}, "                        # raw_payload
            f"{sql_str(application_date)}::timestamptz, "        # created_at
            f"{sql_str(application_date)}::timestamptz)"         # updated_at
        )
        inserts.append(values)

    # Build the SQL file.
    lines: list[str] = []
    lines.append("-- Bulk insert of historical loans from df_modeling_export (1).csv")
    lines.append(f"-- Generated rows : {len(inserts)}")
    lines.append(f"-- Skipped rows   : {len(skipped)}")
    lines.append(f"-- Source         : {LOAN_CSV.name}")
    lines.append(f"-- Bridge         : member_bridge_final.csv")
    lines.append("--")
    lines.append("-- Run once in the Supabase SQL Editor or via psql with the service role.")
    lines.append("-- Idempotent: ON CONFLICT (control_number) DO NOTHING.")
    lines.append("-- Triggers (CBU sync, email notifications) are bypassed via session_replication_role.")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")
    lines.append("-- Bypass triggers for this transaction only. Re-enables on COMMIT.")
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
    lines.append("-- Verify (run after the transaction commits):")
    lines.append("--   SELECT count(*) FROM public.loans WHERE raw_payload->>'legacy' = 'true';")
    lines.append("--   SELECT loan_type_id, count(*) FROM public.loans")
    lines.append("--     WHERE raw_payload->>'legacy' = 'true' GROUP BY loan_type_id;")
    lines.append("")

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    # Stats to stdout.
    print(f"Loan CSV rows   : {len(rows)}")
    print(f"Inserts emitted : {len(inserts)}")
    print(f"Skipped         : {len(skipped)}")
    if unknown_types:
        print(f"Unknown types   : {sorted(unknown_types)}")
    if skipped:
        print("First 5 skipped reasons:")
        for s in skipped[:5]:
            print(f"  - {s['loan_code']}: {s['reason']}")
    print(f"\nOutput: {OUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
