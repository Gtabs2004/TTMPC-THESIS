# Feature Contract — TTMPC Credit Risk Model

This document specifies the inputs the trained model expects. **Read this before integrating `ttmpc_credit_risk_model.pkl` into the loan management system.**

The model is a scikit-learn `RandomForestClassifier`. It takes exactly **5 numeric features in a specific order** and outputs a binary risk classification.

---

## 1. Quick reference

| # | Feature | Type | Source |
|---|---|---|---|
| 1 | `LoanAmount` | float | The principal applied for, in PHP |
| 2 | `Stability_Score` | float | Derived from the applicant's occupation (lookup table below) |
| 3 | `Advance_Payment_Count` | int | Count of payments made before the application date — for a new application, this is `0` |
| 4 | `Income_Is_Missing` | int (0 or 1) | `1` if the applicant did not declare income, else `0` |
| 5 | `Repayment_Stress_Index` | float | `(LoanAmount / 12) / (AnnualIncome / 12) × 100`. **If income missing, use `-999`** |

**Order matters.** Feeding features in any other order produces silently wrong predictions — no error, just garbage.

**Output**: `0` = Performing, `1` = High Risk.

---

## 2. Feature computation in detail

### 2.1 `LoanAmount`

The principal amount the applicant is requesting, as a number in Philippine Pesos. Strip any commas, currency symbols, or whitespace before passing.

```python
LoanAmount = float(application.loan_amount)  # e.g., 50000.0
```

### 2.2 `Stability_Score`

Derived from the applicant's occupation using the tier table below. The occupation string must be normalized (Title Case, whitespace trimmed) before lookup.

**Step 1**: Normalize the occupation string.

```python
def normalize_occupation(occ):
    if not occ or str(occ).strip() == "":
        return "Unknown"
    occ = str(occ).strip().title()
    if "Automative" in occ:  # known typo in source data
        occ = "Automotive Technician"
    return occ
```

**Step 2**: Look up the tier, then the score. Unknown occupations fall through to `Unclassified_High_Risk` (score `2.0`).

| Occupation | Tier | `Stability_Score` |
|---|---|---|
| Teaching, Retired Teacher, Government Employee, Adas Iii, Local Treasury Operations Offices Ii, Mpiw Employee, Admin Officer V, Adas Ii, Ada, Social Welfare Assistant, Senior Fire Inspector, Encoder, Assistant Pharmacist, Dietitian, Sb Member | Public_Sector_Institutional | **4** |
| Seafarer, Automotive Technician, Beautician, Caregiver, Assistant Embalmer | Private_Professional_Skilled | **3** |
| Cashier, Store Clerk, Security Guard, Asst. Station Manager, Barber | Service_Support | **2** |
| Business, Vendor, Entrepreneur, Farmer, Rice Dealer, Small Business | Entrepreneurial_Informal | **1** |
| *Anything not in the above lists* | Unclassified_High_Risk | **2.0** |

The full mapping dictionary is in `model_metadata.json` and `predict_example.py`. **Treat these as the single source of truth.** If a new occupation appears in production, decide its tier with the credit committee before adding it to the map.

### 2.3 `Advance_Payment_Count`

For a **new loan application** (no payment history yet), this is **`0`**.

For **historical evaluation** of an existing loan, count payments where:

```
payment_date - application_date  is between -30 and -1 days (inclusive)
```

That is, payments made 1 to 30 days *before* the application date. This captures cooperative members who make early/advance deposits — a positive credit signal.

> Payments more than 30 days before application are flagged as **date errors**, not advance payments, and are excluded from the count.

### 2.4 `Income_Is_Missing`

Binary flag derived from `AnnualIncome`:

```python
Income_Is_Missing = 1 if (AnnualIncome is None or AnnualIncome == 0) else 0
```

This is **critical**. The training data has ~51% missing income, and the model learned to use the missingness pattern itself as a risk signal. If you impute or default income to a placeholder without setting this flag, the model loses that signal.

### 2.5 `Repayment_Stress_Index`

```python
if Income_Is_Missing == 1:
    Repayment_Stress_Index = -999    # sentinel for missing
else:
    Repayment_Stress_Index = (LoanAmount / 12) / (AnnualIncome / 12) * 100
```

The `-999` sentinel is part of the contract — do not change it. The Random Forest splits on it to isolate the missing-income population.

---

## 3. Target interpretation

The model output is binary:

| Value | Meaning |
|---|---|
| `0` | **Performing** — applicant profile resembles loans that were paid down to ≤15% remaining principal *and/or* showed advance-payment behavior. |
| `1` | **High Risk** — applicant profile resembles loans where principal remained >15% unpaid *and* no advance-payment behavior was observed. |

For graded risk output, use `predict_proba()` to get the probability of class `1` (returns a value between 0.0 and 1.0).

---

## 4. Minimal integration example

```python
import joblib
import pandas as pd

# Load once at service startup
model = joblib.load("ttmpc_credit_risk_model.pkl")

FEATURE_COLUMNS = [
    "LoanAmount", "Stability_Score", "Advance_Payment_Count",
    "Income_Is_Missing", "Repayment_Stress_Index"
]

def score_application(loan_amount, occupation, annual_income):
    stability_score = lookup_stability(occupation)  # see predict_example.py
    income_missing = 1 if (annual_income is None or annual_income == 0) else 0
    stress_index = -999 if income_missing else (loan_amount / annual_income) * 100

    X = pd.DataFrame([{
        "LoanAmount":             loan_amount,
        "Stability_Score":        stability_score,
        "Advance_Payment_Count":  0,           # new application, no history
        "Income_Is_Missing":      income_missing,
        "Repayment_Stress_Index": stress_index,
    }])[FEATURE_COLUMNS]   # enforce column order

    risk_class = int(model.predict(X)[0])           # 0 or 1
    risk_prob  = float(model.predict_proba(X)[0, 1]) # P(High Risk)
    return {"risk_class": risk_class, "risk_probability": risk_prob}
```

See `predict_example.py` for the complete runnable version with the occupation lookup included.

---

## 5. Limitations and operational notes

- **Trained on historical data**, with the target derived from observed payment behavior. The model is a screening tool, not a final decision.
- **Class-balanced training**: the model uses `class_weight='balanced'` to protect against the natural majority of performing loans. This means it is calibrated for recall of high-risk cases, sometimes at the cost of false positives.
- **No fairness/protected-attribute auditing has been performed yet.** Adding age, gender, or other sensitive features without bias review is out of scope for the current model.
- **Retraining cadence**: recommended every 6–12 months as new repayment history accumulates. The notebook that produces the model is `TTMPC_Production_Notebook.ipynb`.
- **Sklearn version**: the model was trained with a specific scikit-learn version (see `model_metadata.json`). Loading with a substantially different version may emit warnings or fail; pin the version in production.

---

## 6. Contact

For questions about feature definitions, target labels, or the occupation tier mapping, contact the analytics team before changing anything in this contract.
