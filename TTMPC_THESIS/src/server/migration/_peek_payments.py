"""One-off: stats on Normalized_Payments.csv vs migrated loans + bridge.

Tells us:
- How many payments link to a Supabase loan
- How many link to a Supabase member
- Orphan counts (no link)
"""

import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

PAYMENTS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Normalized_Payments.csv"
MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
LOANS_CSV = REPO / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
BRIDGE = HERE / "member_bridge_final.csv"


def main() -> int:
    # ---- Bridge: csv_uuid -> member_id
    bridge: dict[str, str] = {}
    with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bridge[row["csv_uuid"]] = row["member_id"]
    print(f"Bridge entries (CSV member -> Supabase member.id): {len(bridge)}")

    # ---- Loan CSV: LoanID -> LoanCode (what we migrated)
    loan_csv: dict[str, str] = {}
    with LOANS_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            loan_csv[row["LoanID"]] = row["LoanCode"]
    print(f"Loans in df_modeling_export.csv (migrated to Supabase): {len(loan_csv)}")

    # ---- Master matrix: LoanID -> LoanCode (the new, fuller list)
    matrix: dict[str, dict] = {}
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            matrix[row["LoanID"]] = row
    print(f"Loans in Master_Analytical_Matrix.csv: {len(matrix)}")

    matrix_only = set(matrix.keys()) - set(loan_csv.keys())
    print(f"  Loans in matrix but NOT in df_modeling (need to insert): {len(matrix_only)}")

    # ---- Payments
    payment_rows = list(csv.DictReader(PAYMENTS_CSV.open("r", encoding="utf-8-sig", newline="")))
    print(f"\nPayment rows: {len(payment_rows)}")

    loan_ids = set()
    member_uuids = set()
    payments_per_loan: dict[str, int] = defaultdict(int)
    amount_parse_fail = 0
    date_parse_fail = 0

    for r in payment_rows:
        lid = r["LoanID"]
        mu = r["MasterUUID"]
        loan_ids.add(lid)
        member_uuids.add(mu)
        payments_per_loan[lid] += 1
        try:
            float(r["AmountPaid"])
        except (TypeError, ValueError):
            amount_parse_fail += 1
        if not r["PaymentDate"]:
            date_parse_fail += 1

    print(f"  Distinct LoanIDs in payments     : {len(loan_ids)}")
    print(f"  Distinct MasterUUIDs in payments : {len(member_uuids)}")
    print(f"  Amount parse failures             : {amount_parse_fail}")
    print(f"  Date parse failures               : {date_parse_fail}")

    # ---- Member orphans (using bridge as proxy)
    orphan_members = member_uuids - bridge.keys()
    orphan_member_rows = sum(1 for r in payment_rows if r["MasterUUID"] in orphan_members)
    print(f"\nMember orphan check (vs bridge):")
    print(f"  Distinct member UUIDs not in bridge: {len(orphan_members)} ({orphan_member_rows} rows)")
    if orphan_members:
        for mu in list(orphan_members)[:5]:
            sample = next(r for r in payment_rows if r["MasterUUID"] == mu)
            print(f"    {mu}  payments={payments_per_loan.get(sample['LoanID'], 0)}")

    # ---- Loan orphans (vs df_modeling, vs matrix)
    not_in_df = loan_ids - loan_csv.keys()
    not_in_matrix = loan_ids - matrix.keys()
    print(f"\nLoan orphan check:")
    print(f"  LoanIDs not in df_modeling (= not in Supabase yet): {len(not_in_df)}")
    print(f"  LoanIDs not in Master_Analytical_Matrix          : {len(not_in_matrix)}")

    if not_in_matrix:
        print("\n  First 5 LoanIDs missing from matrix (truly orphan):")
        for lid in list(not_in_matrix)[:5]:
            print(f"    {lid}  payments={payments_per_loan[lid]}")

    # ---- Cross-check live Supabase: how many legacy loans actually exist?
    print("\n--- Querying Supabase loans (raw_payload->>'legacy' = 'true') ---")
    supabase, _, _ = ac._load_runtime_config()
    legacy_by_uuid: dict[str, str] = {}
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
                legacy_by_uuid[uuid] = row["control_number"]
        if len(batch) < page:
            break
        offset += page

    print(f"  Legacy loans in Supabase: {len(legacy_by_uuid)}")

    matched = sum(1 for lid in loan_ids if lid in legacy_by_uuid)
    unmatched_in_sb = loan_ids - legacy_by_uuid.keys()
    print(f"  Payment LoanIDs that link to a Supabase loan: {matched}")
    print(f"  Payment LoanIDs missing from Supabase       : {len(unmatched_in_sb)}")

    # Payments that would be orphaned if we inserted right now
    orphan_payment_rows = sum(payments_per_loan[lid] for lid in unmatched_in_sb)
    print(f"  Payment rows that would be orphans          : {orphan_payment_rows}")

    if unmatched_in_sb:
        print("\n  First 10 unmatched LoanIDs:")
        for lid in list(unmatched_in_sb)[:10]:
            in_matrix = "matrix-yes" if lid in matrix else "matrix-no"
            in_df = "df-yes" if lid in loan_csv else "df-no"
            mrow = matrix.get(lid, {})
            code = mrow.get("LoanCode", "?")
            print(f"    {lid}  code={code}  payments={payments_per_loan[lid]}  [{in_matrix}, {in_df}]")

    print("\n=== Summary ===")
    print(f"To migrate payments cleanly we need to first add these to Supabase:")
    print(f"  - {len(unmatched_in_sb)} missing legacy loans ({orphan_payment_rows} dependent payments)")
    print(f"  - {len(orphan_members)} missing members? (probably 0 since bridge is complete)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
