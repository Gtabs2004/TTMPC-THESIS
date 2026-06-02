"""Look up loan_types table."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import applicationConfirmation as ac

supabase, _, _ = ac._load_runtime_config()

# Try common names.
for table in ("loan_types", "loan_type", "loan_categories"):
    try:
        resp = supabase.table(table).select("*").limit(20).execute()
        if resp.data is not None:
            print(f"=== {table} ({len(resp.data)} rows) ===")
            for r in resp.data:
                print(f"  {r}")
            break
    except Exception as e:
        print(f"{table}: {e}")
