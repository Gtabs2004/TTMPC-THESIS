"""Find the account_number -> member link table."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    for table in [
        "savings_accounts",
        "savings_account",
        "savings_book",
        "savings_books",
        "savings_master",
        "member_savings_account",
        "savings_account_master",
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
            msg = str(e)
            if "Could not find" in msg or "schema cache" in msg:
                print(f"=== {table}: (does not exist)\n")
            else:
                print(f"=== {table}: ERROR -> {e}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
