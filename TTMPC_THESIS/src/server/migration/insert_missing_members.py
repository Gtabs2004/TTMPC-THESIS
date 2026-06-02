"""
Bulk-insert the historical CSV members that don't yet exist in Supabase.

Reads:
  - members_to_insert.csv  (12 truly missing members from build_bridge.py)

For each row, this script:
  1. Generates the next TTMPC-XXX via the existing applicationConfirmation logic.
  2. Builds a placeholder email matching the live convention ttmpc-XXX@ttmpc.local.
  3. Creates the auth.users account (or reuses an existing one with that email).
  4. Creates the member_account row (is_temporary=True).
  5. Creates the public.member row, with member.id = auth user uuid.

Writes:
  - inserted_members.csv  (audit log of new TTMPC-XXX, member.id, email, password)
  - insert_errors.csv     (rows that failed, with reason)

Usage (from src/server/):
  .venv/Scripts/python.exe migration/insert_missing_members.py
  .venv/Scripts/python.exe migration/insert_missing_members.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import sys
import traceback
from pathlib import Path

# Make sibling module 'applicationConfirmation' importable.
HERE = Path(__file__).resolve().parent
SERVER_DIR = HERE.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import applicationConfirmation as ac  # noqa: E402

INPUT_CSV = HERE / "members_to_insert.csv"
OUT_INSERTED = HERE / "inserted_members.csv"
OUT_ERRORS = HERE / "insert_errors.csv"


def build_email(membership_id: str) -> str:
    """ttmpc-272@ttmpc.local style — matches the live convention seen in loans_rows.sql."""
    number = membership_id.split("-")[-1].lstrip("0") or "0"
    return f"ttmpc-{int(number):03d}@ttmpc.local"


def insert_one(supabase, csv_row: dict, today_iso: str) -> dict:
    last_name = (csv_row.get("csv_last") or "").strip()
    first_name = (csv_row.get("csv_first") or "").strip()
    middle_name = (csv_row.get("csv_middle") or "").strip()

    if not last_name or not first_name:
        raise ValueError(f"Row {csv_row.get('csv_row')}: missing last/first name")

    # 1. Generate next TTMPC-XXX.
    membership_id = ac.generate_membership_id(supabase)
    email = build_email(membership_id)

    # 2. Create auth.users (or find existing).
    auth_user_id, was_created, default_password = ac._get_or_create_auth_user_id(
        supabase, email=email, last_name=last_name
    )

    # 3. Create member_account row (is_temporary).
    account_result = ac.set_new_account_temporary(
        supabase,
        auth_user_id=auth_user_id,
        email=email,
        membership_id=membership_id,
    )

    # 4. Create the member row.
    application_data = {
        "first_name": first_name,
        "last_name": last_name,
        "middle_name": middle_name,
        # leave membership_type_id absent so the DB default applies
    }
    member_row = ac.create_member(
        supabase=supabase,
        application_data=application_data,
        membership_id=membership_id,
        membership_date=today_iso,
        auth_user_id=auth_user_id,
    )

    return {
        "csv_row": csv_row.get("csv_row"),
        "csv_last": last_name,
        "csv_first": first_name,
        "csv_middle": middle_name,
        "membership_id": membership_id,
        "member_id": member_row.get("id") or auth_user_id,
        "auth_user_id": auth_user_id,
        "email": email,
        "default_password": default_password or "",
        "auth_was_created": was_created,
        "account_table": account_result.get("table"),
        "account_mode": account_result.get("mode"),
    }


def read_csv_rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read input + connect to Supabase, but do NOT create any rows.",
    )
    args = parser.parse_args()

    rows = read_csv_rows(INPUT_CSV)
    if not rows:
        print(f"No rows in {INPUT_CSV} — nothing to do.")
        return 0

    print(f"Loaded {len(rows)} member(s) from {INPUT_CSV.name}")

    try:
        supabase, _resend_key, _resend_from = ac._load_runtime_config()
    except Exception as exc:
        print(f"FAILED to load Supabase config: {exc}", file=sys.stderr)
        return 2

    print(f"Connected to Supabase: {supabase.supabase_url}")

    if args.dry_run:
        print("DRY-RUN: would insert these members:")
        for r in rows:
            print(f"  - {r.get('csv_last')}, {r.get('csv_first')} {r.get('csv_middle')}")
        return 0

    today_iso = ac.datetime.now(ac.timezone.utc).date().isoformat()

    inserted: list[dict] = []
    errors: list[dict] = []

    for i, row in enumerate(rows, start=1):
        label = f"[{i}/{len(rows)}] {row.get('csv_last')}, {row.get('csv_first')}"
        try:
            result = insert_one(supabase, row, today_iso)
            inserted.append(result)
            print(
                f"OK   {label}  ->  {result['membership_id']} "
                f"(auth_created={result['auth_was_created']}, account={result['account_mode']})"
            )
        except Exception as exc:
            tb = traceback.format_exc(limit=2)
            errors.append(
                {
                    "csv_row": row.get("csv_row"),
                    "csv_last": row.get("csv_last"),
                    "csv_first": row.get("csv_first"),
                    "csv_middle": row.get("csv_middle"),
                    "error": str(exc),
                    "traceback": tb,
                }
            )
            print(f"FAIL {label}  ->  {exc}", file=sys.stderr)

    write_csv(OUT_INSERTED, inserted)
    write_csv(OUT_ERRORS, errors)

    print("")
    print(f"Inserted : {len(inserted)} -> {OUT_INSERTED.name}")
    print(f"Errors   : {len(errors)}   -> {OUT_ERRORS.name}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
