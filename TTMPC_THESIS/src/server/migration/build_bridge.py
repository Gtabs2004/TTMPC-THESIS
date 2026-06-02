"""
Build a name-based bridge between the historical CSV members and the live
Supabase `public.member` rows exported in member_rows.sql.

Inputs:
  - ../../../analytics/RISK Assesment/TTMPC_Credit_Risk/MembersProfile.csv
  - ../member_rows.sql

Outputs (written next to this script):
  - bridge_matched.csv       -- auto-confirmed name matches
  - bridge_review.csv        -- ambiguous matches needing human eyes
  - bridge_unmatched.csv     -- CSV rows with no plausible candidate
"""

from __future__ import annotations

import csv
import difflib
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent.parent  # .../TTMPC_THESIS
CSV_PATH = REPO_ROOT / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "MembersProfile.csv"
MEMBER_ROWS_SQL = HERE.parent / "member_rows.sql"

OUT_MATCHED = HERE / "bridge_matched.csv"
OUT_REVIEW = HERE / "bridge_review.csv"
OUT_UNMATCHED = HERE / "bridge_unmatched.csv"
OUT_SUGGESTIONS = HERE / "bridge_unmatched_suggestions.csv"

OUT_FINAL = HERE / "member_bridge_final.csv"
OUT_REVIEW_MANUAL = HERE / "bridge_review_manual.csv"
OUT_TO_INSERT = HERE / "members_to_insert.csv"

FUZZY_TOP_N = 3
FUZZY_MIN_SCORE = 0.72       # threshold to even surface as a candidate
FUZZY_AUTO_ACCEPT = 0.88     # threshold to auto-accept as a match


# ---------- normalization ----------

_PUNCT_RE = re.compile(r"[^\w\s-]", flags=re.UNICODE)
_WS_RE = re.compile(r"\s+")
_SUFFIX_RE = re.compile(r"\b(JR|SR|II|III|IV)\b\.?", flags=re.IGNORECASE)


def strip_accents(value: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value) if not unicodedata.combining(ch)
    )


def normalize_name(value: str | None) -> str:
    if value is None:
        return ""
    s = strip_accents(str(value)).upper().strip()
    # Strip Jr/Sr/II/III/IV suffixes wherever they appear (including glued onto first name).
    s = _SUFFIX_RE.sub(" ", s)
    s = _PUNCT_RE.sub("", s)  # drop "." commas etc; keep hyphen via \w-
    s = _WS_RE.sub(" ", s).strip()
    # "MA." -> "MA" after punct strip; map common abbreviation to canonical form
    s = re.sub(r"\bMA\b", "MARIA", s)
    return s


def first_letter(value: str | None) -> str:
    n = normalize_name(value)
    return n[:1] if n else ""


# ---------- parse member_rows.sql ----------

# member_rows.sql header (from inspection):
# (id, membership_id, first_name, last_name, created_at, membership_type_id,
#  co_maker, middle_initial, membership_date, is_bona_fide, bod_resolution_number,
#  number_of_shares, share_capital_amount, initial_paid_up_capital,
#  termination_resolution_number, termination_date, auth_user_id)
#
# Each row is a tuple literal: ('uuid', 'TTMPC-XXX', 'FIRST', 'LAST', '...', null, ...)
# A safe regex over the tuple content handles the leading 8 positional fields.

ROW_RE = re.compile(
    r"\(\s*"
    r"'([0-9a-f-]{36})'\s*,\s*"           # id (uuid)
    r"'([^']*)'\s*,\s*"                    # membership_id (TTMPC-XXX)
    r"'((?:[^']|'')*)'\s*,\s*"             # first_name
    r"'((?:[^']|'')*)'\s*,\s*"             # last_name
    r"'[^']*'\s*,\s*"                      # created_at
    r"(?:null|\d+)\s*,\s*"                 # membership_type_id
    r"(?:null|'(?:[^']|'')*')\s*,\s*"     # co_maker
    r"(null|'((?:[^']|'')*)')",            # middle_initial (group 5 = whole, group 6 = inner)
    flags=re.IGNORECASE,
)


def load_members(sql_path: Path) -> list[dict]:
    text = sql_path.read_text(encoding="utf-8", errors="replace")
    members: list[dict] = []
    for m in ROW_RE.finditer(text):
        member_id, ttmpc_id, first_name, last_name, mi_whole, mi_inner = m.groups()
        middle_initial = "" if mi_whole.lower() == "null" else (mi_inner or "")
        members.append(
            {
                "member_id": member_id,
                "ttmpc_id": ttmpc_id,
                "first_name": first_name.replace("''", "'"),
                "last_name": last_name.replace("''", "'"),
                "middle_initial": middle_initial.replace("''", "'"),
                "norm_first": normalize_name(first_name),
                "norm_last": normalize_name(last_name),
                "norm_mi": first_letter(middle_initial),
            }
        )
    return members


