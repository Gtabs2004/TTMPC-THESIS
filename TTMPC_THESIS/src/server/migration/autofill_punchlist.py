"""Auto-fill MasterUUIDs in DATA_TEAM_PUNCHLIST.csv by matching against
Normalized_Profiles.csv.

Match strategy:
  1. Exact (last, first) match.
  2. Last-name match + first-name starts-with.
  3. Last-name match alone (only if unique).
"""

import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
PUNCHLIST = HERE / "DATA_TEAM_PUNCHLIST.csv"
NORMALIZED = HERE / "Normalized_Profiles.csv"
OUT = HERE / "DATA_TEAM_PUNCHLIST_filled.csv"


def norm(s: str) -> str:
    """Normalize for comparison: strip accents/mojibake, uppercase, trim,
    expand common abbreviations, and collapse whitespace."""
    import re, unicodedata
    s = (s or "").strip()
    # 1. NFKD-decompose, then strip combining marks (accents).
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    # 2. Uppercase + drop any character that isn't a letter, digit, space,
    #    or period (this also removes mojibake replacement chars without
    #    inserting word-breaking spaces, so DUE�NAS -> DUENAS, matching
    #    DUEÑAS from a clean UTF-8 file).
    s = s.upper()
    s = re.sub(r"[^A-Z0-9 .]", "", s)
    # 3. MA. -> MARIA (Filipino convention).
    s = re.sub(r"\bMA\b\.?", "MARIA", s)
    # 4. Collapse repeated whitespace.
    s = " ".join(s.split())
    return s


def main() -> int:
    by_lastfirst: dict[tuple[str, str], list[dict]] = {}
    by_last: dict[str, list[dict]] = {}
    # Open with utf-8 + errors='replace'. Some files were re-saved by Excel
    # in cp1252 which mangles Ñ into 'Ã‘' — but in practice the rows we need
    # (BUSTILLO, DUEÑAS, etc.) are still UTF-8, only a handful of stray bytes
    # are bad. Replace-on-error keeps Ñ intact for the rows that matter.
    with NORMALIZED.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        for r in csv.DictReader(fh):
            ln = norm(r.get("LastName"))
            fn = norm(r.get("FirstName"))
            mu = (r.get("membership_number_id") or "").strip()
            if not mu:
                continue
            row = {"last": ln, "first": fn, "uuid": mu}
            by_lastfirst.setdefault((ln, fn), []).append(row)
            by_last.setdefault(ln, []).append(row)

    filled = 0
    rows = []
    with PUNCHLIST.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = reader.fieldnames or []
        for r in reader:
            ln = norm(r.get("LastName_in_CSV"))
            fn = norm(r.get("FirstName_in_CSV"))

            # already filled?
            action = r.get("Action", "")
            already_has_uuid = any(part.count("-") == 4 and len(part) == 36 for part in action.split())
            if already_has_uuid:
                rows.append(r)
                continue

            uuid = None
            how = ""

            # 1. exact
            cands = by_lastfirst.get((ln, fn), [])
            if len(cands) == 1:
                uuid = cands[0]["uuid"]; how = "exact"

            # 2. starts-with on first name
            if not uuid:
                lst = by_last.get(ln, [])
                if lst and fn:
                    sw = [x for x in lst if x["first"].startswith(fn) or fn.startswith(x["first"])]
                    if len(sw) == 1:
                        uuid = sw[0]["uuid"]; how = "first-startswith"

            # 3. last-name unique
            if not uuid:
                lst = by_last.get(ln, [])
                if len(lst) == 1:
                    uuid = lst[0]["uuid"]; how = "last-only"

            if uuid:
                r["Action"] = f"AUTO-FILLED ({how}): MasterUUID {uuid}"
                filled += 1
            rows.append(r)

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    print(f"Rows: {len(rows)}")
    print(f"Auto-filled: {filled}")
    print(f"Output: {OUT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
