"""
TTMPC Credit Risk Model — server-side inference helpers.

Mirrors the feature contract in src/analytics/RISK Assesment/feature_contract.md
and the logic in predict_example.py. Do not change feature names, order, or
the -999 sentinel without retraining the model.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any


# Resolve model directory relative to this file: src/server/models/
_MODEL_DIR = Path(__file__).resolve().parent / "models"
_MODEL_PATH = _MODEL_DIR / "ttmpc_credit_risk_model.pkl"
_METADATA_PATH = _MODEL_DIR / "model_metadata.json"


FEATURE_COLUMNS = [
    "LoanAmount",
    "Stability_Score",
    "Advance_Payment_Count",
    "Income_Is_Missing",
    "Repayment_Stress_Index",
]


OCCUPATION_TIER_MAP: dict[str, str] = {
    # Public Sector / Institutional
    "Teaching": "Public_Sector_Institutional",
    "Retired Teacher": "Public_Sector_Institutional",
    "Government Employee": "Public_Sector_Institutional",
    "Adas Iii": "Public_Sector_Institutional",
    "Local Treasury Operations Offices Ii": "Public_Sector_Institutional",
    "Mpiw Employee": "Public_Sector_Institutional",
    "Admin Officer V": "Public_Sector_Institutional",
    "Adas Ii": "Public_Sector_Institutional",
    "Ada": "Public_Sector_Institutional",
    "Social Welfare Assistant": "Public_Sector_Institutional",
    "Senior Fire Inspector": "Public_Sector_Institutional",
    "Encoder": "Public_Sector_Institutional",
    "Assistant Pharmacist": "Public_Sector_Institutional",
    "Dietitian": "Public_Sector_Institutional",
    "Sb Member": "Public_Sector_Institutional",
    # Private Professional / Skilled
    "Seafarer": "Private_Professional_Skilled",
    "Automotive Technician": "Private_Professional_Skilled",
    "Beautician": "Private_Professional_Skilled",
    "Caregiver": "Private_Professional_Skilled",
    "Assistant Embalmer": "Private_Professional_Skilled",
    # Service / Support
    "Cashier": "Service_Support",
    "Store Clerk": "Service_Support",
    "Security Guard": "Service_Support",
    "Asst. Station Manager": "Service_Support",
    "Barber": "Service_Support",
    # Entrepreneurial / Informal
    "Business": "Entrepreneurial_Informal",
    "Vendor": "Entrepreneurial_Informal",
    "Entrepreneur": "Entrepreneurial_Informal",
    "Farmer": "Entrepreneurial_Informal",
    "Rice Dealer": "Entrepreneurial_Informal",
    "Small Business": "Entrepreneurial_Informal",
    # Fallback
    "Unknown": "Unclassified_High_Risk",
}

TIER_SCORE_MAP: dict[str, float] = {
    "Public_Sector_Institutional": 4.0,
    "Private_Professional_Skilled": 3.0,
    "Service_Support": 2.0,
    "Entrepreneurial_Informal": 1.0,
    "Unclassified_High_Risk": 2.0,
}


def normalize_occupation(occupation: Any) -> str:
    if not occupation or str(occupation).strip() == "":
        return "Unknown"
    occ = str(occupation).strip().title()
    if "Automative" in occ:
        occ = "Automotive Technician"
    return occ


def lookup_stability_score(occupation: Any) -> float:
    normalized = normalize_occupation(occupation)
    tier = OCCUPATION_TIER_MAP.get(normalized, "Unclassified_High_Risk")
    return TIER_SCORE_MAP[tier]


def _coerce_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", "").replace("₱", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def prepare_features(
    loan_amount: Any,
    occupation: Any,
    annual_income: Any,
    advance_payment_count: int = 0,
    monthly_amortization: Any = None,
    latest_net_pay: Any = None,
):
    """Returns a one-row pandas DataFrame. Imports pandas lazily."""
    import pandas as pd  # local import; ML deps loaded on demand

    loan_amount_f = _coerce_float(loan_amount) or 0.0
    income_f = _coerce_float(annual_income)
    monthly_amortization_f = _coerce_float(monthly_amortization)
    latest_net_pay_f = _coerce_float(latest_net_pay)

    stability_score = lookup_stability_score(occupation)
    # Determine if income is missing (legacy flag preserved)
    income_is_missing = 1 if (income_f is None or income_f == 0) else 0

    # New behavior: prefer monthly amortization / latest_net_pay for Repayment_Stress_Index
    if latest_net_pay_f is not None and latest_net_pay_f > 0 and monthly_amortization_f is not None:
        stress_index = (monthly_amortization_f / latest_net_pay_f) * 100.0
    else:
        # Fallback to legacy loan_amount / annual_income calculation when necessary
        if income_is_missing:
            stress_index = -999.0
        else:
            stress_index = (loan_amount_f / 12.0) / (income_f / 12.0) * 100.0

    row = {
        "LoanAmount": float(loan_amount_f),
        "Stability_Score": stability_score,
        "Advance_Payment_Count": int(advance_payment_count),
        "Income_Is_Missing": income_is_missing,
        "Repayment_Stress_Index": stress_index,
    }
    return pd.DataFrame([row])[FEATURE_COLUMNS]


# Lazy singleton model loader (thread-safe)
_model = None
_metadata: dict | None = None
_lock = threading.Lock()


class ModelNotAvailableError(RuntimeError):
    pass


def _load_model() -> tuple[Any, dict]:
    global _model, _metadata
    if _model is not None:
        return _model, _metadata or {}
    with _lock:
        if _model is not None:
            return _model, _metadata or {}
        if not _MODEL_PATH.exists():
            raise ModelNotAvailableError(
                f"Model file not found at {_MODEL_PATH}. "
                "Run the Colab notebook and place the .pkl and metadata.json "
                "into src/server/models/."
            )
        try:
            import joblib  # local import; only needed when model actually loads
        except ImportError as e:
            raise ModelNotAvailableError(
                "joblib is not installed. Install ML dependencies: "
                "pip install -r src/server/requirements.txt"
            ) from e
        _model = joblib.load(_MODEL_PATH)
        if _METADATA_PATH.exists():
            try:
                with open(_METADATA_PATH, "r", encoding="utf-8") as f:
                    _metadata = json.load(f)
            except Exception:
                _metadata = {}
        else:
            _metadata = {}
        return _model, _metadata


def model_version() -> str | None:
    try:
        _, meta = _load_model()
    except ModelNotAvailableError:
        return None
    return (
        meta.get("model_version")
        or meta.get("version")
        or meta.get("training_date")
    )


def score(
    loan_amount: Any,
    occupation: Any,
    annual_income: Any,
    advance_payment_count: int = 0,
    monthly_amortization: Any = None,
    latest_net_pay: Any = None,
) -> dict:
    model, meta = _load_model()
    X = prepare_features(
        loan_amount,
        occupation,
        annual_income,
        advance_payment_count,
        monthly_amortization,
        latest_net_pay,
    )
    risk_class = int(model.predict(X)[0])
    risk_prob = float(model.predict_proba(X)[0, 1])

    features_used = X.iloc[0].to_dict()
    features_used = {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in features_used.items()}

    return {
        "risk_class": risk_class,
        "risk_label": "High Risk" if risk_class == 1 else "Performing",
        "risk_probability": risk_prob,
        "features_used": features_used,
        "model_version": meta.get("model_version") or meta.get("version") or meta.get("training_date"),
    }