# ---------- parse CSV ----------

def load_csv_members(csv_path: Path) -> list[dict]:
    out: list[dict] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for i, row in enumerate(reader, start=2):  # row 1 is header
            out.append(
                {
                    "row_no": i,
                    "csv_uuid": (row.get("membership_number_id") or "").strip(),
                    "first_name": (row.get("FirstName") or "").strip(),
                    "last_name": (row.get("LastName") or "").strip(),
                    "middle_name": (row.get("MiddleName") or "").strip(),
                    "norm_first": normalize_name(row.get("FirstName")),
                    "norm_last": normalize_name(row.get("LastName")),
                    "norm_mi": first_letter(row.get("MiddleName")),
                }
            )
    return out


# ---------- matching ----------

def index_members(members: list[dict]) -> dict[tuple[str, str], list[dict]]:
    idx: dict[tuple[str, str], list[dict]] = {}
    for m in members:
        idx.setdefault((m["norm_last"], m["norm_first"]), []).append(m)
    return idx


def fuzzy_candidates(csv_row: dict, members: list[dict], top_n: int = FUZZY_TOP_N) -> list[tuple[float, dict]]:
    """Return top_n members whose (last, first) most resembles the CSV row."""
    target_last = csv_row["norm_last"]
    target_first = csv_row["norm_first"]
    scored: list[tuple[float, dict]] = []
    for m in members:
        last_score = difflib.SequenceMatcher(None, target_last, m["norm_last"]).ratio()
        first_score = difflib.SequenceMatcher(None, target_first, m["norm_first"]).ratio()
        # Weight last name more heavily; municipality reuses last names.
        combined = (last_score * 0.6) + (first_score * 0.4)
        if combined >= FUZZY_MIN_SCORE:
            scored.append((combined, m))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_n]


def match(csv_row: dict, idx: dict[tuple[str, str], list[dict]]) -> tuple[str, list[dict]]:
    key = (csv_row["norm_last"], csv_row["norm_first"])
    candidates = idx.get(key, [])

    if not candidates:
        return ("not_found", [])

    if len(candidates) == 1:
        c = candidates[0]
        if not csv_row["norm_mi"] or not c["norm_mi"] or csv_row["norm_mi"] == c["norm_mi"]:
            return ("matched_unique", candidates)
        return ("review_mi_mismatch", candidates)

    # Multiple candidates with the same last+first. Disambiguate by middle initial.
    by_mi = [c for c in candidates if c["norm_mi"] == csv_row["norm_mi"] and csv_row["norm_mi"]]
    if len(by_mi) == 1:
        return ("matched_by_mi", by_mi)
    if len(by_mi) > 1:
        return ("review_mi_collision", by_mi)
    # No middle initial agrees, or CSV middle is blank.
    return ("review_multi_candidates", candidates)


# ---------- main ----------

