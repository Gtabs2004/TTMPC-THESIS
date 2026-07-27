"""
Import historical Share Capital balances into public.capital_build_up.

Flow:
  1. Load member_bridge_final.csv  (MasterUUID -> real member.id + name).
  2. Load ALL members from member_rows.sql (for fallback name search).
  3. Load Normalized_Share_Capital.csv.
  4. For each CSV row:
       Primary: look up MasterUUID in the bridge.
         - If found AND name matches bridge -> queue INSERT (trust UUID+name).
         - If found but name DOES NOT match:
             * Search the FULL member table for the CSV name.
                 - Exactly one match -> queue INSERT with that member (log override).
                 - Zero matches      -> trust the UUID (married-name / spelling variant).
                 - Multiple matches  -> skip, log for review.
         - If MasterUUID not in bridge at all:
             * Search full member table by name.
                 - Exactly one match -> queue INSERT (log fallback).
                 - Otherwise         -> skip, log unmatched.
  5. Emit share_capital_insert.sql (idempotent) + review CSVs.

Idempotency: each INSERT is guarded by NOT EXISTS on
(member_id, deposit_account = 'historical_import_2025').
"""

from __future__ import annotations

import csv
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
BRIDGE_PATH = HERE / "member_bridge_final.csv"
SHARE_CAPITAL_PATH = HERE / "Normalized_Share_Capital.csv"
MEMBER_ROWS_SQL = HERE.parent / "member_rows.sql"

OUT_SQL = HERE / "share_capital_insert.sql"
OUT_INSERTED = HERE / "share_capital_inserted.csv"
OUT_UNMATCHED = HERE / "share_capital_unmatched.csv"
OUT_REVIEW = HERE / "share_capital_review.csv"
OUT_MARRIED = HERE / "share_capital_trusted_uuid_over_name.csv"
OUT_NAME_OVERRIDE = HERE / "share_capital_name_override.csv"

DEPOSIT_ACCOUNT_TAG = "historical_import_2025"


def normalize_name(raw: str) -> str:
    if not raw:
        return ""
    s = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    s = s.upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    s = " ".join(s.split())
    # Filipino surname prefixes: "DE LOS" -> "DELOS", "DE LA" -> "DELA", "DEL" glued.
    # Handles inconsistent spacing between CSV ("De Los Santos") and DB ("DELOS SANTOS").
    s = re.sub(r"\bDE\s+LOS\b", "DELOS", s)
    s = re.sub(r"\bDE\s+LA\b", "DELA", s)
    s = re.sub(r"\bDE\s+EL\b", "DEL", s)
    # Common abbreviation
    s = re.sub(r"\bMA\b", "MARIA", s)
    return s


def name_tokens(raw: str) -> set[str]:
    return set(normalize_name(raw).split())


def names_match(csv_name: str, first: str, last: str) -> bool:
    csv_tokens = name_tokens(csv_name)
    other_tokens = name_tokens(f"{first} {last}")
    if not csv_tokens or not other_tokens:
        return False
    # accept if the shorter side is a subset of the longer, OR if they overlap heavily
    shorter, longer = (csv_tokens, other_tokens) if len(csv_tokens) <= len(other_tokens) else (other_tokens, csv_tokens)
    if shorter.issubset(longer):
        return True
    overlap = len(csv_tokens & other_tokens)
    return overlap >= 2 and overlap >= max(len(csv_tokens), len(other_tokens)) - 1


# ---------- Load bridge ----------

def load_bridge() -> dict[str, dict]:
    by_uuid: dict[str, dict] = {}
    with BRIDGE_PATH.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            uuid = (row.get("csv_uuid") or "").strip()
            if not uuid:
                continue
            entry = {
                "member_id": (row.get("member_id") or "").strip(),
                "ttmpc_id": (row.get("ttmpc_id") or "").strip(),
                "first": (row.get("member_first") or "").strip(),
                "last": (row.get("member_last") or "").strip(),
            }
            if entry["member_id"]:
                by_uuid[uuid] = entry
    return by_uuid


# ---------- Load full member table ----------

