"""
Phase 2: Migrate clean payments from Normalized_Payments.csv into the
new loan_payments_legacy table.

Skip rules:
  - Skip if MasterUUID is blank (no member assigned).
  - Skip if LoanID is not in the canonical loan set (df_modeling_export
    OR Master_Analytical_Matrix), so we link only to loans we migrated.

Bridge:
  - CSV MasterUUID -> Supabase member.id (from member_bridge_final.csv).
  - CSV LoanID -> Supabase control_number (resolved live from Supabase).

Output:
  - legacy_payments_bulk_insert.sql  (paste into Supabase SQL Editor)
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

PAYMENTS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Normalized_Payments.csv"
MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
DF_CSV = REPO / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
BRIDGE = HERE / "member_bridge_final.csv"
OUT_SQL = HERE / "legacy_payments_bulk_insert.sql"

# Cap inserts per chunk so the SQL file is easier on the editor.
CHUNK_SIZE = 50


def sql_str(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def sql_jsonb(obj: dict) -> str:
    return sql_str(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def sql_bool(value: str) -> str:
    s = (value or "").strip().lower()
    return "TRUE" if s in {"true", "1", "yes"} else "FALSE"


def parse_int(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return "NULL"
    try:
        return str(int(float(s)))
    except ValueError:
        return "NULL"


def parse_date(value: str) -> str:
    s = (value or "").strip().split(" ")[0]
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return s
    return ""


def main() -> int:
    bridge: dict[str, str] = {}
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bridge[row["csv_uuid"]] = row["member_id"]

    canonical_loan_uuids: set[str] = set()
    with DF_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            canonical_loan_uuids.add(row["LoanID"])
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            canonical_loan_uuids.add(row["LoanID"])
    print(f"Canonical loan UUIDs (df + matrix): {len(canonical_loan_uuids)}")

    # Resolve Supabase legacy loans: legacy_loan_uuid -> control_number
    print("Querying Supabase for loan UUID -> control_number map...")
    supabase, _, _ = ac._load_runtime_config()
    legacy_map: dict[str, str] = {}
    offset = 0
    page = 1000
    while True:
        resp = (
            supabase.table("loans")
            .select("control_number, raw_payload")
            .filter("raw_payload->>legacy", "eq", "true")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for row in batch:
            rp = row.get("raw_payload") or {}
            uuid = rp.get("legacy_loan_uuid") if isinstance(rp, dict) else None
            if uuid:
                legacy_map[uuid] = row["control_number"]
        if len(batch) < page:
            break
        offset += page
    print(f"Legacy loans now in Supabase: {len(legacy_map)}")

    payment_rows = list(csv.DictReader(PAYMENTS_CSV.open("r", encoding="utf-8-sig", newline="")))
    print(f"Payment rows in CSV: {len(payment_rows)}")

    inserts: list[str] = []
    skip_blank_member = 0
    skip_unknown_loan = 0
    skip_loan_not_in_supabase = 0
    skip_member_not_in_bridge = 0
    skip_bad_date = 0
    skip_bad_amount = 0
    skip_excluded_loan = 0

    for r in payment_rows:
        legacy_loan_uuid = (r.get("LoanID") or "").strip()
        master_uuid = (r.get("MasterUUID") or "").strip()
        payment_id = (r.get("PaymentID") or "").strip()
        payment_code = (r.get("PaymentCode") or "").strip()

        if not master_uuid:
            skip_blank_member += 1
            continue
        if legacy_loan_uuid not in canonical_loan_uuids:
            skip_excluded_loan += 1
            continue

        member_id = bridge.get(master_uuid)
        if not member_id:
            skip_member_not_in_bridge += 1
            continue

        control_number = legacy_map.get(legacy_loan_uuid)
        if not control_number:
            skip_loan_not_in_supabase += 1
            continue

        payment_date = parse_date(r.get("PaymentDate") or "")
        if not payment_date:
            skip_bad_date += 1
            continue

        try:
            amount = float(r.get("AmountPaid") or 0)
        except ValueError:
            skip_bad_amount += 1
            continue

        application_date = parse_date(r.get("ApplicationDate") or "")
        application_date_sql = f"{sql_str(application_date)}::date" if application_date else "NULL"
        delta_days = parse_int(r.get("delta_days") or "")
        or_cdv_no = (r.get("OR_CDV_No") or "").strip()
        is_overpay = sql_bool(r.get("Ledger_Note_Overpayment") or "")
        is_advance = sql_bool(r.get("is_advance_payer") or "")
        manual_overpay = sql_bool(r.get("manual_note_overpayment") or "")

        raw_payload = {
            "legacy": True,
            "source": "Normalized_Payments.csv",
            "legacy_payment_code": payment_code,
            "legacy_loan_uuid": legacy_loan_uuid,
        }

        values = (
            f"({sql_str(payment_id)}, "
            f"{sql_str(payment_code)}, "
            f"{sql_str(control_number)}, "
            f"{sql_str(member_id)}, "
            f"{sql_str(legacy_loan_uuid)}, "
            f"{sql_str(master_uuid)}, "
            f"{amount:.2f}, "
            f"{sql_str(payment_date)}::date, "
            f"{sql_str(or_cdv_no)}, "
            f"{is_overpay}, "
            f"{application_date_sql}, "
            f"{delta_days}, "
            f"{is_advance}, "
            f"{manual_overpay}, "
            f"{sql_jsonb(raw_payload)})"
        )
        inserts.append(values)

    # Build SQL file in chunks
    lines: list[str] = []
    lines.append("-- Bulk insert of clean payments from Normalized_Payments.csv")
    lines.append(f"-- Source rows           : {len(payment_rows)}")
    lines.append(f"-- Generated inserts     : {len(inserts)}")
    lines.append(f"-- Skip: blank MasterUUID            : {skip_blank_member}")
    lines.append(f"-- Skip: LoanID excluded by data team: {skip_excluded_loan}")
    lines.append(f"-- Skip: LoanID not in Supabase yet  : {skip_loan_not_in_supabase}")
    lines.append(f"-- Skip: Member not in bridge        : {skip_member_not_in_bridge}")
    lines.append(f"-- Skip: bad PaymentDate              : {skip_bad_date}")
    lines.append(f"-- Skip: bad AmountPaid               : {skip_bad_amount}")
    lines.append("--")
    lines.append("-- Run AFTER loan_payments_legacy_schema.sql.")
    lines.append("-- Idempotent: ON CONFLICT (id) DO NOTHING.")
    lines.append("-- Paste ONE chunk at a time into the Supabase SQL Editor.")
    lines.append("-- Each chunk is self-contained (sets session_replication_role locally).")
    lines.append("")

    cols = (
        "id, payment_code, loan_id, member_id, legacy_loan_uuid, legacy_member_uuid,"
        " amount_paid, payment_date, or_cdv_no, is_overpayment,"
        " application_date, delta_days, is_advance_payer, manual_note_overpayment, raw_payload"
    )

    total_chunks = (len(inserts) + CHUNK_SIZE - 1) // CHUNK_SIZE
    for i in range(0, len(inserts), CHUNK_SIZE):
        chunk = inserts[i : i + CHUNK_SIZE]
        chunk_no = i // CHUNK_SIZE + 1
        lines.append(f"-- ===== chunk {chunk_no} of {total_chunks} =====")
        lines.append("BEGIN;")
        lines.append("SET LOCAL session_replication_role = 'replica';")
        lines.append(f"INSERT INTO public.loan_payments_legacy ({cols}) VALUES")
        lines.append(",\n".join("    " + v for v in chunk))
        lines.append("ON CONFLICT (id) DO NOTHING;")
        lines.append("COMMIT;")
        lines.append("")

    lines.append("-- Verify after commit:")
    lines.append("--   SELECT count(*) FROM public.loan_payments_legacy;")
    lines.append(f"--     expected: {len(inserts)}")
    lines.append("--   SELECT loan_id, count(*) FROM public.loan_payments_legacy")
    lines.append("--     GROUP BY loan_id ORDER BY count(*) DESC LIMIT 5;")
    lines.append("")

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    print(f"\nInserts emitted: {len(inserts)}")
    print(f"Skip: blank MasterUUID             : {skip_blank_member}")
    print(f"Skip: LoanID excluded by data team : {skip_excluded_loan}")
    print(f"Skip: LoanID not in Supabase yet   : {skip_loan_not_in_supabase}")
    print(f"Skip: Member not in bridge         : {skip_member_not_in_bridge}")
    print(f"Skip: bad PaymentDate              : {skip_bad_date}")
    print(f"Skip: bad AmountPaid               : {skip_bad_amount}")
    print(f"\nOutput: {OUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
