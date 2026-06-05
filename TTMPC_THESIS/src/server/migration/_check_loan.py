"""Diagnose a single loan: is it in Supabase? does it have payments (live + legacy)?"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

TARGET = sys.argv[1] if len(sys.argv) > 1 else "TTMPC-131"


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    loan = (
        sb.table("loans")
        .select("control_number, member_id, loan_type_id, loan_amount, principal_amount, loan_status, raw_payload")
        .eq("control_number", TARGET)
        .execute()
    ).data or []
    print(f"loans rows for {TARGET}: {len(loan)}")
    for l in loan:
        print(f"  member_id={l['member_id']}  amount={l['loan_amount']}  status={l['loan_status']}")
        rp = l.get("raw_payload") or {}
        print(f"  raw_payload.legacy={rp.get('legacy')}  legacy_loan_uuid={rp.get('legacy_loan_uuid')}")

    live = (
        sb.table("loan_payments")
        .select("id, payment_date, amount_paid, confirmation_status")
        .eq("loan_id", TARGET)
        .execute()
    ).data or []
    print(f"\nlive loan_payments: {len(live)}")
    for p in live[:5]:
        print(f"  {p['payment_date']}  {p['amount_paid']}  {p['confirmation_status']}")

    legacy = (
        sb.table("loan_payments_legacy")
        .select("id, payment_date, amount_paid, legacy_loan_uuid")
        .eq("loan_id", TARGET)
        .execute()
    ).data or []
    print(f"\nlegacy loan_payments_legacy: {len(legacy)}")
    for p in legacy[:5]:
        print(f"  {p['payment_date']}  {p['amount_paid']}")

    soa = (
        sb.table("member_statement_of_account")
        .select("payment_date, principal_paid, reference_id")
        .eq("control_number", TARGET)
        .execute()
    ).data or []
    print(f"\nmember_statement_of_account rows: {len(soa)}")
    for r in soa[:5]:
        print(f"  {r['payment_date']}  {r['principal_paid']}  ref={r['reference_id']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
