"""Produce two CSVs to send to the data cleaner.

Outputs:
  - orphan_loans_for_review.csv
  - orphan_member_for_review.csv
"""

import csv
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

PAYMENTS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Normalized_Payments.csv"
MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
BRIDGE = HERE / "member_bridge_final.csv"

OUT_ORPHAN_LOANS = HERE / "orphan_loans_for_review.csv"
OUT_ORPHAN_MEMBER = HERE / "orphan_member_for_review.csv"


def main() -> int:
    # Bridge: csv member UUID -> known
    known_member_uuids: set[str] = set()
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            known_member_uuids.add(row["csv_uuid"])

    # Matrix: LoanIDs we know analytically
    matrix_loans: set[str] = set()
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            matrix_loans.add(row["LoanID"])

    # Supabase: legacy loans we already migrated (by legacy_loan_uuid)
    print("Querying Supabase for legacy loan UUIDs...")
    supabase, _, _ = ac._load_runtime_config()
    legacy_supabase: set[str] = set()
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
        for r in batch:
            rp = r.get("raw_payload") or {}
            uuid = rp.get("legacy_loan_uuid") if isinstance(rp, dict) else None
            if uuid:
                legacy_supabase.add(uuid)
        if len(batch) < page:
            break
        offset += page
    print(f"  legacy loans in Supabase: {len(legacy_supabase)}")

    # Walk payments
    payment_rows = list(csv.DictReader(PAYMENTS_CSV.open("r", encoding="utf-8-sig", newline="")))
    print(f"Payment rows: {len(payment_rows)}")

    # For orphan loans: LoanID exists in payments but not in (matrix OR Supabase)
    loan_payment_count: dict[str, int] = defaultdict(int)
    loan_first_payment: dict[str, str] = {}
    loan_member: dict[str, str] = {}
    loan_application_date: dict[str, str] = {}

    for r in payment_rows:
        lid = r["LoanID"]
        loan_payment_count[lid] += 1
        if lid not in loan_first_payment or r["PaymentDate"] < loan_first_payment[lid]:
            loan_first_payment[lid] = r["PaymentDate"]
        loan_member[lid] = r["MasterUUID"]
        loan_application_date[lid] = r["ApplicationDate"]

    orphan_loans = [
        lid for lid in loan_payment_count
        if lid not in matrix_loans and lid not in legacy_supabase
    ]
    print(f"Orphan loans (not in matrix AND not in Supabase): {len(orphan_loans)}")

    # For orphan member: distinct MasterUUIDs in payments NOT in our bridge
    orphan_members = {
        r["MasterUUID"] for r in payment_rows
        if r["MasterUUID"] not in known_member_uuids
    }
    print(f"Orphan members (in payments, not in MembersProfile.csv): {len(orphan_members)}")

    # Write orphan loans CSV
    orphan_loans_sorted = sorted(orphan_loans, key=lambda x: -loan_payment_count[x])
    with OUT_ORPHAN_LOANS.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow([
            "LoanID",
            "MasterUUID_of_member",
            "ApplicationDate",
            "first_payment_date",
            "payment_count",
            "notes",
        ])
        for lid in orphan_loans_sorted:
            w.writerow([
                lid,
                loan_member.get(lid, ""),
                loan_application_date.get(lid, ""),
                loan_first_payment.get(lid, ""),
                loan_payment_count.get(lid, 0),
                "Please add to Master_Analytical_Matrix.csv or mark as excluded",
            ])

    # Write orphan member CSV
    with OUT_ORPHAN_MEMBER.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow([
            "MasterUUID",
            "distinct_loan_count",
            "total_payment_count",
            "first_loan_application_date",
            "sample_LoanID_1",
            "sample_LoanID_2",
            "sample_LoanID_3",
            "notes",
        ])
        for mu in orphan_members:
            their_loans = [lid for lid, mid in loan_member.items() if mid == mu]
            their_loans.sort(key=lambda x: loan_application_date.get(x, ""))
            their_payment_count = sum(loan_payment_count[lid] for lid in their_loans)
            first_date = min(
                (loan_application_date.get(lid, "") for lid in their_loans),
                default="",
            )
            w.writerow([
                mu,
                len(their_loans),
                their_payment_count,
                first_date,
                their_loans[0] if len(their_loans) > 0 else "",
                their_loans[1] if len(their_loans) > 1 else "",
                their_loans[2] if len(their_loans) > 2 else "",
                "Please add this member's info to MembersProfile.csv (last name, first name, middle name, etc.)",
            ])

    print(f"\nWrote:")
    print(f"  {OUT_ORPHAN_LOANS.name}  ({len(orphan_loans)} rows)")
    print(f"  {OUT_ORPHAN_MEMBER.name}  ({len(orphan_members)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