MEMBER_ROW_RE = re.compile(
    r"\(\s*"
    r"'([0-9a-f-]{36})'\s*,\s*"           # id
    r"'([^']*)'\s*,\s*"                    # membership_id
    r"'((?:[^']|'')*)'\s*,\s*"             # first_name
    r"'((?:[^']|'')*)'\s*,\s*"             # last_name
    r"'[^']*'\s*,\s*"                      # created_at
    r"(?:null|\d+)\s*,\s*"                 # membership_type_id
    r"(?:null|'(?:[^']|'')*')\s*,\s*",    # co_maker
    flags=re.IGNORECASE,
)


def load_members() -> list[dict]:
    text = MEMBER_ROWS_SQL.read_text(encoding="utf-8", errors="replace")
    out: list[dict] = []
    for m in MEMBER_ROW_RE.finditer(text):
        member_id, ttmpc_id, first_name, last_name = m.groups()
        first_name = first_name.replace("''", "'")
        last_name = last_name.replace("''", "'")
        out.append({
            "member_id": member_id,
            "ttmpc_id": ttmpc_id,
            "first_name": first_name,
            "last_name": last_name,
            "norm_key": " ".join(sorted(name_tokens(f"{first_name} {last_name}"))),
        })
    return out


def index_members_by_name(members: list[dict]) -> dict[str, list[dict]]:
    idx: dict[str, list[dict]] = {}
    for m in members:
        idx.setdefault(m["norm_key"], []).append(m)
    return idx


