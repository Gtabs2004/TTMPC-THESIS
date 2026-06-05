"""Fuzzy-find a loan code across Supabase + source CSVs."""

import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVER = HERE.parent
REPO = SERVER.parent.parent
sys.path.insert(0, str(SERVER))

import applicationConfirmation as ac  # noqa: E402

NEEDLE = (sys.argv[1] if len(sys.argv) > 1 else "131").upper()

MATRIX_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"
DF_CSV = REPO / "src" / "analytics" / "Loan Demand Forecasting" / "Data" / "df_modeling_export (1).csv"
PAYMENTS_CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Normalized_Payments.csv"


def main() -> int:
    sb, _, _ = ac._load_runtime_config()

    print(f"=== Supabase loans LIKE %{NEEDLE}% ===")
    resp = (
        sb.table("loans")
        .select("control_number, loan_amount, loan_status")
        .ilike("control_number", f"%{NEEDLE}%")
        .limit(20)
        .execute()
    )
    for r in (resp.data or []):
        print(f"  {r['control_number']}  amt={r['loan_amount']}  status={r['loan_status']}")
    if not resp.data:
        print("  (none)")

    print(f"\n=== Master_Analytical_Matrix.csv rows with LoanCode containing {NEEDLE} ===")
    hits = 0
    with MATRIX_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            code = (row.get("LoanCode") or "").upper()
            if NEEDLE in code:
                print(f"  LoanCode={row['LoanCode']}  LoanID={row['LoanID']}  Type={row.get('LoanType')}  MasterUUID={row.get('MasterUUID')}")
                hits += 1
                if hits >= 20:
                    break
    if hits == 0:
        print("  (none)")

    print(f"\n=== df_modeling_export.csv rows with LoanCode containing {NEEDLE} ===")
    hits = 0
    with DF_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            code = (row.get("LoanCode") or "").upper()
            if NEEDLE in code:
                print(f"  LoanCode={row['LoanCode']}  LoanID={row['LoanID']}")
                hits += 1
                if hits >= 20:
                    break
    if hits == 0:
        print("  (none)")

    print(f"\n=== Normalized_Payments.csv rows with PaymentCode containing {NEEDLE} ===")
    hits = 0
    with PAYMENTS_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            code = (row.get("PaymentCode") or "").upper()
            if NEEDLE in code:
                print(f"  PaymentCode={row['PaymentCode']}  LoanID={row['LoanID']}  amount={row.get('AmountPaid')}  date={row.get('PaymentDate')}")
                hits += 1
                if hits >= 20:
                    break
    if hits == 0:
        print("  (none)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
