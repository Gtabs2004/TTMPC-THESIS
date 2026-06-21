"""
Backfill the bridge between legacy `Savings_Transactions` and new `savings_accounts`.

For every row in public."Savings_Transactions":
  1. Try to find a matching `savings_accounts` row already migrated from
     normalize savings.csv. Match preference:
       a. By legacy_savings_id (skip — already linked).
       b. By member_id (resolve via Savings_Transactions.membership_number_id
          -> member.membership_id -> member.id, then look for any unlinked
          savings_accounts row with that member_id).
       c. By account_name (case-insensitive, only if unique).
  2. If matched and unlinked, set savings_accounts.legacy_savings_id.
  3. If no match, create a NEW savings_accounts row:
       - account_kind = 'member' if member_id resolvable, else 'standalone'
       - legacy_savings_id = the legacy Savings_ID
       - balance = 0 (the legacy Balance will sync via mirror writes going
         forward; we do NOT seed a ledger credit here to avoid double-counting
         the migrated CSV opening balance)

After this script runs, every legacy account has a `savings_accounts`
counterpart, and `v_savings_balance_reconciliation` shows current drift.

Usage:
    python TTMPC_THESIS/src/server/migration/backfill_savings_accounts_bridge.py --dry-run
    python TTMPC_THESIS/src/server/migration/backfill_savings_accounts_bridge.py
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

REPORT_PATH = HERE / "savings_bridge_backfill_report.csv"
ACCOUNT_PREFIX = "SA-"
ACCOUNT_PAD = 6


def page_all(supabase, table: str, columns: str) -> list[dict]:
    out: list[dict] = []
    page = 1000
    offset = 0
    while True:
        chunk = (
            supabase.table(table).select(columns).range(offset, offset + page - 1).execute()
        )
        data = chunk.data or []
        out.extend(data)
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
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase, _, _ = ac._load_runtime_config()
    print(f"Connected: {supabase.supabase_url}")

    member_table = ac._resolve_member_table(supabase)

    print("Loading member table ...")
    members = page_all(supabase, member_table, "id,membership_id,first_name,last_name")
    member_by_membership_id: dict[str, dict] = {}
    for m in members:
        key = str(m.get("membership_id") or "").strip().upper()
        if key:
            member_by_membership_id[key] = m
    print(f"  {len(members)} members loaded")

    print("Loading savings_accounts ...")
    accounts = page_all(
        supabase,
        "savings_accounts",
        "account_number,account_name,member_id,legacy_savings_id,account_kind",
    )
    used_numbers = {a["account_number"] for a in accounts if a.get("account_number")}
    counter = [0]
    # Seed counter past existing max so new SA-NNNNNN slots are unique.
    for num in used_numbers:
        if num.startswith(ACCOUNT_PREFIX):
            try:
                counter[0] = max(counter[0], int(num[len(ACCOUNT_PREFIX):]))
            except ValueError:
                continue

    accounts_by_member: dict[str, list[dict]] = {}
    accounts_by_name: dict[str, list[dict]] = {}
    linked_legacy_ids: set[str] = set()
    for acc in accounts:
        if acc.get("legacy_savings_id"):
            linked_legacy_ids.add(str(acc["legacy_savings_id"]).strip())
        if acc.get("member_id"):
            accounts_by_member.setdefault(str(acc["member_id"]), []).append(acc)
        name_key = str(acc.get("account_name") or "").strip().lower()
        if name_key:
            accounts_by_name.setdefault(name_key, []).append(acc)
    print(f"  {len(accounts)} savings_accounts rows ({len(linked_legacy_ids)} already linked)")

    print("Loading legacy Savings_Transactions ...")
    legacy = page_all(
        supabase,
        "Savings_Transactions",
        "Savings_ID,Account_Name,Account_Number,membership_number_id,Balance",
    )
    print(f"  {len(legacy)} legacy savings rows")

    report_rows: list[dict] = []
    linked_count = 0
    created_count = 0
    already_linked = 0
    errors = 0

    for row in legacy:
        savings_id = str(row.get("Savings_ID") or "").strip()
        if not savings_id:
            continue
        if savings_id in linked_legacy_ids:
            already_linked += 1
            report_rows.append({"savings_id": savings_id, "action": "skip",
                                "account_number": "", "detail": "already linked"})
            continue

        membership_key = str(row.get("membership_number_id") or "").strip().upper()
        member = member_by_membership_id.get(membership_key) if membership_key else None
        member_id = member["id"] if member else None

        account_name = str(row.get("Account_Name") or "").strip()
        if not account_name and member:
            account_name = f"{member.get('first_name','').strip()} {member.get('last_name','').strip()}".strip()
        if not account_name:
            account_name = f"Legacy {savings_id}"

        target: dict | None = None

        # Match preference (b): by member_id, only if exactly one unlinked match.
        if member_id:
            candidates = [
                a for a in accounts_by_member.get(member_id, [])
                if not a.get("legacy_savings_id")
            ]
            if len(candidates) == 1:
                target = candidates[0]

        # Match preference (c): by account_name (only if unique unlinked match).
        if target is None and account_name:
            name_key = account_name.lower()
            candidates = [
                a for a in accounts_by_name.get(name_key, [])
                if not a.get("legacy_savings_id")
            ]
            if len(candidates) == 1:
                target = candidates[0]

        if target is not None:
            action = "link"
            account_number = target["account_number"]
            if not args.dry_run:
                try:
                    supabase.table("savings_accounts").update({
                        "legacy_savings_id": savings_id,
                    }).eq("account_number", account_number).execute()
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    report_rows.append({"savings_id": savings_id, "action": "error",
                                        "account_number": account_number, "detail": str(exc)})
                    continue
            target["legacy_savings_id"] = savings_id
            linked_legacy_ids.add(savings_id)
            linked_count += 1
            report_rows.append({"savings_id": savings_id, "action": action,
                                "account_number": account_number,
                                "detail": "matched by member" if member_id else "matched by name"})
            continue

        # No match -> create new savings_accounts row.
        kind = "member" if member_id else "standalone"
        account_number = next_account_number(used_numbers, counter)
        action = "create"
        if not args.dry_run:
            try:
                supabase.table("savings_accounts").insert({
                    "account_number": account_number,
                    "account_name": account_name,
                    "member_id": member_id,
                    "account_kind": kind,
                    "balance": 0,
                    "legacy_savings_id": savings_id,
                    "notes": f"Backfilled from Savings_Transactions ({savings_id})",
                }).execute()
            except Exception as exc:  # noqa: BLE001
                errors += 1
                report_rows.append({"savings_id": savings_id, "action": "error",
                                    "account_number": account_number, "detail": str(exc)})
                continue
        linked_legacy_ids.add(savings_id)
        created_count += 1
        report_rows.append({"savings_id": savings_id, "action": action,
                            "account_number": account_number,
                            "detail": f"kind={kind}, member_id={member_id or ''}"})

    with REPORT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=["savings_id", "action", "account_number", "detail"]
        )
        writer.writeheader()
        writer.writerows(report_rows)

    print()
    print(f"Already linked     : {already_linked}")
    print(f"Newly linked       : {linked_count}")
    print(f"Newly created      : {created_count}")
    print(f"Errors             : {errors}")
    print(f"Report             : {REPORT_PATH}")
    if args.dry_run:
        print("(dry-run: no writes)")
    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
