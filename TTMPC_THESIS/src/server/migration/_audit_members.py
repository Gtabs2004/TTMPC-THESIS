"""Audit Supabase members vs the official Cleaned_Members.csv.
Classifies each Supabase member as:
  - official_member: matched to Cleaned_Members.csv (by MasterUUID or by name)
  - dummy_member: not in CSV, has no real loans
  - legacy_unofficial: not in CSV but has at least one loan record (likely
                      non-member / retired / terminated; was historically lent to)
"""

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

CLEANED = HERE / "Cleaned_Members.csv"


def main() -> int:
    official_master_uuids: set[str] = set()
    official_membership_ids: set[str] = set()
    official_name_keys: set[str] = set()
    with CLEANED.open("r", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            mu = (r.get("MasterUUID") or "").strip()
            mid = (r.get("MemberID") or "").strip()
            mk = (r.get("match_key") or "").strip().upper()
            if mu:
                official_master_uuids.add(mu)
            if mid:
                official_membership_ids.add(mid)
            if mk:
                official_name_keys.add(mk)
    print(f"Official members in CSV: {len(official_master_uuids)} MasterUUIDs, {len(official_membership_ids)} MemberIDs")

    sb, _, _ = ac._load_runtime_config()

    members = []
    offset = 0
    page = 1000
    while True:
        r = (
            sb.table("member")
            .select("id, first_name, last_name, membership_id, created_at")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = r.data or []
        if not batch:
            break
        members.extend(batch)
        if len(batch) < page:
            break
        offset += page
    print(f"Supabase member rows: {len(members)}")

    member_ids_with_loans: set[str] = set()
    offset = 0
    while True:
        r = (
            sb.table("loans")
            .select("member_id")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = r.data or []
        if not batch:
            break
        for row in batch:
            if row.get("member_id"):
                member_ids_with_loans.add(row["member_id"])
        if len(batch) < page:
            break
        offset += page
    print(f"Supabase member ids that own at least one loan: {len(member_ids_with_loans)}")

    official_loaders = 0
    dummy_no_loan = 0
    dummy_with_loan = 0
    legacy_unofficial = []
    official_no_loan = 0

    for m in members:
        mid = (m.get("membership_id") or "").strip()
        name_key = f"{(m.get('last_name') or '').strip().upper()}_{(m.get('first_name') or '').strip().upper()}"
        is_official = mid in official_membership_ids or name_key in official_name_keys
        has_loan = m["id"] in member_ids_with_loans

        if is_official and has_loan:
            official_loaders += 1
        elif is_official and not has_loan:
            official_no_loan += 1
        elif not is_official and has_loan:
            legacy_unofficial.append(m)
        else:
            dummy_no_loan += 1

    print()
    print("=== Classification ===")
    print(f"  Official members WITH loans     : {official_loaders}")
    print(f"  Official members no loans       : {official_no_loan}")
    print(f"  Legacy unofficial (has loan)    : {len(legacy_unofficial)}  <- non-member / retired / terminated")
    print(f"  Dummy / test (no loan, no CSV)  : {dummy_no_loan}")
    print()
    if legacy_unofficial:
        print("Sample legacy unofficial members:")
        for m in legacy_unofficial[:10]:
            print(f"  {m['membership_id']:<15}  {m.get('first_name')} {m.get('last_name')}")

    out = HERE / "member_classification.csv"
    with out.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["member_id", "membership_id", "first_name", "last_name", "classification", "has_loan", "created_at"])
        for m in members:
            mid = (m.get("membership_id") or "").strip()
            name_key = f"{(m.get('last_name') or '').strip().upper()}_{(m.get('first_name') or '').strip().upper()}"
            is_official = mid in official_membership_ids or name_key in official_name_keys
            has_loan = m["id"] in member_ids_with_loans
            if is_official:
                cls = "official"
            elif has_loan:
                cls = "legacy_unofficial"
            else:
                cls = "dummy"
            w.writerow([m["id"], mid, m.get("first_name"), m.get("last_name"), cls, has_loan, m.get("created_at")])
    print(f"\nWrote: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
