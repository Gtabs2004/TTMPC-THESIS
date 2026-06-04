"""One-off: stats on Master_Analytical_Matrix.csv."""
import csv
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
CSV = REPO / "src" / "analytics" / "RISK Assesment" / "TTMPC_Credit_Risk" / "Master_Analytical_Matrix.csv"

rows = list(csv.DictReader(CSV.open("r", encoding="utf-8-sig", newline="")))
print(f"Total rows: {len(rows)}")

# Label distribution
target = Counter()
target_missing = 0
for r in rows:
    t = (r["Target_Risk"] or "").strip()
    if not t:
        target_missing += 1
    else:
        target[t] += 1

print(f"Target_Risk distribution: {dict(target)}")
print(f"Target_Risk missing     : {target_missing}")

# Feature completeness
missing_amt = sum(1 for r in rows if not (r["LoanAmount"] or "").strip())
missing_stab = sum(1 for r in rows if not (r["Stability_Score"] or "").strip())
missing_adv = sum(1 for r in rows if not (r["Advance_Payment_Count"] or "").strip())
missing_stress = sum(1 for r in rows if not (r["Repayment_Stress_Index"] or "").strip())
missing_income = sum(1 for r in rows if not (r["AnnualIncome"] or "").strip())

print(f"\nFeature completeness:")
print(f"  LoanAmount missing            : {missing_amt}")
print(f"  Stability_Score missing       : {missing_stab}")
print(f"  Advance_Payment_Count missing : {missing_adv}")
print(f"  Repayment_Stress_Index missing: {missing_stress}")
print(f"  AnnualIncome missing          : {missing_income}")

# Loan type distribution
types = Counter(r["LoanType"] for r in rows)
print(f"\nLoan types: {dict(types)}")

# Occupation tiers
tiers = Counter(r["occ_tier"] for r in rows)
print(f"\nOccupation tiers: {dict(tiers)}")