def find_by_name(csv_name: str, name_index: dict[str, list[dict]]) -> list[dict]:
    key = " ".join(sorted(name_tokens(csv_name)))
    return name_index.get(key, [])


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    bridge = load_bridge()
    members = load_members()
    by_name = index_members_by_name(members)

    inserted: list[dict] = []
    unmatched: list[dict] = []
    review: list[dict] = []
    trusted_uuid: list[dict] = []     # UUID kept despite name mismatch (marriage/spelling)
    name_override: list[dict] = []    # different-person case where name search found real member

    with SHARE_CAPITAL_PATH.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            master_uuid = (row.get("MasterUUID") or "").strip()
            csv_name = (row.get("Name") or "").strip()
            amount_raw = (row.get("TotalShareCapital") or "").strip()
            as_of = (row.get("AsOfDate") or "").strip()

            try:
                amount = float(amount_raw)
            except ValueError:
                unmatched.append({**row, "reason": f"invalid amount: {amount_raw!r}"})
                continue
            if amount < 0:
                unmatched.append({**row, "reason": f"negative amount: {amount}"})
                continue

            resolved_member_id: str | None = None
            resolved_source = ""
            note = ""

            b = bridge.get(master_uuid)
            if b and names_match(csv_name, b["first"], b["last"]):
                # Clean case: UUID + name agree.
                resolved_member_id = b["member_id"]
                resolved_source = "uuid+name"
            elif b:
                # UUID resolves but names disagree.
                # Try to find the CSV name in the full member table.
                candidates = find_by_name(csv_name, by_name)
                if len(candidates) == 1:
                    # Different-person case: real member exists with the CSV name.
                    resolved_member_id = candidates[0]["member_id"]
                    resolved_source = "name-override"
                    name_override.append({
                        **row,
                        "bridge_member_id": b["member_id"],
                        "bridge_name": f"{b['first']} {b['last']}",
                        "resolved_member_id": resolved_member_id,
                        "resolved_name": f"{candidates[0]['first_name']} {candidates[0]['last_name']}",
                        "resolved_ttmpc_id": candidates[0]["ttmpc_id"],
                    })
                elif len(candidates) == 0:
                    # No other member matches CSV name -> trust the UUID (married/spelling).
                    resolved_member_id = b["member_id"]
                    resolved_source = "uuid-trusted-name-variant"
                    trusted_uuid.append({
                        **row,
                        "member_id": b["member_id"],
                        "bridge_name": f"{b['first']} {b['last']}",
                        "note": "kept UUID: no other member matches CSV name",
                    })
                else:
                    # Multiple matches -> ambiguous, needs human eye.
                    review.append({
                        **row,
                        "bridge_member_id": b["member_id"],
                        "bridge_name": f"{b['first']} {b['last']}",
                        "candidate_count": len(candidates),
                        "reason": "UUID name mismatch AND multiple members share the CSV name",
                    })
                    continue
            else:
                # UUID not in bridge at all.
                candidates = find_by_name(csv_name, by_name)
                if len(candidates) == 1:
                    resolved_member_id = candidates[0]["member_id"]
                    resolved_source = "name-fallback"
                    name_override.append({
                        **row,
                        "bridge_member_id": "",
                        "bridge_name": "",
                        "resolved_member_id": resolved_member_id,
                        "resolved_name": f"{candidates[0]['first_name']} {candidates[0]['last_name']}",
                        "resolved_ttmpc_id": candidates[0]["ttmpc_id"],
                    })
                else:
                    unmatched.append({
                        **row,
                        "reason": (
                            f"MasterUUID not in bridge; name search found {len(candidates)} candidates"
                        ),
                    })
                    continue

            inserted.append({
                "member_id": resolved_member_id,
                "MasterUUID": master_uuid,
                "Name": csv_name,
                "TotalShareCapital": amount,
                "AsOfDate": as_of,
                "resolved_source": resolved_source,
            })

    # ---------- Write reports ----------

    def dump(path: Path, rows: list[dict]) -> None:
        if not rows:
            path.write_text("", encoding="utf-8")
            return
        preferred = ["member_id", "MasterUUID", "ShareCapitalID", "Name",
                     "TotalShareCapital", "AsOfDate", "resolved_source",
                     "bridge_member_id", "bridge_name",
                     "resolved_member_id", "resolved_name", "resolved_ttmpc_id",
                     "candidate_count", "note", "reason"]
        fieldnames = list({k for r in rows for k in r.keys()})
        ordered = [c for c in preferred if c in fieldnames] + \
                  [c for c in fieldnames if c not in preferred]
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=ordered)
            w.writeheader()
            for r in rows:
                w.writerow(r)

    dump(OUT_INSERTED, inserted)
    dump(OUT_UNMATCHED, unmatched)
    dump(OUT_REVIEW, review)
    dump(OUT_MARRIED, trusted_uuid)
    dump(OUT_NAME_OVERRIDE, name_override)

    # ---------- Write SQL ----------

    lines = [
        "-- Generated by import_share_capital.py",
        "-- Idempotent: skips members that already have a historical_import_2025 row.",
        "BEGIN;",
        "",
    ]
    for r in inserted:
        member_id = r["member_id"]
        amount = f"{r['TotalShareCapital']:.2f}"
        as_of = r["AsOfDate"]
        lines.append(
            "INSERT INTO public.capital_build_up "
            "(member_id, transaction_date, starting_share_capital, capital_added, "
            "ending_share_capital, deposit_account) "
            "SELECT "
            f"{sql_literal(member_id)}::uuid, "
            f"{sql_literal(as_of)}::timestamptz, "
            "0, "
            f"{amount}, "
            f"{amount}, "
            f"{sql_literal(DEPOSIT_ACCOUNT_TAG)} "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM public.capital_build_up "
            f"  WHERE member_id = {sql_literal(member_id)}::uuid "
            f"    AND deposit_account = {sql_literal(DEPOSIT_ACCOUNT_TAG)}"
            ");"
        )
    lines += ["", "COMMIT;", ""]
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    # ---------- Summary ----------

    total = len(inserted) + len(unmatched) + len(review)
    print(f"Total CSV rows processed          : {total}")
    print(f"  Queued for INSERT               : {len(inserted)}")
    print(f"    - clean UUID+name match       : {sum(1 for r in inserted if r['resolved_source'] == 'uuid+name')}")
    print(f"    - name override (diff person) : {sum(1 for r in inserted if r['resolved_source'] == 'name-override')}")
    print(f"    - UUID trusted (name variant) : {sum(1 for r in inserted if r['resolved_source'] == 'uuid-trusted-name-variant')}")
    print(f"    - name fallback (UUID missing): {sum(1 for r in inserted if r['resolved_source'] == 'name-fallback')}")
    print(f"  Needs review (ambiguous)        : {len(review)}")
    print(f"  Unmatched (skipped)             : {len(unmatched)}")
    print()
    print("Outputs:")
    print(f"  SQL                     : {OUT_SQL.name}")
    print(f"  Inserted report         : {OUT_INSERTED.name}")
    print(f"  Trusted UUID variants   : {OUT_MARRIED.name}  (review — married/spelling cases)")
    print(f"  Name overrides          : {OUT_NAME_OVERRIDE.name}  (review — UUID replaced)")
    print(f"  Needs manual review     : {OUT_REVIEW.name}")
    print(f"  Unmatched               : {OUT_UNMATCHED.name}")


if __name__ == "__main__":
    main()
