"""
Audit `member` table vs all real-data CSVs to identify simulated/test accounts.

A real coop member's name should appear in at least ONE of:
  - Normalized_Share_Capital.csv      (~254 active roster - source of truth)
  - Normalized_Loan_Applications_v1.csv
  - Normalized_Profiles.csv
  - Cleaned_Members.csv

Anyone in `member` whose (last, first) doesn't appear in any of those is a
suspected test account created during app development.

Emits `member_audit.csv` with classification:
  - real_active_in_sc       -> in Share Capital
  - real_historical         -> in loan/profile/cleaned CSVs but NOT in SC
  - ambiguous_lastname_only -> only last-name matches somewhere
  - suspected_test          -> not in any real-data CSV

NO DB writes.
"""

from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

OUT = HERE / "member_audit.csv"


def norm(s: str) -> str:
    t = (s or "").upper().strip()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def parse_lastfirst(name: str) -> tuple[str, str]:
    if "," in name:
        last, rest = name.split(",", 1)
    else:
        last, rest = name, ""
    return norm(last), (norm(rest).split(" ")[0] if rest else "")


def load_from_csv(path: Path, name_field=None, last_field=None, first_field=None) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    if not path.exists():
        return out
    with path.open(encoding="utf-8-sig", newline="", errors="replace") as f:
        for row in csv.DictReader(f):
            if name_field and row.get(name_field):
                l, fi = parse_lastfirst(row[name_field])
            elif last_field and first_field:
                l = norm(row.get(last_field) or "")
                fi = norm(row.get(first_field) or "").split(" ")[0] if row.get(first_field) else ""
            else:
                continue
            if l and fi:
                out.add((l, fi))
    return out


def main() -> int:
    print("Loading real-data CSVs...")
    sc = load_from_csv(HERE / "Normalized_Share_Capital.csv", name_field="Name")
    loans = load_from_csv(HERE / "Normalized_Loan_Applications_v1.csv", name_field="Name")
    profiles = load_from_csv(HERE / "Normalized_Profiles.csv",
                             last_field="LastName", first_field="FirstName")
    cleaned = load_from_csv(HERE / "Cleaned_Members.csv",
                            last_field="LastName", first_field="FirstName")
    print(f"  Share Capital:     {len(sc):>4} names")
    print(f"  Loan Applications: {len(loans):>4} names")
    print(f"  Profiles:          {len(profiles):>4} names")
    print(f"  Cleaned Members:   {len(cleaned):>4} names")

    any_real = sc | loans | profiles | cleaned
    any_real_last = {l for l, _ in any_real}
    print(f"  Union of real names: {len(any_real)}\n")

    print("Loading member table from Supabase...")
    sb, _, _ = ac._load_runtime_config()
    all_members: list[dict] = []
    offset = 0
    while True:
        r = (sb.table("member")
             .select("id, membership_id, first_name, last_name, middle_initial, "
                     "termination_date, is_bona_fide, created_at, membership_date")
             .range(offset, offset + 999).execute())
        b = r.data or []
        if not b:
            break
        all_members.extend(b)
        if len(b) < 1000:
            break
        offset += 1000
    print(f"  Loaded {len(all_members)} member rows\n")

    audit_rows: list[dict] = []
    counts: dict[str, int] = defaultdict(int)
    for m in all_members:
        last = norm(m.get("last_name") or "")
        first_raw = norm(m.get("first_name") or "")
        first = first_raw.split(" ")[0] if first_raw else ""
        pair = (last, first)

        in_sc = pair in sc
        in_loans = pair in loans
        in_profiles = pair in profiles
        in_cleaned = pair in cleaned
        in_any = in_sc or in_loans or in_profiles or in_cleaned

        if in_sc:
            classification = "real_active_in_sc"
        elif in_any:
            classification = "real_historical"
        elif last in any_real_last:
            classification = "ambiguous_lastname_only"
        else:
            classification = "suspected_test"
        counts[classification] += 1

        audit_rows.append({
            "member_id": m["id"],
            "membership_id": m.get("membership_id") or "",
            "last_name": m.get("last_name") or "",
            "first_name": m.get("first_name") or "",
            "middle_initial": m.get("middle_initial") or "",
            "classification": classification,
            "in_share_capital": "Y" if in_sc else "",
            "in_loan_apps": "Y" if in_loans else "",
            "in_profiles": "Y" if in_profiles else "",
            "in_cleaned_members": "Y" if in_cleaned else "",
            "created_at": m.get("created_at") or "",
            "membership_date": m.get("membership_date") or "",
            "termination_date": m.get("termination_date") or "",
        })

    audit_rows.sort(key=lambda r: (r["classification"], r["last_name"], r["first_name"]))

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(audit_rows[0].keys()))
        w.writeheader()
        w.writerows(audit_rows)

    print("Classification summary:")
    for c, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {c:<28} {n}")
    print(f"\nWrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
