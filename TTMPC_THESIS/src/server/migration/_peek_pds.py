"""One-off: count PDS rows + check overlap with member."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import applicationConfirmation as ac

supabase, _, _ = ac._load_runtime_config()

# Count of PDS rows
all_pds = (
    supabase.table("personal_data_sheet")
    .select("membership_number_id", count="exact")
    .limit(1)
    .execute()
)
print(f"Total PDS rows: {all_pds.count}")

# Count member rows
all_member = (
    supabase.table("member")
    .select("id", count="exact")
    .limit(1)
    .execute()
)
print(f"Total member rows: {all_member.count}")

# Sample a few non-empty PDS rows (to see surname/first_name format and case)
non_empty = (
    supabase.table("personal_data_sheet")
    .select("personal_data_sheet_id, membership_number_id, surname, first_name, middle_name, gender, civil_status, date_of_birth")
    .not_.is_("gender", "null")
    .limit(5)
    .execute()
)
print("\nNon-empty PDS rows:")
for r in (non_empty.data or []):
    print(r)
