"""
TTMPC Credit Risk Model — Inference Example
============================================

Minimal working example showing how to load `ttmpc_credit_risk_model.pkl`
and score a loan application.

Requirements:
    pip install scikit-learn joblib pandas

Files needed alongside this script:
    - ttmpc_credit_risk_model.pkl
    - model_metadata.json        (optional, for runtime validation)

Usage:
    python predict_example.py
"""

import json
from pathlib import Path

import joblib
import pandas as pd


# =============================================================================
# 1. Configuration — adjust paths as needed
# =============================================================================
MODEL_PATH = Path("ttmpc_credit_risk_model.pkl")
METADATA_PATH = Path("model_metadata.json")


# =============================================================================
# 2. Feature contract — DO NOT MODIFY without retraining the model
# =============================================================================
FEATURE_COLUMNS = [
    "LoanAmount",
    "Stability_Score",
    "Advance_Payment_Count",
    "Income_Is_Missing",
    "Repayment_Stress_Index",
]

# Occupation -> Tier
OCCUPATION_TIER_MAP = {
    # Public Sector Institutional
    "Teaching":                              "Public_Sector_Institutional",
    "Retired Teacher":                       "Public_Sector_Institutional",
    "Government Employee":                   "Public_Sector_Institutional",
    "Adas Iii":                              "Public_Sector_Institutional",
    "Local Treasury Operations Offices Ii":  "Public_Sector_Institutional",
    "Mpiw Employee":                         "Public_Sector_Institutional",
    "Admin Officer V":                       "Public_Sector_Institutional",
    "Adas Ii":                               "Public_Sector_Institutional",
    "Ada":                                   "Public_Sector_Institutional",
    "Social Welfare Assistant":              "Public_Sector_Institutional",
    "Senior Fire Inspector":                 "Public_Sector_Institutional",
    "Encoder":                               "Public_Sector_Institutional",
    "Assistant Pharmacist":                  "Public_Sector_Institutional",
    "Dietitian":                             "Public_Sector_Institutional",
    "Sb Member":                             "Public_Sector_Institutional",
    # Private Professional / Skilled
    "Seafarer":                              "Private_Professional_Skilled",
    "Automotive Technician":                 "Private_Professional_Skilled",
    "Beautician":                            "Private_Professional_Skilled",
    "Caregiver":                             "Private_Professional_Skilled",
    "Assistant Embalmer":                    "Private_Professional_Skilled",
    # Service / Support
    "Cashier":                               "Service_Support",
    "Store Clerk":                           "Service_Support",
    "Security Guard":                        "Service_Support",
    "Asst. Station Manager":                 "Service_Support",
    "Barber":                                "Service_Support",
    # Entrepreneurial / Informal
    "Business":                              "Entrepreneurial_Informal",
    "Vendor":                                "Entrepreneurial_Informal",
    "Entrepreneur":                          "Entrepreneurial_Informal",
    "Farmer":                                "Entrepreneurial_Informal",
    "Rice Dealer":                           "Entrepreneurial_Informal",
    "Small Business":                        "Entrepreneurial_Informal",
    # Fallback
    "Unknown":                               "Unclassified_High_Risk",
}

# Tier -> Stability_Score
TIER_SCORE_MAP = {
    "Public_Sector_Institutional":  4.0,
    "Private_Professional_Skilled": 3.0,
    "Service_Support":              2.0,
    "Entrepreneurial_Informal":     1.0,
    "Unclassified_High_Risk":       2.0,  # conservative buffer
}


# =============================================================================
# 3. Feature preparation
# =============================================================================
def normalize_occupation(occupation: str | None) -> str:
    """Normalize an occupation string for tier lookup."""
    if not occupation or str(occupation).strip() == "":
        return "Unknown"
    occ = str(occupation).strip().title()
    if "Automative" in occ:  # known typo in source data
        occ = "Automotive Technician"
    return occ


def lookup_stability_score(occupation: str | None) -> float:
    """Map an occupation string to a Stability_Score (1.0 - 4.0)."""
    normalized = normalize_occupation(occupation)
    tier = OCCUPATION_TIER_MAP.get(normalized, "Unclassified_High_Risk")
    return TIER_SCORE_MAP[tier]


