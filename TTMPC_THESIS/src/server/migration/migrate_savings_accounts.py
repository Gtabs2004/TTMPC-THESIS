"""
Migrate `normalize savings.csv` into public.savings_accounts and seed an
opening-balance credit into public.savings_ledger for each account.

CSV format:
    name,amount
    "Last, First",  "1,234.56 "
    Standalone account (no name),  "500.00 "

Logic:
- Match each `name` ("Last, First[, suffix]") against public.member.
  - If a unique member match is found  -> account_kind='member',  member_id=<uuid>.
  - If no name or no match              -> account_kind='standalone', member_id=NULL.
- Generate a stable account_number per row:  SA-000001, SA-000002, ...
  (idempotent: re-running skips rows whose account_number already exists).
- Insert the savings_accounts row with balance=0, then insert a 'credit'
  ledger entry with amount=<csv amount>.  The DB trigger updates the balance.

Usage (from repo root, with .env loaded by applicationConfirmation):
    python TTMPC_THESIS/src/server/migration/migrate_savings_accounts.py
    python TTMPC_THESIS/src/server/migration/migrate_savings_accounts.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

CSV_PATH = HERE / "normalize savings.csv"
REPORT_PATH = HERE / "savings_migration_report.csv"

ACCOUNT_PREFIX = "SA-"
ACCOUNT_PAD = 6

# Manual name overrides for CSV rows whose `name` doesn't match public.member
# verbatim (typos, suffixes, swapped first/last order, etc.).
# Key: the raw `name` value from the CSV (whitespace-trimmed, no quotes).
# Value: ("First", "Last") tuple to feed the matcher.
NAME_OVERRIDES: dict[str, tuple[str, str]] = {
    "Ballogdahan, Gracel":            ("Gracel", "Ballogdajan"),
    "Medecinio, May Joy Catherine":   ("May Joy Catherine", "Medicinio"),
    "Tabaniag, Mauro":                ("Mauro Jr.", "Tabaniag"),
    "Tacayon, R Jay":                 ("R-Jay", "Tacayon"),
    "Tagudinay, Rodelyn":             ("Rodelin", "Tagudinay"),
    "Talibo, Gerlyn May":             ("Gerrlyn May", "Talibo"),
}

# CSV rows whose `name` value is metadata/footer, not an account.
NAME_SKIP: set[str] = {"total"}


def parse_amount(raw: str) -> Decimal:
    cleaned = (raw or "").replace(",", "").replace("\xa0", "").strip().strip('"')
    if not cleaned:
        return Decimal("0.00")
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ValueError(f"Unparseable amount: {raw!r}") from exc


def split_name(raw: str) -> tuple[str, str] | None:
    """Convert 'Last, First [Middle]' -> (first, last). Returns None when blank."""
    cleaned = (raw or "").strip().strip('"')
    if not cleaned:
        return None
    if cleaned in NAME_OVERRIDES:
        return NAME_OVERRIDES[cleaned]
    parts = [p.strip() for p in cleaned.split(",") if p.strip()]
    if len(parts) < 2:
        # Single token name — treat the whole thing as last name.
        return ("", parts[0]) if parts else None
    last = parts[0]
    first = parts[1]  # First [Middle ...] — keep as-is for matching.
    return (first, last)


def load_member_index(supabase) -> dict[tuple[str, str], list[dict]]:
    """Build a (first_lower, last_lower) -> [member rows] index for matching."""
    table = ac._resolve_member_table(supabase)
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        chunk = (
            supabase.table(table)
            .select("id, first_name, last_name, membership_id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        data = chunk.data or []
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size

    index: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        first = (row.get("first_name") or "").strip().lower()
        last = (row.get("last_name") or "").strip().lower()
        index.setdefault((first, last), []).append(row)
    return index


def match_member(name_parts: tuple[str, str] | None,
                 index: dict[tuple[str, str], list[dict]]) -> dict | None:
    if not name_parts:
        return None
    first, last = name_parts
    first_l = first.strip().lower()
    last_l = last.strip().lower()

    # Exact (first, last)
    exact = index.get((first_l, last_l))
    if exact and len(exact) == 1:
        return exact[0]

    # First-token-only match (handles "Ma. Marites" vs "Ma" stored variations).
    first_token = re.split(r"[\s.]+", first_l, maxsplit=1)[0]
    if first_token and first_token != first_l:
        loose = index.get((first_token, last_l))
        if loose and len(loose) == 1:
            return loose[0]

    # Last-name-only fallback (only if it's unambiguous).
    same_last = [
        row for (f, l), rows in index.items() if l == last_l for row in rows
    ]
    if len(same_last) == 1:
        return same_last[0]

    return None


def existing_account_numbers(supabase) -> set[str]:
    out: set[str] = set()
    page = 1000
    offset = 0
    while True:
        chunk = (
            supabase.table("savings_accounts")
            .select("account_number")
            .range(offset, offset + page - 1)
            .execute()
        )
        data = chunk.data or []
        for row in data:
            if row.get("account_number"):
                out.add(row["account_number"])
        if len(data) < page:
            break
        offset += page
    return out


def next_account_number(used: set[str], counter: list[int]) -> str:
    while True:
        counter[0] += 1
        candidate = f"{ACCOUNT_PREFIX}{counter[0]:0{ACCOUNT_PAD}d}"
        if candidate not in used:
            used.add(candidate)
            return candidate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse + match only; do not write to Supabase.")
    parser.add_argument("--csv", default=str(CSV_PATH),
                        help="Override CSV path.")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1

    supabase, _, _ = ac._load_runtime_config()
    print(f"Connected: {supabase.supabase_url}")

    print("Building member index ...")
    member_index = load_member_index(supabase)
    print(f"  loaded {sum(len(v) for v in member_index.values())} members")

    used_numbers = set() if args.dry_run else existing_account_numbers(supabase)
    counter = [0]
    print(f"  existing savings_accounts rows: {len(used_numbers)}")

    rows_in: list[dict] = []
    # CSV was authored on Windows and contains accented chars (e.g. Dueñas)
    # in cp1252. Fall back if utf-8 decode fails.
    for enc in ("utf-8-sig", "cp1252"):
        try:
            with csv_path.open("r", encoding=enc, newline="") as fh:
                reader = csv.DictReader(fh)
                rows_in = list(reader)
            break
        except UnicodeDecodeError:
            rows_in = []
            continue

    print(f"Parsed {len(rows_in)} rows from CSV")

    report_rows: list[dict] = []
    inserted_accounts = 0
    inserted_ledger = 0
    standalone_count = 0
    matched_count = 0
    unmatched_count = 0
    errors = 0

    skipped_footer = 0
    for idx, raw in enumerate(rows_in, start=1):
        name_raw = raw.get("name", "")
        amount_raw = raw.get("amount", "")
        if name_raw.strip().strip('"').lower() in NAME_SKIP:
            skipped_footer += 1
            report_rows.append({"row": idx, "account_number": "", "account_name": name_raw,
                                "kind": "skipped", "member_id": "", "amount": amount_raw,
                                "status": "skipped", "detail": "footer/metadata row"})
            continue
        try:
            amount = parse_amount(amount_raw)
        except ValueError as exc:
            print(f"  row {idx}: {exc}", file=sys.stderr)
            errors += 1
            report_rows.append({"row": idx, "name": name_raw, "amount": amount_raw,
                                "status": "error", "detail": str(exc)})
            continue

        name_parts = split_name(name_raw)
        member = match_member(name_parts, member_index) if name_parts else None

        if member:
            kind = "member"
            account_name = f"{member.get('first_name', '').strip()} {member.get('last_name', '').strip()}".strip()
            member_id = member["id"]
            matched_count += 1
        elif name_parts:
            kind = "standalone"
            account_name = name_raw.strip().strip('"')
            member_id = None
            unmatched_count += 1
        else:
            kind = "standalone"
            account_name = "Standalone Account"
            member_id = None
            standalone_count += 1

        account_number = next_account_number(used_numbers, counter)

        status = "dry-run"
        detail = ""
        if not args.dry_run:
            try:
                supabase.table("savings_accounts").insert({
                    "account_number": account_number,
                    "account_name": account_name,
                    "member_id": member_id,
                    "account_kind": kind,
                    "balance": 0,
                    "notes": f"Migrated from normalize savings.csv (row {idx})",
                }).execute()
                inserted_accounts += 1

                if amount > 0:
                    supabase.table("savings_ledger").insert({
                        "account_number": account_number,
                        "entry_type": "credit",
                        "amount": str(amount),
                        "reference": f"CSV-MIGRATION-{idx}",
                        "source": "csv_migration",
                        "remarks": "Opening balance from normalize savings.csv",
                        "posted_by": "migration_script",
                    }).execute()
                    inserted_ledger += 1
                status = "ok"
            except Exception as exc:  # noqa: BLE001
                errors += 1
                status = "error"
                detail = str(exc)
                print(f"  row {idx} ({account_number}): {exc}", file=sys.stderr)

        report_rows.append({
            "row": idx,
            "account_number": account_number,
            "account_name": account_name,
            "kind": kind,
            "member_id": member_id or "",
            "amount": f"{amount:.2f}",
            "status": status,
            "detail": detail,
        })

    with REPORT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["row", "account_number", "account_name", "kind",
                        "member_id", "amount", "status", "detail"],
        )
        writer.writeheader()
        writer.writerows(report_rows)

    print()
    print(f"Matched to member       : {matched_count}")
    print(f"Standalone (no name)    : {standalone_count}")
    print(f"Standalone (no match)   : {unmatched_count}")
    print(f"Skipped (footer/meta)   : {skipped_footer}")
    print(f"Accounts inserted       : {inserted_accounts}")
    print(f"Ledger credits inserted : {inserted_ledger}")
    print(f"Errors                  : {errors}")
    print(f"Report written          : {REPORT_PATH}")
    if args.dry_run:
        print("(dry-run: no rows were written)")
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
