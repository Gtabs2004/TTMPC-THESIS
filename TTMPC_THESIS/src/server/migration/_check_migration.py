"""Verify the legacy payments migration landed in Supabase."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    total = 0
    offset = 0
    page = 1000
    sample = []
    while True:
        resp = (
            sb.table("loan_payments_legacy")
            .select("id, loan_id, member_id, amount_paid, payment_date")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        total += len(batch)
        if not sample:
            sample = batch[:3]
        if len(batch) < page:
            break
        offset += page

    print(f"loan_payments_legacy total rows: {total}  (expected: 6045)")
    print("\nFirst 3 rows:")
    for r in sample:
        print(f"  loan_id={r['loan_id']}  member_id={r['member_id'][:8]}..  amount={r['amount_paid']}  date={r['payment_date']}")

    # Check the SOA view picks them up
    soa_total = 0
    offset = 0
    while True:
        resp = (
            sb.table("member_statement_of_account")
            .select("payment_id")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        soa_total += len(batch)
        if len(batch) < page:
            break
        offset += page
    print(f"\nmember_statement_of_account total rows: {soa_total}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
