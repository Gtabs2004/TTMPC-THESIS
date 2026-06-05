"""Produce two reports for the data cleaner.

1. members_blank_masteruuid.csv
   Rows in MembersProfile.csv that have NO MasterUUID.
   These members cannot be linked to any loan/payment until MasterUUID is filled.

2. supabase_members_no_loans.csv
   Members that exist in Supabase but have ZERO rows in public.loans.
   Cross-referenced against MembersProfile so the cleaner knows the MasterUUID
   (or lack thereof) and against Master_Analytical_Matrix to see if loans
   should be added there.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

MEMBERS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "MembersProfile.csv"
MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"

OUT_BLANK = HERE / "members_blank_masteruuid.csv"
OUT_NOLOANS = HERE / "supabase_members_no_loans.csv"


def norm(s: str) -> str:
    return (s or "").strip().upper()


def main() -> int:
    # ---------- Report 1: blank MasterUUID in MembersProfile ----------
    blank_rows: list[dict] = []
    profile_by_name: dict[tuple[str, str], dict] = {}
    with MEMBERS_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            uuid = (row.get("MasterUUID") or "").strip()
            key = (norm(row.get("LastName")), norm(row.get("FirstName")))
            profile_by_name[key] = row
            if not uuid:
                blank_rows.append({
                    "LastName": row.get("LastName", ""),
                    "FirstName": row.get("FirstName", ""),
                    "MiddleName": row.get("MiddleName", ""),
                    "Reason": "MasterUUID is blank in MembersProfile.csv -- please fill in so loans can be linked",
                })

    with OUT_BLANK.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["LastName", "FirstName", "MiddleName", "Reason"])
        w.writeheader()
        w.writerows(blank_rows)
    print(f"Report 1 (blank MasterUUID): {len(blank_rows)} rows -> {OUT_BLANK.name}")

    # ---------- Matrix coverage by name (for cross-reference) ----------
    matrix_by_name: dict[tuple[str, str], int] = {}
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            key = (norm(row.get("LastName")), norm(row.get("FirstName")))
            matrix_by_name[key] = matrix_by_name.get(key, 0) + 1

    # ---------- Supabase: members + their loan counts ----------
    print("Querying Supabase members...")
    sb, _, _ = ac._load_runtime_config()

    members: list[dict] = []
    offset = 0
    page = 1000
    while True:
        resp = (
            sb.table("member")
            .select("id, last_name, first_name, membership_id")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        members.extend(batch)
        if len(batch) < page:
            break
        offset += page
    print(f"  Supabase members: {len(members)}")

    print("Querying Supabase loans (member_id only)...")
    loans_per_member: dict[str, int] = {}
    offset = 0
    while True:
        resp = (
            sb.table("loans")
            .select("member_id")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        for r in batch:
            mid = r.get("member_id")
            if mid:
                loans_per_member[mid] = loans_per_member.get(mid, 0) + 1
        if len(batch) < page:
            break
        offset += page
    print(f"  Members with >=1 loan in Supabase: {len(loans_per_member)}")

    no_loan_rows: list[dict] = []
    for m in members:
        mid = m["id"]
        if loans_per_member.get(mid, 0) > 0:
            continue
        key = (norm(m.get("last_name")), norm(m.get("first_name")))
        profile = profile_by_name.get(key)
        master_uuid = (profile.get("MasterUUID") or "").strip() if profile else ""
        matrix_hits = matrix_by_name.get(key, 0)
        no_loan_rows.append({
            "member_id": mid,
            "membership_id": m.get("membership_id", ""),
            "LastName": m.get("last_name", ""),
            "FirstName": m.get("first_name", ""),
            "MasterUUID_in_profile": master_uuid,
            "in_MembersProfile": "yes" if profile else "no",
            "loans_in_Matrix_by_name": matrix_hits,
            "Action": (
                "Add MasterUUID to MembersProfile.csv" if profile and not master_uuid
                else "Add member to MembersProfile.csv" if not profile
                else "Loans for this MasterUUID may be missing from Master_Analytical_Matrix.csv"
            ),
        })

    no_loan_rows.sort(key=lambda r: (r["LastName"], r["FirstName"]))

    with OUT_NOLOANS.open("w", encoding="utf-8", newline="") as fh:
        fields = [
            "member_id", "membership_id", "LastName", "FirstName",
            "MasterUUID_in_profile", "in_MembersProfile",
            "loans_in_Matrix_by_name", "Action",
        ]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(no_loan_rows)
    print(f"Report 2 (Supabase members with no loans): {len(no_loan_rows)} rows -> {OUT_NOLOANS.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
