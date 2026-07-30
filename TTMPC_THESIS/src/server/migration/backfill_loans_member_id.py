"""
Relink loans.member_id to the correct real member using name-match output.

Reads:
  - name_match_auto.csv   (188 auto-matched borrowers → 651 loans)
  - name_match_fuzzy.csv  (13 fuzzy-matched borrowers → 47 loans, user-confirmed)
  - Normalized_Loan_Applications_v1.csv (to expand borrower → per-loan list)

Writes:
  - backfill_loans_member_id.sql — UPDATEs loans.member_id for each mapped
    loan, plus INSERTs into legacy_member_link (bridge table). Wrapped in a
    single transaction with a rollback comment.

For each borrower:
  1. Take (loan_ids, csv_master_uuids, member_id) from the match CSV.
  2. Emit UPDATE loans SET member_id = <correct> for each loan_id.
  3. Emit INSERT INTO legacy_member_link for each MasterUUID.

The fuzzy CSV lists `member_id` (single match) OR `cand1_member_id` (last-name
lookup). Since the user confirmed all 13 fuzzy are same person, we use
`member_id` if present, otherwise `cand1_member_id`.

NO DB writes. Emits SQL only.
"""

from __future__ import annotations

import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_SQL = HERE / "backfill_loans_member_id.sql"


def read_matches(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def resolve_member_id(row: dict) -> str | None:
    """Prefer explicit member_id; fall back to cand1_member_id for fuzzy rows."""
    mid = (row.get("member_id") or "").strip()
    if mid:
        return mid
    return (row.get("cand1_member_id") or "").strip() or None


def sql_str(value) -> str:
    if value is None:
        return "NULL"
    s = str(value).replace("'", "''")
    return f"'{s}'"


def main() -> int:
    auto_rows = read_matches(HERE / "name_match_auto.csv")
    fuzzy_rows = read_matches(HERE / "name_match_fuzzy.csv")
    print(f"Loaded {len(auto_rows)} auto + {len(fuzzy_rows)} fuzzy borrowers")

    lines = [
        "-- Relink loans.member_id + populate legacy_member_link bridge.",
        "-- Source: name_match_auto.csv (188 borrowers, exact name match) and",
        "--         name_match_fuzzy.csv (13 borrowers, user-confirmed same person).",
        "--",
        "-- Only updates loans whose control_number is in the auto/fuzzy CSVs.",
        "-- Uses WHERE control_number IN (...) so the UPDATE is idempotent — running",
        "-- twice is safe (second run just sets the same member_id again).",
        "--",
        "-- Rollback:",
        "--   1. Restore prior member_id values from your Supabase backup.",
        "--   2. DELETE FROM legacy_member_link WHERE confirmed_by IS NULL;",
        "",
        "BEGIN;",
        "",
    ]

    loans_updated = 0
    borrowers_processed = 0
    bridge_inserts = 0
    skipped: list[str] = []

    for source_label, rows in [("auto", auto_rows), ("fuzzy", fuzzy_rows)]:
        for row in rows:
            member_id = resolve_member_id(row)
            csv_name = row.get("csv_name") or ""
            loan_ids_raw = row.get("loan_ids") or ""
            master_uuids_raw = row.get("csv_master_uuids") or ""

            if not member_id:
                skipped.append(f"{source_label}: {csv_name} — no member_id resolved")
                continue

            loan_ids = [x.strip() for x in loan_ids_raw.split(";") if x.strip()]
            master_uuids = [x.strip() for x in master_uuids_raw.split(";") if x.strip()]

            if not loan_ids:
                skipped.append(f"{source_label}: {csv_name} — no loan_ids")
                continue

            # Update all loans for this borrower in one statement.
            id_list = ", ".join(sql_str(l) for l in loan_ids)
            lines.append(
                f"-- {source_label}: {csv_name} ({len(loan_ids)} loan(s)) -> member {member_id}"
            )
            lines.append(
                f"UPDATE public.loans SET member_id = {sql_str(member_id)} "
                f"WHERE control_number IN ({id_list});"
            )
            loans_updated += len(loan_ids)
            borrowers_processed += 1

            # Populate the bridge table for each MasterUUID (idempotent via
            # ON CONFLICT).
            for uid in master_uuids:
                lines.append(
                    "INSERT INTO public.legacy_member_link "
                    "(legacy_master_uuid, member_id, marked_no_history, notes) "
                    f"VALUES ({sql_str(uid)}, {sql_str(member_id)}, FALSE, "
                    f"{sql_str(f'{source_label} match: {csv_name}')}) "
                    "ON CONFLICT (legacy_master_uuid) DO UPDATE SET "
                    "member_id = EXCLUDED.member_id, "
                    "marked_no_history = FALSE, "
                    "notes = EXCLUDED.notes;"
                )
                bridge_inserts += 1
            lines.append("")

    lines.append("COMMIT;")
    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")

    print(f"\nWrote {OUT_SQL}")
    print(f"  Borrowers processed: {borrowers_processed}")
    print(f"  Loans updated:       {loans_updated}")
    print(f"  Bridge inserts:      {bridge_inserts}")
    if skipped:
        print(f"  Skipped ({len(skipped)}):")
        for s in skipped[:10]:
            print(f"    - {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
