"""Build a fresh member bridge from Cleaned_Members.csv.

Cleaned_Members.csv has the data team's authoritative pairing of:
  - MemberID    (Supabase membership_id, e.g. TTMPC-001)
  - MasterUUID  (the legacy uuid used in Master_Analytical_Matrix and Normalized_Payments)

We map MemberID -> Supabase member.id via the member table, then write a bridge
file (csv_uuid, member_id) the migration scripts can use.

Output:
  - member_bridge_cleaned.csv     (the new bridge)
  - bridge_unmatched.csv          (Cleaned_Members rows we could NOT resolve)
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

CLEANED = HERE / "Cleaned_Members.csv"
NORMALIZED = HERE / "Normalized_Profiles.csv"
OUT_BRIDGE = HERE / "member_bridge_cleaned.csv"
OUT_UNMATCHED = HERE / "bridge_unmatched.csv"


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    print("Loading Supabase members (membership_id -> id, name -> [ids])...")
    membership_to_id: dict[str, dict] = {}
    name_to_members: dict[tuple[str, str], list[dict]] = {}
    offset = 0
    page = 1000
    while True:
        resp = (
            sb.table("member")
            .select("id, membership_id, last_name, first_name")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for m in batch:
            mid = (m.get("membership_id") or "").strip()
            if mid:
                membership_to_id[mid.upper()] = m
            ln = (m.get("last_name") or "").strip().upper()
            fn = (m.get("first_name") or "").strip().upper()
            if ln and fn:
                name_to_members.setdefault((ln, fn), []).append(m)
        if len(batch) < page:
            break
        offset += page
    print(f"  Supabase members with membership_id: {len(membership_to_id)}")
    print(f"  Distinct (last,first) name pairs   : {len(name_to_members)}")

    bridge_rows: list[dict] = []
    unmatched: list[dict] = []
    blank_uuid = 0

    with CLEANED.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            member_code = (row.get("MemberID") or "").strip().upper()
            master_uuid = (row.get("MasterUUID") or "").strip()
            last = row.get("LastName", "")
            first = row.get("FirstName", "")

            if not master_uuid:
                blank_uuid += 1
                unmatched.append({
                    "MemberID": member_code,
                    "LastName": last,
                    "FirstName": first,
                    "reason": "blank MasterUUID in Cleaned_Members.csv",
                })
                continue

            sb_member = membership_to_id.get(member_code)
            if not sb_member:
                unmatched.append({
                    "MemberID": member_code,
                    "LastName": last,
                    "FirstName": first,
                    "reason": f"MemberID {member_code} not found in Supabase member.membership_id",
                })
                continue

            bridge_rows.append({
                "csv_uuid": master_uuid,
                "member_id": sb_member["id"],
                "ttmpc_id": member_code,
                "csv_last": last,
                "csv_first": first,
                "match_reason": "cleaned_members_authoritative",
            })

    # ---- Name fallback via Normalized_Profiles.csv ----
    # For MasterUUIDs not yet in the bridge, try to map by exact (last, first)
    # name match against Supabase -- but ONLY when exactly one Supabase member
    # has that name. Anything ambiguous goes on the punch list.
    name_fallback_hits = 0
    name_fallback_ambiguous = 0
    name_fallback_nomatch = 0
    have = {r["csv_uuid"] for r in bridge_rows}

    if NORMALIZED.exists():
        try:
            _probe = NORMALIZED.open("r", encoding="utf-8-sig", newline="")
            _probe.read(); _probe.close()
            _enc = "utf-8-sig"
        except UnicodeDecodeError:
            _enc = "cp1252"
        with NORMALIZED.open("r", encoding=_enc, newline="") as fh:
            for row in csv.DictReader(fh):
                mu = (row.get("membership_number_id") or "").strip()
                if not mu or mu in have:
                    continue
                ln = (row.get("LastName") or "").strip().upper()
                fn = (row.get("FirstName") or "").strip().upper()
                if not ln or not fn:
                    unmatched.append({
                        "MemberID": "",
                        "LastName": row.get("LastName", ""),
                        "FirstName": row.get("FirstName", ""),
                        "reason": f"Normalized_Profiles MasterUUID {mu}: missing name, cannot name-match",
                    })
                    name_fallback_nomatch += 1
                    continue
                candidates = name_to_members.get((ln, fn), [])
                if len(candidates) == 1:
                    sb_m = candidates[0]
                    bridge_rows.append({
                        "csv_uuid": mu,
                        "member_id": sb_m["id"],
                        "ttmpc_id": (sb_m.get("membership_id") or "").upper(),
                        "csv_last": row.get("LastName", ""),
                        "csv_first": row.get("FirstName", ""),
                        "match_reason": "name_fallback_unique",
                    })
                    have.add(mu)
                    name_fallback_hits += 1
                elif len(candidates) > 1:
                    unmatched.append({
                        "MemberID": "",
                        "LastName": row.get("LastName", ""),
                        "FirstName": row.get("FirstName", ""),
                        "reason": f"Normalized_Profiles MasterUUID {mu}: ambiguous, {len(candidates)} Supabase members match name",
                    })
                    name_fallback_ambiguous += 1
                else:
                    unmatched.append({
                        "MemberID": "",
                        "LastName": row.get("LastName", ""),
                        "FirstName": row.get("FirstName", ""),
                        "reason": f"Normalized_Profiles MasterUUID {mu}: no Supabase member with this name",
                    })
                    name_fallback_nomatch += 1

    print(f"  Name fallback: hit={name_fallback_hits} ambiguous={name_fallback_ambiguous} no-match={name_fallback_nomatch}")

    # Dedupe by csv_uuid (last write wins) since matrix joins by csv_uuid
    by_uuid: dict[str, dict] = {}
    for r in bridge_rows:
        by_uuid[r["csv_uuid"]] = r
    final = list(by_uuid.values())

    with OUT_BRIDGE.open("w", encoding="utf-8", newline="") as fh:
        fields = ["csv_uuid", "member_id", "ttmpc_id", "csv_last", "csv_first", "match_reason"]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(final)

    with OUT_UNMATCHED.open("w", encoding="utf-8", newline="") as fh:
        fields = ["MemberID", "LastName", "FirstName", "reason"]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(unmatched)

    print(f"\nBridge written : {len(final)} rows -> {OUT_BRIDGE.name}")
    print(f"  (blank MasterUUID in Cleaned_Members: {blank_uuid})")
    print(f"Unmatched      : {len(unmatched)} rows -> {OUT_UNMATCHED.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
