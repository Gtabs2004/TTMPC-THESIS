"""See what's actually in the savings-related tables (any member)."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    for table in [
        "capital_build_up",
        "Savings_Transactions",
        "savings_transaction_queue",
        "savings",
        "member_savings",
        "savings_ledger",
        "normalized_savings",
    ]:
        try:
            r = sb.table(table).select("*").limit(2).execute()
            data = r.data or []
            print(f"=== {table}: {len(data)} sample rows ===")
            if data:
                print(f"  columns: {list(data[0].keys())}")
                for row in data:
                    print(f"  {row}")
            print()
        except Exception as e:
            print(f"=== {table}: ERROR -> {e}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
