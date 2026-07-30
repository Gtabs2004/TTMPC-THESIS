"""
Cross-reference every CSV containing person names against Normalized_Share_Capital.csv
(which is the coop-confirmed roster of ~254 active members).

Reports per-CSV counts of:
  - names that ARE in Share Capital (active members)
  - names that are NOT in Share Capital (terminated / test / unknown)

Reads only. Writes one summary CSV: share_capital_membership_check.csv
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SC_PATH = HERE / "Normalized_Share_Capital.csv"


def norm(s: str) -> str:
    t = (s or "").upper().strip()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def parse_lastfirst(name: str) -> tuple[str, str]:
    """Handle "LAST, FIRST" and also "Last, First Middle" forms."""
    if "," in name:
        last, rest = name.split(",", 1)
    else:
        last, rest = name, ""
    return norm(last), norm(rest).split(" ")[0] if rest else ""


def load_share_capital_names() -> tuple[set[tuple[str, str]], set[str], dict[str, str]]:
    """Return (set of (last, first), set of MasterUUIDs, uuid -> canonical name)."""
    name_pairs: set[tuple[str, str]] = set()
    uuids: set[str] = set()
    uuid_to_name: dict[str, str] = {}
    with SC_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            last, first = parse_lastfirst(row.get("Name") or "")
            if last and first:
                name_pairs.add((last, first))
            uid = (row.get("MasterUUID") or "").strip()
            if uid:
                uuids.add(uid)
                uuid_to_name[uid] = row.get("Name") or ""
    return name_pairs, uuids, uuid_to_name


def check_file(path: Path, sc_names: set[tuple[str, str]], sc_uuids: set[str],
               name_field: str | None, last_field: str | None, first_field: str | None,
               uuid_field: str | None) -> dict:
    result = {
        "file": path.name,
        "total_rows": 0,
        "distinct_persons": 0,
        "in_share_capital_by_name": 0,
        "not_in_share_capital_by_name": 0,
        "in_share_capital_by_uuid": 0,
        "not_in_share_capital_by_uuid": 0,
    }
    if not path.exists():
        result["error"] = "file missing"
        return result

    distinct: set[tuple[str, str]] = set()
    in_name: set[tuple[str, str]] = set()
    not_in_name: set[tuple[str, str]] = set()
    in_uuid = 0
    not_in_uuid = 0
    with path.open(encoding="utf-8-sig", newline="", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            result["total_rows"] += 1

            if name_field and row.get(name_field):
                last, first = parse_lastfirst(row[name_field])
            elif last_field and first_field:
                last = norm(row.get(last_field) or "")
                first = norm(row.get(first_field) or "").split(" ")[0] if row.get(first_field) else ""
            else:
                last, first = "", ""

            if last and first:
                distinct.add((last, first))

            if uuid_field:
                uid = (row.get(uuid_field) or "").strip()
                if uid:
                    if uid in sc_uuids:
                        in_uuid += 1
                    else:
                        not_in_uuid += 1

    for pair in distinct:
        if pair in sc_names:
            in_name.add(pair)
        else:
            not_in_name.add(pair)

    result["distinct_persons"] = len(distinct)
    result["in_share_capital_by_name"] = len(in_name)
    result["not_in_share_capital_by_name"] = len(not_in_name)
    result["in_share_capital_by_uuid"] = in_uuid
    result["not_in_share_capital_by_uuid"] = not_in_uuid
    result["_not_in_names_sample"] = ", ".join(f"{l},{f}" for l, f in list(not_in_name)[:10])
    return result


def main() -> int:
    sc_names, sc_uuids, _ = load_share_capital_names()
    print(f"Share Capital roster: {len(sc_names)} distinct (last,first) pairs, {len(sc_uuids)} MasterUUIDs")

    checks = [
        ("Normalized_Loan_Applications_v1.csv", "Name", None, None, "MasterUUID"),
        ("Normalized_Profiles.csv", None, "LastName", "FirstName", "Member_UUID"),
        ("Cleaned_Members.csv", None, "LastName", "FirstName", "MasterUUID"),
    ]

    results = []
    for fname, name_f, last_f, first_f, uuid_f in checks:
        r = check_file(HERE / fname, sc_names, sc_uuids, name_f, last_f, first_f, uuid_f)
        results.append(r)
        print(f"\n=== {r['file']} ===")
        print(f"  total_rows: {r.get('total_rows')}")
        print(f"  distinct_persons: {r.get('distinct_persons')}")
        print(f"  IN Share Capital (by name): {r.get('in_share_capital_by_name')}")
        print(f"  NOT in Share Capital (by name): {r.get('not_in_share_capital_by_name')}")
        print(f"  IN Share Capital (by MasterUUID): {r.get('in_share_capital_by_uuid')}")
        print(f"  NOT in Share Capital (by MasterUUID): {r.get('not_in_share_capital_by_uuid')}")
        sample = r.get("_not_in_names_sample", "")
        if sample:
            print(f"  Sample not-in-SC: {sample}")

    out = HERE / "share_capital_membership_check.csv"
    keys = ["file", "total_rows", "distinct_persons",
            "in_share_capital_by_name", "not_in_share_capital_by_name",
            "in_share_capital_by_uuid", "not_in_share_capital_by_uuid"]
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in results:
            w.writerow({k: r.get(k, "") for k in keys})
    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
