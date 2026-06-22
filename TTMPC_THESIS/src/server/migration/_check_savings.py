"""Check what savings data exists for a specific member."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

MEMBERSHIP_ID = sys.argv[1] if len(sys.argv) > 1 else "TTMPC-212"


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    m = (
        sb.table("member")
        .select("id, first_name, last_name, membership_id")
        .eq("membership_id", MEMBERSHIP_ID)
        .execute()
    ).data or []
    if not m:
        print(f"No member with membership_id={MEMBERSHIP_ID}")
        return 1
    member = m[0]
    member_id = member["id"]
    print(f"Member: {member['first_name']} {member['last_name']}  id={member_id}  membership_id={MEMBERSHIP_ID}")

    cbu = (
        sb.table("capital_build_up")
        .select("starting_share_capital, ending_share_capital, capital_added, transaction_date")
        .eq("member_id", member_id)
        .order("transaction_date", desc=True)
        .execute()
    ).data or []
    print(f"\ncapital_build_up rows: {len(cbu)}")
    for r in cbu[:3]:
        print(f"  start={r.get('starting_share_capital')}  end={r.get('ending_share_capital')}  added={r.get('capital_added')}  date={r.get('transaction_date')}")

    try:
        st = (
            sb.table("Savings_Transactions")
            .select("Savings_ID, Account_Number, Balance, Savings_Amount, Amount, created_at, membership_number_id")
            .eq("membership_number_id", MEMBERSHIP_ID)
            .execute()
        ).data or []
        print(f"\nSavings_Transactions rows for membership_id={MEMBERSHIP_ID}: {len(st)}")
        for r in st[:3]:
            print(f"  {r}")
    except Exception as e:
        print(f"Savings_Transactions query error: {e}")

    try:
        q = (
            sb.table("savings_transaction_queue")
            .select("transaction_id, transaction_type, amount, transaction_status, requested_at")
            .eq("membership_number_id", MEMBERSHIP_ID)
            .execute()
        ).data or []
        print(f"\nsavings_transaction_queue rows: {len(q)}")
        for r in q[:3]:
            print(f"  {r}")
    except Exception as e:
        print(f"savings_transaction_queue query error: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