def prepare_features(
    loan_amount: float,
    occupation: str | None,
    annual_income: float | None,
    advance_payment_count: int = 0,
) -> pd.DataFrame:
    """
    Build a one-row feature matrix for a single applicant.

    Parameters
    ----------
    loan_amount : float
        Loan principal requested, in PHP.
    occupation : str | None
        The applicant's occupation as a string.
    annual_income : float | None
        Declared annual income in PHP. Use None or 0 if not declared.
    advance_payment_count : int
        Count of advance payments observed. For new applications, 0.

    Returns
    -------
    pd.DataFrame
        One-row DataFrame with columns in the model's expected order.
    """
    stability_score = lookup_stability_score(occupation)

    income_is_missing = 1 if (annual_income is None or annual_income == 0) else 0

    if income_is_missing:
        repayment_stress_index = -999.0   # sentinel — DO NOT change
    else:
        # Monthly amortization / monthly income, as a percentage
        repayment_stress_index = (loan_amount / 12.0) / (annual_income / 12.0) * 100.0

    row = {
        "LoanAmount":             float(loan_amount),
        "Stability_Score":        stability_score,
        "Advance_Payment_Count":  int(advance_payment_count),
        "Income_Is_Missing":      income_is_missing,
        "Repayment_Stress_Index": repayment_stress_index,
    }

    return pd.DataFrame([row])[FEATURE_COLUMNS]  # enforce column order


# =============================================================================
# 4. Prediction
# =============================================================================
def score_application(
    model,
    loan_amount: float,
    occupation: str | None,
    annual_income: float | None,
    advance_payment_count: int = 0,
) -> dict:
    """Score a single loan application. Returns dict with class and probability."""
    X = prepare_features(loan_amount, occupation, annual_income, advance_payment_count)

    risk_class = int(model.predict(X)[0])
    risk_prob  = float(model.predict_proba(X)[0, 1])

    return {
        "risk_class": risk_class,
        "risk_label": "High Risk" if risk_class == 1 else "Performing",
        "risk_probability": risk_prob,
        "features_used": X.iloc[0].to_dict(),
    }


# =============================================================================
# 5. Demo
# =============================================================================
def main():
    # Load model once at startup
    print(f"Loading model from {MODEL_PATH}...")
    model = joblib.load(MODEL_PATH)
    print("Model loaded.\n")

    # Optional: print metadata summary
    if METADATA_PATH.exists():
        with open(METADATA_PATH) as f:
            meta = json.load(f)
        print(f"Model trained: {meta.get('training_date', '?')}")
        print(f"Test accuracy: {meta.get('test_accuracy', '?')}")
        print(f"Test ROC-AUC : {meta.get('test_roc_auc',  '?')}\n")

    # ---- Example applications ----
    test_cases = [
        {
            "label": "Teacher, moderate loan, income declared",
            "loan_amount": 50_000,
            "occupation":  "Teaching",
            "annual_income": 360_000,
        },
        {
            "label": "Vendor, large loan, income declared",
            "loan_amount": 150_000,
            "occupation":  "Vendor",
            "annual_income": 180_000,
        },
        {
            "label": "Unknown occupation, income NOT declared",
            "loan_amount": 75_000,
            "occupation":  "Sales Associate",   # not in the tier map
            "annual_income": None,              # missing income
        },
        {
            "label": "Government employee, small loan, no income declared",
            "loan_amount": 20_000,
            "occupation":  "Government Employee",
            "annual_income": None,
        },
    ]

    print("=" * 70)
    for case in test_cases:
        result = score_application(
            model,
            loan_amount=case["loan_amount"],
            occupation=case["occupation"],
            annual_income=case["annual_income"],
        )
        print(f"\n{case['label']}")
        print(f"  Loan: PHP {case['loan_amount']:,} | Occupation: {case['occupation']!r} | Income: {case['annual_income']}")
        print(f"  -> {result['risk_label']:12s} | P(High Risk)={result['risk_probability']:.3f}")
        print(f"  Features fed to model: {result['features_used']}")
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
