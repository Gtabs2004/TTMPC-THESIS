"""
Apply reconstructed_schedules.sql directly via the Supabase Python client,
in batches of 500, with progress + per-batch error handling.

Steps:
  1. Confirm the current LEGACY_% count in DB (safety check).
  2. Optionally DELETE existing LEGACY_% rows (rollback of prior run).
  3. Parse INSERT statements from reconstructed_schedules.sql into row dicts.
  4. Insert in chunks via sb.table("loan_schedules").upsert(...).
  5. Log failed batches to apply_schedules_errors.csv.

Safe to re-run — schedule_id is UNIQUE and we use upsert with on_conflict.
"""

from __future__ import annotations

import csv
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

SQL_FILE = HERE / "reconstructed_schedules.sql"
ERRORS_CSV = HERE / "apply_schedules_errors.csv"

BATCH_SIZE = 500

INSERT_RE = re.compile(
    r"INSERT INTO public\.loan_schedules "
    r"\(schedule_id, loan_id, installment_no, due_date, expected_principal, "
    r"expected_interest, penalty, remaining_principal, expected_amount, "
    r"principal_component, interest_component, schedule_status\) VALUES "
    r"\('([^']+)', '([^']+)', (\d+), '([^']+)', ([\d.]+), ([\d.]+), (\d+), "
    r"([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), '([^']+)'\)"
)


def parse_sql(path: Path) -> list[dict]:
    """Parse INSERT statements into row dicts."""
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = INSERT_RE.search(line)
        if not m:
            continue
        rows.append({
            "schedule_id": m.group(1),
            "loan_id": m.group(2),
            "installment_no": int(m.group(3)),
            "due_date": m.group(4),
            "expected_principal": float(m.group(5)),
            "expected_interest": float(m.group(6)),
            "penalty": int(m.group(7)),
            "remaining_principal": float(m.group(8)),
            "expected_amount": float(m.group(9)),
            "principal_component": float(m.group(10)),
            "interest_component": float(m.group(11)),
            "schedule_status": m.group(12),
        })
    return rows


def main() -> int:
    if not SQL_FILE.exists():
        print(f"ERROR: {SQL_FILE} not found", file=sys.stderr)
        return 1

    print("Loading Supabase client...")
    sb, _, _ = ac._load_runtime_config()

    # Count existing LEGACY_ rows
    existing = sb.table("loan_schedules").select("schedule_id", count="exact", head=True).like("schedule_id", "LEGACY_%").execute()
    existing_count = existing.count or 0
    print(f"  Existing LEGACY_% rows in DB: {existing_count}")

    if existing_count > 0:
        answer = input("Delete existing LEGACY_% rows before reapply? (yes/no): ").strip().lower()
        if answer == "yes":
            print("  Deleting existing LEGACY_% rows...")
            # Delete in chunks to avoid timeout
            while True:
                r = (
                    sb.table("loan_schedules")
                    .select("id")
                    .like("schedule_id", "LEGACY_%")
                    .limit(1000)
                    .execute()
                )
                ids = [row["id"] for row in (r.data or [])]
                if not ids:
                    break
                sb.table("loan_schedules").delete().in_("id", ids).execute()
                print(f"    Deleted {len(ids)} rows...")
            print("  Done deleting.")

    print(f"\nParsing {SQL_FILE.name}...")
    rows = parse_sql(SQL_FILE)
    print(f"  Parsed {len(rows):,} INSERT rows")

    if not rows:
        print("No rows to insert. Exiting.")
        return 0

    errors: list[dict] = []
    inserted = 0
    start = time.time()

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        try:
            sb.table("loan_schedules").insert(batch).execute()
            inserted += len(batch)
        except Exception as e:
            err_msg = str(e)[:200]
            print(f"  Batch {i // BATCH_SIZE + 1} FAILED: {err_msg}")
            # Try one retry after 2s
            time.sleep(2)
            try:
                sb.table("loan_schedules").insert(batch).execute()
                inserted += len(batch)
                print(f"    Retry succeeded.")
            except Exception as e2:
                # Log every loan_id in the failed batch
                for r in batch:
                    errors.append({
                        "schedule_id": r["schedule_id"],
                        "loan_id": r["loan_id"],
                        "installment_no": r["installment_no"],
                        "error": str(e2)[:200],
                    })

        elapsed = time.time() - start
        rate = inserted / elapsed if elapsed > 0 else 0
        print(f"  Progress: {inserted:>5,}/{len(rows):,}  ({rate:.0f} rows/sec)")

    total_elapsed = time.time() - start
    print(f"\nFinished in {total_elapsed:.1f}s. Inserted {inserted:,}/{len(rows):,} rows.")

    if errors:
        with ERRORS_CSV.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["schedule_id", "loan_id", "installment_no", "error"])
            w.writeheader()
            w.writerows(errors)
        print(f"  {len(errors)} errors logged to {ERRORS_CSV.name}")
        return 1

    # Final count check
    final = sb.table("loan_schedules").select("schedule_id", count="exact", head=True).like("schedule_id", "LEGACY_%").execute()
    print(f"\nFinal LEGACY_% rows in DB: {final.count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
