"""Pick a couple of member accounts with rich legacy payment history for testing."""

import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    counts: Counter[str] = Counter()
    offset = 0
    page = 1000
    while True:
        resp = (
            sb.table("loan_payments_legacy")
            .select("member_id")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for r in batch:
            counts[r["member_id"]] += 1
        if len(batch) < page:
            break
        offset += page

    top = counts.most_common(5)
    print(f"Top members by legacy payment count:\n")
    for mid, n in top:
        m = (
            sb.table("member")
            .select("id, first_name, last_name, membership_id")
            .eq("id", mid)
            .execute()
        ).data or []
        if not m:
            print(f"  {mid}  ({n} payments)  [member row missing]")
            continue
        x = m[0]
        full = " ".join(p for p in [x.get("first_name"), x.get("last_name")] if p)
        print(f"  {full}")
        print(f"    member.id       = {x['id']}")
        print(f"    membership_id   = {x.get('membership_id')}")
        print(f"    legacy payments = {n}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
