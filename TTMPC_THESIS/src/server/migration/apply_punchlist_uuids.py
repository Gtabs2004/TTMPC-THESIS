"""Apply resolved MasterUUIDs from DATA_TEAM_PUNCHLIST_filled.csv into
Cleaned_Members.csv so the next bridge build picks them up.

Extracts (MemberID, MasterUUID) pairs from rows where Action contains a UUID.
"""

import csv
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUNCH = HERE / "DATA_TEAM_PUNCHLIST_filled.csv"
CLEANED = HERE / "Cleaned_Members.csv"

UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def main() -> int:
    resolved: dict[str, str] = {}
    with PUNCH.open("r", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            mid = (r.get("MemberID") or "").strip().upper()
            m = UUID_RE.search(r.get("Action") or "")
            if mid and m:
                resolved[mid] = m.group(0)
    print(f"Resolved UUIDs to apply: {len(resolved)}")

    rows = []
    fields = None
    with CLEANED.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = reader.fieldnames
        rows = list(reader)

    updated = 0
    for r in rows:
        mid = (r.get("MemberID") or "").strip().upper()
        if mid in resolved:
            current = (r.get("MasterUUID") or "").strip()
            if not current:
                r["MasterUUID"] = resolved[mid]
                updated += 1

    with CLEANED.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    print(f"Updated rows in Cleaned_Members.csv: {updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
