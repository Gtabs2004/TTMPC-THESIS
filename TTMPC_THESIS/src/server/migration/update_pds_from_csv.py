"""
Populate public.personal_data_sheet from the historical MembersProfile.csv.

Each Supabase member already has a stub PDS row (auto-created on member insert).
This script UPDATES those stubs with the canonical demographics from the CSV.

Reads:
  - member_bridge_final.csv   (CSV row -> Supabase member_id + TTMPC-XXX)
  - ../../analytics/RISK Assesment/TTMPC_Credit_Risk/MembersProfile.csv

Writes:
  - pds_updated.csv  (audit log of what was updated)
  - pds_errors.csv   (rows that failed, with reason)
  - pds_ml_extras.csv (AnnualIncome, IncomeSource, Status, DependentCount —
                       data that has no PDS column but is useful for ML)

Usage (from src/server/):
  .venv/Scripts/python.exe migration/update_pds_from_csv.py --dry-run
  .venv/Scripts/python.exe migration/update_pds_from_csv.py --limit 3
  .venv/Scripts/python.exe migration/update_pds_from_csv.py
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER_DIR = HERE.parent
REPO_ROOT = SERVER_DIR.parent.parent  # .../TTMPC_THESIS
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import applicationConfirmation as ac  # noqa: E402

BRIDGE_CSV = HERE / "member_bridge_final.csv"
SOURCE_CSV = REPO_ROOT / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "MembersProfile.csv"

OUT_UPDATED = HERE / "pds_updated.csv"
OUT_ERRORS = HERE / "pds_errors.csv"
OUT_ML_EXTRAS = HERE / "pds_ml_extras.csv"


# ---------- transforms ----------

GENDER_MAP = {
    "F": "Female",
    "FEMALE": "Female",
    "M": "Male",
    "MALE": "Male",
}

CIVIL_STATUS_VALID = {"Single", "Married", "Separated", "Divorced", "Widowed"}


def norm_gender(value: str | None) -> str | None:
    if not value:
        return None
    key = str(value).strip().upper()
    return GENDER_MAP.get(key)


def norm_civil_status(value: str | None) -> str | None:
    if not value:
        return None
    v = str(value).strip().title()
    return v if v in CIVIL_STATUS_VALID else None


def norm_dob_iso(value: str | None) -> str | None:
    """Convert CSV 'DD/MM/YYYY' to ISO 'YYYY-MM-DD'. Returns None on failure."""
    if not value:
        return None
    v = str(value).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", v)
    if not m:
        # Already ISO? Pass through.
        if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return v
        return None
    d, mo, y = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}"


def norm_text(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def norm_int(value: str | None) -> int | None:
    if value is None:
        return None
    v = str(value).strip().replace(",", "").replace('"', "")
    if not v:
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


# ---------- I/O ----------

def load_bridge(path: Path) -> dict[str, dict]:
    """csv_row_no -> bridge row (with member_id, ttmpc_id)."""
    out: dict[str, dict] = {}
    with path.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            out[str(row["csv_row"])] = row
    return out


def load_source_csv(path: Path) -> list[dict]:
    out: list[dict] = []
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        for i, row in enumerate(csv.DictReader(fh), start=2):
            row["__row_no"] = i
            out.append(row)
    return out


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


# ---------- main ----------

def build_pds_payload(csv_row: dict, ttmpc_id: str, email: str | None) -> dict:
    pds_id = f"PDS-{ttmpc_id}"
    return {
        "personal_data_sheet_id": pds_id,
        "membership_number_id": ttmpc_id,
        "surname": norm_text(csv_row.get("LastName")),
        "first_name": norm_text(csv_row.get("FirstName")),
        "middle_name": norm_text(csv_row.get("MiddleName")),
        "date_of_birth": norm_dob_iso(csv_row.get("DateOfBirth")),
        "gender": norm_gender(csv_row.get("Gender")),
        "civil_status": norm_civil_status(csv_row.get("CivilStatus")),
        "tin_number": norm_text(csv_row.get("TIN")),
        "permanent_address": norm_text(csv_row.get("Address")),
        "occupation": norm_text(csv_row.get("Occupation")),
        "number_of_dependents": norm_int(csv_row.get("DependentCount")),
        "date_of_membership": norm_text(csv_row.get("DateJoined")),
        "email": norm_text(email),
    }


def fetch_email_for_member(supabase, member_id: str) -> str | None:
    """Look up the auth.users email for a member via member_account."""
    try:
        resp = (
            supabase.table("member_account")
            .select("email")
            .or_(f"user_id.eq.{member_id},auth_user_id.eq.{member_id}")
            .limit(1)
            .execute()
        )
        if resp.data:
            email = resp.data[0].get("email")
            return email if email else None
    except Exception:
        pass
    return None


def upsert_pds(supabase, payload: dict) -> dict:
    """Update existing PDS row by membership_number_id (it is UNIQUE)."""
    update_payload = {k: v for k, v in payload.items() if v is not None}
    # personal_data_sheet_id and membership_number_id are the keys; we don't update them.
    keyed_id = update_payload.pop("membership_number_id", None)
    update_payload.pop("personal_data_sheet_id", None)

    response = (
        supabase.table("personal_data_sheet")
        .update(update_payload)
        .eq("membership_number_id", keyed_id)
        .execute()
    )
    if not response.data:
        raise RuntimeError(
            f"No PDS row updated for membership_number_id={keyed_id}. "
            f"Stub row may be missing; check that member was inserted correctly."
        )
    return response.data[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Don't write to Supabase; print first 3 payloads.")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of rows processed (0 = all).")
    args = parser.parse_args()

    if not BRIDGE_CSV.exists():
        print(f"ERROR: missing {BRIDGE_CSV}", file=sys.stderr)
        return 2
    if not SOURCE_CSV.exists():
        print(f"ERROR: missing {SOURCE_CSV}", file=sys.stderr)
        return 2

    bridge = load_bridge(BRIDGE_CSV)
    source = load_source_csv(SOURCE_CSV)

    print(f"Bridge rows: {len(bridge)}")
    print(f"Source CSV rows: {len(source)}")

    if args.limit > 0:
        source = source[: args.limit]
        print(f"Processing first {len(source)} rows (--limit)")

    try:
        supabase, _, _ = ac._load_runtime_config()
    except Exception as exc:
        print(f"FAILED to load Supabase config: {exc}", file=sys.stderr)
        return 2
    print(f"Connected to Supabase: {supabase.supabase_url}")

    updated: list[dict] = []
    errors: list[dict] = []
    ml_extras: list[dict] = []

    for src_row in source:
        row_no = str(src_row["__row_no"])
        bridge_row = bridge.get(row_no)
        if not bridge_row:
            errors.append({
                "csv_row": row_no,
                "csv_last": src_row.get("LastName"),
                "csv_first": src_row.get("FirstName"),
                "error": "No bridge entry for this CSV row.",
            })
            continue

        member_id = bridge_row["member_id"]
        ttmpc_id = bridge_row["ttmpc_id"]
        label = f"[{ttmpc_id}] {src_row.get('LastName')}, {src_row.get('FirstName')}"

        email = fetch_email_for_member(supabase, member_id) if not args.dry_run else None
        payload = build_pds_payload(src_row, ttmpc_id, email)

        # Stash ML-relevant fields that have no PDS column.
        ml_extras.append({
            "csv_row": row_no,
            "member_id": member_id,
            "ttmpc_id": ttmpc_id,
            "annual_income": src_row.get("AnnualIncome"),
            "income_source": src_row.get("IncomeSource"),
            "status": src_row.get("Status"),
            "dependent_count": src_row.get("DependentCount"),
        })

        if args.dry_run:
            if len(updated) < 3:
                print(f"DRY {label}:")
                for k, v in payload.items():
                    if v is not None:
                        print(f"    {k} = {v!r}")
            updated.append({"csv_row": row_no, "ttmpc_id": ttmpc_id, "status": "dry_run", **payload})
            continue

        try:
            result = upsert_pds(supabase, payload)
            updated.append({
                "csv_row": row_no,
                "ttmpc_id": ttmpc_id,
                "personal_data_sheet_id": result.get("personal_data_sheet_id"),
                "status": "updated",
            })
            print(f"OK  {label}")
        except Exception as exc:
            errors.append({
                "csv_row": row_no,
                "csv_last": src_row.get("LastName"),
                "csv_first": src_row.get("FirstName"),
                "ttmpc_id": ttmpc_id,
                "error": str(exc),
                "traceback": traceback.format_exc(limit=2),
            })
            print(f"FAIL {label}  ->  {exc}", file=sys.stderr)

    write_csv(OUT_UPDATED, updated)
    write_csv(OUT_ERRORS, errors)
    write_csv(OUT_ML_EXTRAS, ml_extras)

    print("")
    print(f"Updated  : {len(updated)} -> {OUT_UPDATED.name}")
    print(f"Errors   : {len(errors)}  -> {OUT_ERRORS.name}")
    print(f"ML extras: {len(ml_extras)} -> {OUT_ML_EXTRAS.name}")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
