"""
Phase 2 (CSV variant): Emit a clean CSV of payments ready for the Supabase
Table Editor's "Import data from CSV" button on public.loan_payments_legacy.

Same filtering rules as build_legacy_payments_sql.py:
  - Skip if MasterUUID blank
  - Skip if LoanID not in canonical set (df_modeling_export OR Master_Analytical_Matrix)
  - Skip if member not in bridge
  - Skip if loan not yet in Supabase
  - Skip bad dates / amounts

Output:
  - legacy_payments_import.csv

How to load:
  1. Supabase Dashboard -> Table Editor -> loan_payments_legacy
  2. Click "Insert" -> "Import data from CSV"
  3. Upload legacy_payments_import.csv
  4. Map columns (names already match) and import.
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
OUT_CSV = HERE / "legacy_payments_import.csv"


def parse_bool(value: str) -> str:
    s = (value or "").strip().lower()
    return "true" if s in {"true", "1", "yes"} else "false"


def parse_int(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    try:
        return str(int(float(s)))
    except ValueError:
        return ""


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

    skip_blank_member = 0
    skip_excluded_loan = 0
    skip_member_not_in_bridge = 0
    skip_loan_not_in_supabase = 0
    skip_bad_date = 0
    skip_bad_amount = 0

    fieldnames = [
        "id", "payment_code", "loan_id", "member_id",
        "legacy_loan_uuid", "legacy_member_uuid",
        "amount_paid", "payment_date", "or_cdv_no", "is_overpayment",
        "application_date", "delta_days", "is_advance_payer",
        "manual_note_overpayment", "raw_payload",
    ]

    written = 0
    with OUT_CSV.open("w", encoding="utf-8", newline="") as out_fh:
        writer = csv.DictWriter(out_fh, fieldnames=fieldnames)
        writer.writeheader()

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
            delta_days = parse_int(r.get("delta_days") or "")
            or_cdv_no = (r.get("OR_CDV_No") or "").strip()
            is_overpay = parse_bool(r.get("Ledger_Note_Overpayment") or "")
            is_advance = parse_bool(r.get("is_advance_payer") or "")
            manual_overpay = parse_bool(r.get("manual_note_overpayment") or "")

            raw_payload = {
                "legacy": True,
                "source": "Normalized_Payments.csv",
                "legacy_payment_code": payment_code,
                "legacy_loan_uuid": legacy_loan_uuid,
            }

            writer.writerow({
                "id": payment_id,
                "payment_code": payment_code,
                "loan_id": control_number,
                "member_id": member_id,
                "legacy_loan_uuid": legacy_loan_uuid,
                "legacy_member_uuid": master_uuid,
                "amount_paid": f"{amount:.2f}",
                "payment_date": payment_date,
                "or_cdv_no": or_cdv_no,
                "is_overpayment": is_overpay,
                "application_date": application_date,
                "delta_days": delta_days,
                "is_advance_payer": is_advance,
                "manual_note_overpayment": manual_overpay,
                "raw_payload": json.dumps(raw_payload, ensure_ascii=False, separators=(",", ":")),
            })
            written += 1

    print(f"\nRows written: {written}")
    print(f"Skip: blank MasterUUID             : {skip_blank_member}")
    print(f"Skip: LoanID excluded by data team : {skip_excluded_loan}")
    print(f"Skip: Member not in bridge         : {skip_member_not_in_bridge}")
    print(f"Skip: LoanID not in Supabase yet   : {skip_loan_not_in_supabase}")
    print(f"Skip: bad PaymentDate              : {skip_bad_date}")
    print(f"Skip: bad AmountPaid               : {skip_bad_amount}")
    print(f"\nOutput: {OUT_CSV}")
    print("\nNext steps:")
    print("  1. Supabase Dashboard -> Table Editor -> loan_payments_legacy")
    print("  2. Insert -> Import data from CSV -> upload this file")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
