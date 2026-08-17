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


# ---------------------------------------------------------------------------
# Model-agnostic driver contributions.
#
# This is the ONE place the Credit Risk UI depends on. When the new model
# arrives, only this function needs to adapt:
#   * Linear models  → coefficient × standardized_value
#   * Tree models    → SHAP values (add `import shap`, wrap explainer)
#   * Anything else  → surface top-k feature importances × value
#
# The UI reads {feature, value, cohort_median, contribution, direction} and
# has no other assumption about the model type, so a swap is backend-only.
# ---------------------------------------------------------------------------

# Cohort-median cache. Computed once from training/reference metadata (or
# derived from historical scoring calls if metadata doesn't ship medians).
# Falls back to conservative defaults matching the current LR feature space.
_COHORT_MEDIANS_FALLBACK: dict[str, float] = {
    "LoanAmount": 50000.0,
    "Stability_Score": 3.0,
    "Advance_Payment_Count": 0.0,
    "Income_Is_Missing": 0.0,
    "Repayment_Stress_Index": 20.0,
}


def _cohort_medians() -> dict[str, float]:
    """Prefer medians shipped in model_metadata.json; else use fallback."""
    try:
        _, meta = _load_model()
    except ModelNotAvailableError:
        return dict(_COHORT_MEDIANS_FALLBACK)
    shipped = meta.get("cohort_medians") if isinstance(meta, dict) else None
    if isinstance(shipped, dict) and shipped:
        return {k: float(shipped.get(k, _COHORT_MEDIANS_FALLBACK.get(k, 0.0))) for k in FEATURE_COLUMNS}
    return dict(_COHORT_MEDIANS_FALLBACK)


def _driver_contributions(model, feature_values: dict[str, float]) -> list[dict]:
    """
    Per-feature contribution to the score. Result is sorted by absolute
    contribution descending; top-of-list = biggest score driver.

    Model-swap notes:
      - sklearn LogisticRegression / LinearRegression → uses .coef_
      - Tree ensembles → replace body with shap.TreeExplainer(model).shap_values(...)
      - Keeps output shape stable regardless of model internals.
    """
    contributions: list[dict] = []

    coef = getattr(model, "coef_", None)
    if coef is not None:
        try:
            # Binary classifier: coef_ shape is (1, n_features)
            weights = coef[0] if hasattr(coef, "__len__") and len(coef) else coef
            for i, feat in enumerate(FEATURE_COLUMNS):
                w = float(weights[i]) if i < len(weights) else 0.0
                v = float(feature_values.get(feat, 0.0))
                # Contribution = weight * value (log-odds contribution for LR).
                # For thesis-level UI this is a defensible "which input pushed
                # the score up/down" attribution.
                contributions.append({
                    "feature": feat,
                    "value": v,
                    "contribution": w * v,
                })
        except Exception:
            contributions = []

    # Fallback for models without .coef_ (trees, ensembles) — surface raw
    # feature values scaled by feature_importances_ if available.
    if not contributions:
        importances = getattr(model, "feature_importances_", None)
        if importances is not None and len(importances) >= len(FEATURE_COLUMNS):
            for i, feat in enumerate(FEATURE_COLUMNS):
                imp = float(importances[i])
                v = float(feature_values.get(feat, 0.0))
                contributions.append({
                    "feature": feat,
                    "value": v,
                    "contribution": imp * v,
                })
        else:
            # Last-resort: no attribution available — return values only so
            # the UI still renders something rather than crashing.
            for feat in FEATURE_COLUMNS:
                contributions.append({
                    "feature": feat,
                    "value": float(feature_values.get(feat, 0.0)),
                    "contribution": 0.0,
                })

    return sorted(contributions, key=lambda c: abs(c["contribution"]), reverse=True)


def score_with_drivers(
    loan_amount: Any,
    occupation: Any,
    annual_income: Any,
    advance_payment_count: int = 0,
    monthly_amortization: Any = None,
    latest_net_pay: Any = None,
) -> dict:
    """
    Same inputs as score(), but returns the normalized payload the Credit
    Risk UI reads:

        {
          "probability": float,          # 0..1
          "risk_label": str,             # "High Risk" | "Performing"
          "model_version": str | None,
          "drivers": [                   # sorted, biggest first
            {
              "feature": str,
              "value": float,
              "cohort_median": float,
              "contribution": float,     # signed — positive = pushes score UP
              "direction": "up" | "down" | "neutral",
            },
            ...
          ],
        }

    Frontend must not depend on anything beyond this shape.
    """
    base = score(
        loan_amount,
        occupation,
        annual_income,
        advance_payment_count,
        monthly_amortization,
        latest_net_pay,
    )
    model, _ = _load_model()
    medians = _cohort_medians()
    contribs = _driver_contributions(model, base["features_used"])
    drivers = []
    for c in contribs:
        contribution = float(c["contribution"])
        if contribution > 1e-9:
            direction = "up"
        elif contribution < -1e-9:
            direction = "down"
        else:
            direction = "neutral"
        drivers.append({
            "feature": c["feature"],
            "value": float(c["value"]),
            "cohort_median": float(medians.get(c["feature"], 0.0)),
            "contribution": contribution,
            "direction": direction,
        })
    return {
        "probability": float(base["risk_probability"]),
        "risk_label": base["risk_label"],
        "model_version": base.get("model_version"),
        "drivers": drivers,
    }
