"""
Match Normalized_Loan_Applications_v1.csv rows to member.id BY NAME (not MasterUUID).

Rationale: MasterUUIDs in the source data were assigned inconsistently — the same
UUID sometimes points to different people across historical rows. Names are the
coop-validated source of truth, so we re-match here and let staff review anything
that isn't a clean 1:1.

Reads:
  - Normalized_Loan_Applications_v1.csv (loans + names)
  - Supabase `member` table (first_name, last_name, middle_initial, membership_id)

Writes (into this folder):
  - name_match_auto.csv      — exact 1:1 name matches, safe to auto-link
  - name_match_fuzzy.csv     — near matches (middle-initial diffs, whitespace,
                                punctuation) — coop should verify
  - name_match_ambiguous.csv — multiple DB members share this name — coop must
                                pick one and fill in chosen_member_id
  - name_match_missing.csv   — no candidate found — likely ex-member or missing
                                from `member` table

NO DB writes. Nothing in Supabase is touched.
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

APPS_CSV = HERE / "Normalized_Loan_Applications_v1.csv"

OUT_AUTO = HERE / "name_match_auto.csv"
OUT_FUZZY = HERE / "name_match_fuzzy.csv"
OUT_AMBIG = HERE / "name_match_ambiguous.csv"
OUT_MISSING = HERE / "name_match_missing.csv"


def normalize(text: str) -> str:
    """Uppercase, collapse whitespace, strip punctuation for compare."""
    t = (text or "").upper().strip()
    t = re.sub(r"[^\w\s]", " ", t)  # drop periods, commas, hyphens
    t = re.sub(r"\s+", " ", t).strip()
    return t


def parse_csv_name(name_raw: str) -> tuple[str, str, str]:
    """
    CSV names are "LASTNAME, FIRSTNAME [MIDDLE/SUFFIX]".
    Returns (last, first_core, middle_or_suffix) all normalized.
    """
    raw = (name_raw or "").strip()
    if "," in raw:
        last, rest = raw.split(",", 1)
    else:
        last, rest = raw, ""
    parts = normalize(rest).split(" ")
    first_core = parts[0] if parts else ""
    middle = " ".join(parts[1:]) if len(parts) > 1 else ""
    # Multi-word first names like "MARY HOPE" — try to keep first two tokens
    # if the second isn't a middle-initial-shape token.
    if len(parts) >= 2 and len(parts[1]) > 1 and "." not in parts[1]:
        # heuristic: treat 2-word first name when second token isn't a suffix
        if parts[1] not in {"JR", "SR", "III", "II", "IV"}:
            first_core = f"{parts[0]} {parts[1]}"
            middle = " ".join(parts[2:])
    return normalize(last), first_core, normalize(middle)


def fetch_members(sb) -> list[dict]:
    """Fetch all member rows in pages."""
    out: list[dict] = []
    page = 1000
    offset = 0
    while True:
        resp = (
            sb.table("member")
            .select("id, membership_id, first_name, last_name, middle_initial")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = resp.data or []
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return out


def build_member_index(members: list[dict]) -> dict[tuple[str, str], list[dict]]:
    """Group members by (normalized_last, normalized_first_core)."""
    idx: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for m in members:
        last = normalize(m.get("last_name") or "")
        first_raw = normalize(m.get("first_name") or "")
        # Take only the first two tokens of first_name to match CSV parsing.
        first_tokens = first_raw.split(" ")
        first_core = " ".join(first_tokens[:2]) if len(first_tokens) > 1 else first_raw
        # Store under multiple keys so "MARY HOPE" and just "MARY" both find them.
        idx[(last, first_core)].append(m)
        if len(first_tokens) > 1:
            idx[(last, first_tokens[0])].append(m)
    return idx


def main() -> int:
    if not APPS_CSV.exists():
        print(f"ERROR: {APPS_CSV} not found", file=sys.stderr)
        return 1

    print("Loading member table from Supabase...")
    sb, _, _ = ac._load_runtime_config()
    members = fetch_members(sb)
    print(f"  Loaded {len(members)} member rows")

    idx = build_member_index(members)
    print(f"  Built name index with {len(idx)} (last, first) buckets")

    # Read loans + get unique (name, master_uuid) pairs — one loan per row, but
    # many loans may share the same borrower, so match once per unique name.
    with APPS_CSV.open(encoding="utf-8-sig", newline="") as f:
        loans = list(csv.DictReader(f))
    print(f"  Loaded {len(loans)} loan rows from CSV")

    # Group loans by the parsed name so we match once per person, not per loan.
    loans_by_name: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for loan in loans:
        parsed = parse_csv_name(loan.get("Name") or "")
        loans_by_name[parsed].append(loan)
    print(f"  {len(loans_by_name)} unique borrower names to match")

    auto: list[dict] = []
    fuzzy: list[dict] = []
    ambig: list[dict] = []
    missing: list[dict] = []

    for (csv_last, csv_first, csv_middle), loan_group in loans_by_name.items():
        loan_ids = ";".join(l.get("LoanCode", "") for l in loan_group)
        master_uuids = ";".join({l.get("MasterUUID", "") for l in loan_group})
        csv_name_display = f"{csv_last}, {csv_first}" + (f" {csv_middle}" if csv_middle else "")

        # Exact bucket lookup
        candidates = idx.get((csv_last, csv_first), [])
        # De-dupe by member.id (we indexed some members under two keys)
        seen: set[str] = set()
        unique_cands: list[dict] = []
        for c in candidates:
            if c["id"] not in seen:
                seen.add(c["id"])
                unique_cands.append(c)

        base_row = {
            "loan_ids": loan_ids,
            "loan_count": len(loan_group),
            "csv_name": csv_name_display,
            "csv_last": csv_last,
            "csv_first": csv_first,
            "csv_middle_or_suffix": csv_middle,
            "csv_master_uuids": master_uuids,
        }

        if len(unique_cands) == 0:
            # Try last-name only as a fallback for missing bucket
            last_only = [
                m for m in members
                if normalize(m.get("last_name") or "") == csv_last
            ]
            if last_only:
                # Emit as fuzzy — could be a first-name spelling variant
                row = {**base_row, "match_type": "last_name_only",
                       "candidate_count": len(last_only)}
                for i, c in enumerate(last_only[:3], 1):
                    row[f"cand{i}_member_id"] = c["id"]
                    row[f"cand{i}_membership_id"] = c.get("membership_id", "")
                    row[f"cand{i}_name"] = f"{c.get('last_name','')}, {c.get('first_name','')} {c.get('middle_initial','') or ''}".strip()
                row["chosen_member_id"] = ""  # for coop to fill
                fuzzy.append(row)
            else:
                missing.append(base_row)
        elif len(unique_cands) == 1:
            c = unique_cands[0]
            # Check middle initial for extra confidence
            db_mi = normalize(c.get("middle_initial") or "")
            csv_mi = csv_middle[:1] if csv_middle else ""
            middle_ok = (not csv_mi) or (not db_mi) or (db_mi == csv_mi)
            row = {
                **base_row,
                "match_type": "exact" if middle_ok else "mi_mismatch",
                "member_id": c["id"],
                "membership_id": c.get("membership_id", ""),
                "member_first": c.get("first_name", ""),
                "member_last": c.get("last_name", ""),
                "member_mi": c.get("middle_initial", "") or "",
            }
            if middle_ok:
                auto.append(row)
            else:
                fuzzy.append(row)
        else:
            row = {**base_row, "match_type": "ambiguous",
                   "candidate_count": len(unique_cands)}
            for i, c in enumerate(unique_cands[:5], 1):
                row[f"cand{i}_member_id"] = c["id"]
                row[f"cand{i}_membership_id"] = c.get("membership_id", "")
                row[f"cand{i}_name"] = f"{c.get('last_name','')}, {c.get('first_name','')} {c.get('middle_initial','') or ''}".strip()
            row["chosen_member_id"] = ""
            ambig.append(row)

    def write_csv(path: Path, rows: list[dict]):
        if not rows:
            path.write_text("", encoding="utf-8")
            return
        # Superset of keys across all rows
        all_keys: list[str] = []
        seen_k: set[str] = set()
        for r in rows:
            for k in r.keys():
                if k not in seen_k:
                    seen_k.add(k)
                    all_keys.append(k)
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=all_keys)
            w.writeheader()
            w.writerows(rows)

    write_csv(OUT_AUTO, auto)
    write_csv(OUT_FUZZY, fuzzy)
    write_csv(OUT_AMBIG, ambig)
    write_csv(OUT_MISSING, missing)

    print(f"\nWrote {OUT_AUTO.name}      ({len(auto):>4} borrowers, {sum(r['loan_count'] for r in auto):>4} loans)")
    print(f"Wrote {OUT_FUZZY.name}     ({len(fuzzy):>4} borrowers, {sum(r['loan_count'] for r in fuzzy):>4} loans)  --coop review")
    print(f"Wrote {OUT_AMBIG.name} ({len(ambig):>4} borrowers, {sum(r['loan_count'] for r in ambig):>4} loans)  --coop pick one")
    print(f"Wrote {OUT_MISSING.name}   ({len(missing):>4} borrowers, {sum(r['loan_count'] for r in missing):>4} loans)  --ex-member?")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