def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: missing {CSV_PATH}", file=sys.stderr)
        return 1
    if not MEMBER_ROWS_SQL.exists():
        print(f"ERROR: missing {MEMBER_ROWS_SQL}", file=sys.stderr)
        return 1

    members = load_members(MEMBER_ROWS_SQL)
    csv_rows = load_csv_members(CSV_PATH)
    idx = index_members(members)

    matched: list[dict] = []
    review: list[dict] = []
    unmatched: list[dict] = []
    suggestions: list[dict] = []

    # Final aggregations.
    final_bridge: list[dict] = []        # confirmed matches (auto + review-auto + fuzzy-auto)
    manual_review: list[dict] = []       # mid-confidence fuzzy needing human pick
    to_insert: list[dict] = []           # CSV members with no plausible Supabase candidate

    for row in csv_rows:
        status, cands = match(row, idx)
        base = {
            "csv_row": row["row_no"],
            "csv_uuid": row["csv_uuid"],
            "csv_last": row["last_name"],
            "csv_first": row["first_name"],
            "csv_middle": row["middle_name"],
            "status": status,
        }

        def accept_final(c: dict, reason: str) -> None:
            final_bridge.append(
                {
                    "csv_row": row["row_no"],
                    "csv_uuid": row["csv_uuid"],
                    "csv_last": row["last_name"],
                    "csv_first": row["first_name"],
                    "csv_middle": row["middle_name"],
                    "member_id": c["member_id"],
                    "ttmpc_id": c["ttmpc_id"],
                    "member_last": c["last_name"],
                    "member_first": c["first_name"],
                    "member_mi": c["middle_initial"],
                    "match_reason": reason,
                }
            )

        if status in ("matched_unique", "matched_by_mi"):
            c = cands[0]
            matched.append(
                {
                    **base,
                    "member_id": c["member_id"],
                    "ttmpc_id": c["ttmpc_id"],
                    "member_last": c["last_name"],
                    "member_first": c["first_name"],
                    "member_mi": c["middle_initial"],
                }
            )
            accept_final(c, status)
        elif status == "review_mi_mismatch":
            # Same last+first, single candidate, only middle initial disagrees.
            # Common cause: Supabase stored the suffix letter (J from Jr.) as middle
            # initial instead of the real middle name initial. Treat as match.
            for i, c in enumerate(cands, start=1):
                base[f"cand{i}_member_id"] = c["member_id"]
                base[f"cand{i}_ttmpc_id"] = c["ttmpc_id"]
                base[f"cand{i}_name"] = f'{c["last_name"]}, {c["first_name"]} {c["middle_initial"]}'
            base["chosen_member_id"] = cands[0]["member_id"]
            review.append(base)
            accept_final(cands[0], "review_mi_mismatch_auto")
        elif status == "not_found":
            unmatched.append(base)
            fuzz = fuzzy_candidates(row, members)
            if not fuzz:
                to_insert.append(base)
                continue

            top_score, top_c = fuzz[0]
            srow = dict(base)
            for i, (score, c) in enumerate(fuzz, start=1):
                srow[f"cand{i}_score"] = f"{score:.3f}"
                srow[f"cand{i}_member_id"] = c["member_id"]
                srow[f"cand{i}_ttmpc_id"] = c["ttmpc_id"]
                srow[f"cand{i}_name"] = (
                    f'{c["last_name"]}, {c["first_name"]} {c["middle_initial"]}'.strip()
                )
            srow["chosen_member_id"] = ""
            suggestions.append(srow)

            if top_score >= FUZZY_AUTO_ACCEPT:
                accept_final(top_c, f"fuzzy_auto_{top_score:.3f}")
            else:
                # Mid-confidence fuzzy candidates are surfaced for review, but
                # the user has confirmed these are always different people. Send
                # the CSV row to the "needs to be inserted" pile alongside the
                # truly-not-found rows.
                srow_manual = dict(srow)
                manual_review.append(srow_manual)
                to_insert.append(base)
        else:
            for i, c in enumerate(cands, start=1):
                base[f"cand{i}_member_id"] = c["member_id"]
                base[f"cand{i}_ttmpc_id"] = c["ttmpc_id"]
                base[f"cand{i}_name"] = f'{c["last_name"]}, {c["first_name"]} {c["middle_initial"]}'
            base["chosen_member_id"] = ""
            review.append(base)
            manual_review.append(base)

    write_csv(OUT_MATCHED, matched)
    write_csv(OUT_REVIEW, review)
    write_csv(OUT_UNMATCHED, unmatched)
    write_csv(OUT_SUGGESTIONS, suggestions)
    write_csv(OUT_FINAL, final_bridge)
    write_csv(OUT_REVIEW_MANUAL, manual_review)
    write_csv(OUT_TO_INSERT, to_insert)

    print(f"Members parsed from SQL : {len(members)}")
    print(f"CSV rows                : {len(csv_rows)}")
    print(f"  exact-name matched    : {len(matched)}")
    print(f"  initial-mismatch auto : {len(review)}")
    print(f"  not found (raw)       : {len(unmatched)}")
    print(f"    fuzzy candidates    : {len(suggestions)}")
    print(f"")
    print(f"Final outputs:")
    print(f"  final bridge          : {len(final_bridge)}  -> {OUT_FINAL.name}")
    print(f"  needs manual pick     : {len(manual_review)} -> {OUT_REVIEW_MANUAL.name}")
    print(f"  to insert in Supabase : {len(to_insert)}     -> {OUT_TO_INSERT.name}")
    return 0


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    # Union of keys, preserving first-seen order.
    keys: list[str] = []
    seen: set[str] = set()
    for r in rows:
        for k in r.keys():
            if k not in seen:
                seen.add(k)
                keys.append(k)
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    raise SystemExit(main())
