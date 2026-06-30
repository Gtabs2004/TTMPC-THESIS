"""
Insert ONE placeholder member to own unattributed historical loans.

This member is a bucket, not a real person. Real loans get reassigned
to actual members later via the orphan_loans_audit.csv workflow.

Writes:
  - placeholder_member_id.txt  (the new member.id UUID — used by downstream scripts)
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

PLACEHOLDER_ID_FILE = HERE / "placeholder_member_id.txt"

PLACEHOLDER_FIRST = "UNKNOWN"
PLACEHOLDER_LAST = "HISTORICAL BORROWER"
PLACEHOLDER_EMAIL_BASE = "ttmpc-unknown-historical@ttmpc.local"


def main() -> int:
    supabase, _, _ = ac._load_runtime_config()
    print(f"Connected: {supabase.supabase_url}")

    # Check if a placeholder already exists by membership_id naming convention.
    # We use a fixed membership_id "TTMPC-UNKNOWN" so this script is idempotent.
    member_table = ac._resolve_member_table(supabase)
    existing = (
        supabase.table(member_table)
        .select("id, membership_id, first_name, last_name")
        .eq("first_name", PLACEHOLDER_FIRST)
        .eq("last_name", PLACEHOLDER_LAST)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        print(f"Placeholder already exists: {row['membership_id']}  id={row['id']}")
        PLACEHOLDER_ID_FILE.write_text(row["id"], encoding="utf-8")
        print(f"Wrote {PLACEHOLDER_ID_FILE.name}")
        return 0

    # Create new placeholder.
    # Generate the next TTMPC-XXX via existing logic (will be TTMPC-294 or next free).
    membership_id = ac.generate_membership_id(supabase)
    today_iso = datetime.now(timezone.utc).date().isoformat()
    email = PLACEHOLDER_EMAIL_BASE

    # Create auth.users (idempotent via _get_or_create_auth_user_id).
    auth_user_id, was_created, _pw = ac._get_or_create_auth_user_id(
        supabase, email=email, last_name=PLACEHOLDER_LAST
    )
    print(f"Auth user: {auth_user_id}  (created={was_created})")

    # Create member_account row. is_email_dummy=True so the route guard forces
    # the change-email flow on first login (this is a placeholder address).
    ac.set_new_account_temporary(
        supabase,
        auth_user_id=auth_user_id,
        email=email,
        membership_id=membership_id,
        is_email_dummy=True,
    )

    # Create the member record.
    application_data = {
        "first_name": PLACEHOLDER_FIRST,
        "last_name": PLACEHOLDER_LAST,
        "middle_name": "",
    }
    member_row = ac.create_member(
        supabase=supabase,
        application_data=application_data,
        membership_id=membership_id,
        membership_date=today_iso,
        auth_user_id=auth_user_id,
    )

    member_id = member_row.get("id") or auth_user_id
    print(f"Placeholder member created: {membership_id}  id={member_id}")

    PLACEHOLDER_ID_FILE.write_text(member_id, encoding="utf-8")
    print(f"Wrote {PLACEHOLDER_ID_FILE.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
