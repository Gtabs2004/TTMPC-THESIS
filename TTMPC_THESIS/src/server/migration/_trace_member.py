"""Trace a member by name across every data source to see why their loans are missing."""

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

NEEDLES = [n.upper() for n in sys.argv[1:]] or ["ZARAGOSA", "TABIOLO"]

MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
DF_CSV = REPO / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
PAYMENTS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Normalized_Payments.csv"
MEMBERS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "MembersProfile.csv"
BRIDGE = HERE / "member_bridge_final.csv"


def hit(row: dict, fields: list[str], needle: str) -> bool:
    for f in fields:
        v = (row.get(f) or "").upper()
        if needle in v:
            return True
    return False


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    bridge: dict[str, str] = {}
    if BRIDGE.exists():
        with BRIDGE.open("r", encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                bridge[row["csv_uuid"]] = row["member_id"]

    for needle in NEEDLES:
        print(f"\n{'=' * 70}")
        print(f"NEEDLE: {needle}")
        print('=' * 70)

        # ---- MembersProfile.csv
        print("\n-- MembersProfile.csv matches --")
        mp_matches: list[dict] = []
        if MEMBERS_CSV.exists():
            with MEMBERS_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
                for row in csv.DictReader(fh):
                    if hit(row, ["LastName", "FirstName", "MiddleName"], needle):
                        mp_matches.append(row)
        for r in mp_matches:
            uuid = (r.get("MasterUUID") or "").strip()
            in_bridge = "YES" if uuid in bridge else "NO"
            mid = bridge.get(uuid, "")
            print(f"  {r.get('LastName'):20} {r.get('FirstName'):20} MasterUUID={uuid}  bridge={in_bridge} {mid}")

        master_uuids = {(r.get("MasterUUID") or "").strip() for r in mp_matches if (r.get("MasterUUID") or "").strip()}

        # ---- Master_Analytical_Matrix.csv
        print("\n-- Master_Analytical_Matrix.csv (by name) --")
        matrix_by_name: list[dict] = []
        with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                if hit(row, ["LastName", "FirstName"], needle):
                    matrix_by_name.append(row)
        for r in matrix_by_name:
            uuid = (r.get("MasterUUID") or "").strip()
            in_bridge = "YES" if uuid in bridge else "NO"
            print(f"  LoanCode={r.get('LoanCode'):15} Type={r.get('LoanType'):12} Amt={r.get('LoanAmount'):>10} AppDate={r.get('ApplicationDate'):20} MasterUUID={uuid} bridge={in_bridge}")

        # ---- df_modeling_export.csv by name
        print("\n-- df_modeling_export.csv (by name) --")
        df_by_name: list[dict] = []
        with DF_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                if hit(row, ["LastName", "FirstName"], needle):
                    df_by_name.append(row)
        for r in df_by_name:
            print(f"  LoanCode={r.get('LoanCode'):15} LoanID={r.get('LoanID')}")

        # ---- Normalized_Payments.csv: any payments belonging to these MasterUUIDs?
        print("\n-- Normalized_Payments.csv (by MasterUUID of this member) --")
        if master_uuids:
            pay_hits = 0
            sample_loans: dict[str, int] = {}
            with PAYMENTS_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
                for row in csv.DictReader(fh):
                    mu = (row.get("MasterUUID") or "").strip()
                    if mu in master_uuids:
                        pay_hits += 1
                        lid = (row.get("LoanID") or "").strip()
                        sample_loans[lid] = sample_loans.get(lid, 0) + 1
            print(f"  payment rows: {pay_hits}")
            for lid, cnt in sorted(sample_loans.items(), key=lambda x: -x[1])[:10]:
                print(f"    LoanID={lid}  payments={cnt}")
        else:
            print("  (no MasterUUID resolved from MembersProfile so cannot scan)")

        # ---- Supabase: members and their loans
        print("\n-- Supabase member table --")
        for last_first in {(r.get("LastName") or "", r.get("FirstName") or "") for r in mp_matches} or {(needle, "")}:
            ln = last_first[0]
            if not ln:
                continue
            sb_members = (
                sb.table("member")
                .select("id, last_name, first_name, membership_id")
                .ilike("last_name", f"%{ln}%")
                .limit(20)
                .execute()
            ).data or []
            for m in sb_members:
                print(f"  member.id={m['id']}  {m.get('last_name')}, {m.get('first_name')} (mid={m.get('membership_id')})")
                # also probe Normalized_Payments by this member's name to find any LoanID they paid on

                loans = (
                    sb.table("loans")
                    .select("control_number, loan_amount, loan_status, raw_payload")
                    .eq("member_id", m["id"])
                    .execute()
                ).data or []
                if not loans:
                    print(f"    (no loans in public.loans for this member)")
                for l in loans:
                    rp = l.get("raw_payload") or {}
                    print(f"    loan {l['control_number']:18} amt={l['loan_amount']:>10} status={l['loan_status']:15} legacy={rp.get('legacy')} src={rp.get('source')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
