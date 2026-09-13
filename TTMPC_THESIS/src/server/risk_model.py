"""
TTMPC Credit Risk Model — server-side inference helpers (v3.3).

Implements the feature contract in
`src/analytics/RISK Assesment/New Model/DEVELOPER_HANDOFF.md`.

The model is a HistGradientBoostingClassifier shipped inside a pickled bundle
dict alongside its feature list and operating thresholds. Three rules from the
handoff are load-bearing and must not be "tidied away":

  1. NaN means unknown. Do NOT impute, and do NOT substitute 0 — a blank and a
     zero carry different meanings and the model handles NaN natively.
  2. Thresholds are read from the bundle, never hardcoded. They are recomputed
     at every retraining.
  3. ShareCapital (#16) and Groceries (#20) are cooperative classification
     POINT scores (0-20 and 3-10), not peso amounts.

Feature assembly from the database lives in `risk_features.py`; this module
only turns an assembled feature dict into a score.
"""

from __future__ import annotations

import pickle
import threading
from pathlib import Path
from typing import Any


# Resolve model directory relative to this file: src/server/models/
_MODEL_DIR = Path(__file__).resolve().parent / "models"
_MODEL_PATH = _MODEL_DIR / "ttmpc_risk_model.pkl"


# Canonical order is read from the bundle at load time; this mirrors it so the
# module can be imported (and the feature list referenced) without the .pkl
# being present. _load_model() asserts the two agree.
FEATURE_COLUMNS = [
    "LoanAmount",
    "Term",
    "MonthlyDue",
    "Dependents",
    "OccTier",
    "Age",
    "PriorLoans",
    "PriorRefinances",
    "PriorBehind",
    "PriorRestructured",
    "PriorPenalties",
    "PriorBorrowed",
    "DebtGrowth",
    "MonthsSinceLastLoan",
    "ConcurrentLoans",
    "ShareCapital",
    "Savings",
    "HasTimeDeposit",
    "SavingsChange",
    "Groceries",
    "HasSnapshot",
]


# Monthly interest rates used for the MonthlyDue feature (handoff §2).
INTEREST_RATE_CONSOLIDATED = 0.0083
INTEREST_RATE_EMERGENCY = 0.02


# ---------------------------------------------------------------------------
# Occupation -> OccTier (handoff §2)
#
# Tier 1 steadiest .. 4 least steady; 0 = unknown/not recorded. Anything not
# listed falls to tier 4 — NOT to 0. Per the handoff, 0 means "we have no
# occupation on file", which is a different statement from "this occupation is
# unfamiliar to us", and the model was trained on that distinction.
# ---------------------------------------------------------------------------
OCCUPATION_TIER_MAP: dict[str, int] = {
    # Tier 1 — state-backed fixed salary or pension
    "Teaching": 1,
    "Teacher": 1,
    "Public School Teacher": 1,
    "Retired Teacher": 1,
    "Government Employee": 1,
    "Adas Iii": 1,
    "Adas Ii": 1,
    "Ada": 1,
    "Local Treasury Operations Offices Ii": 1,
    "Mpiw Employee": 1,
    "Admin Officer V": 1,
    "Social Welfare Assistant": 1,
    "Senior Fire Inspector": 1,
    "Assistant Pharmacist": 1,
    "Dietitian": 1,
    # Tier 2 — formal wage / agency contract
    "Cashier": 2,
    "Security Guard": 2,
    "Store Clerk": 2,
    "Caregiver": 2,
    "Encoder": 2,
    "Asst. Station Manager": 2,
    "Automotive Technician": 2,
    "Assistant Embalmer": 2,
    # Tier 3 — variable / intermittent / term-limited
    "Seafarer": 3,
    "Beautician": 3,
    "Barber": 3,
    "Sb Member": 3,
    # Tier 4 — least steady / informal / micro-business
    "Farmer": 4,
    "Vendor": 4,
    "Rice Dealer": 4,
    "Business": 4,
    "Small Business": 4,
    "Entrepreneur": 4,
}

# Tier assigned to a recorded-but-unrecognised occupation (handoff: "Anything
# not listed maps to tier 4"). Distinct from the 0 used for a blank.
OCC_TIER_UNLISTED = 4
OCC_TIER_UNKNOWN = 0


def normalize_occupation(occupation: Any) -> str | None:
    """Title-case and repair known typos. Returns None for a blank value."""
    if occupation is None:
        return None
    occ = str(occupation).strip()
    if not occ:
        return None
    occ = occ.title()
    # Long-standing typo in the member records.
    if "Automative" in occ:
        occ = "Automotive Technician"
    return occ


def occupation_tier(occupation: Any) -> int:
    """Map free-text occupation to its income-steadiness tier (handoff §2)."""
    normalized = normalize_occupation(occupation)
    if normalized is None:
        return OCC_TIER_UNKNOWN
    return OCCUPATION_TIER_MAP.get(normalized, OCC_TIER_UNLISTED)


def monthly_due(loan_amount: float, term: float, rate: float) -> float:
    """MonthlyDue per handoff §2: LoanAmount/Term + LoanAmount*rate."""
    if not term:
        raise ValueError("term must be non-zero to compute MonthlyDue")
    return loan_amount / term + loan_amount * rate


def coerce_float(value: Any) -> float | None:
    """Parse a possibly-formatted numeric. Returns None (-> NaN) when absent.

    Note the deliberate asymmetry with the old model's helper: an unparseable
    or empty value yields None, never 0.0. See rule 1 in the module docstring.
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(",", "").replace("₱", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Bundle loading (lazy, thread-safe singleton)
# ---------------------------------------------------------------------------
_bundle: dict | None = None
_lock = threading.Lock()


class ModelNotAvailableError(RuntimeError):
    pass


def _load_model() -> dict:
    """Load and cache the v3.3 bundle dict."""
    global _bundle
    if _bundle is not None:
        return _bundle
    with _lock:
        if _bundle is not None:
            return _bundle
        if not _MODEL_PATH.exists():
            raise ModelNotAvailableError(
                f"Model file not found at {_MODEL_PATH}. Copy "
                "'src/analytics/RISK Assesment/New Model/ttmpc_risk_model.pkl' "
                "into src/server/models/."
            )
        try:
            with open(_MODEL_PATH, "rb") as f:
                bundle = pickle.load(f)
        except Exception as e:  # unpickling failure, version skew, corruption
            raise ModelNotAvailableError(
                f"Failed to unpickle the risk model at {_MODEL_PATH}: {e}"
            ) from e

        if not isinstance(bundle, dict) or "pipeline" not in bundle:
            raise ModelNotAvailableError(
                "Risk model file is not a v3.3 bundle dict (expected keys "
                "'pipeline', 'features', 'thresholds'). An older bare-estimator "
                ".pkl is not compatible with this module."
            )

        features = list(bundle.get("features") or [])
        if features != FEATURE_COLUMNS:
            raise ModelNotAvailableError(
                "Feature contract mismatch between risk_model.py and the model "
                f"file.\n  file:   {features}\n  module: {FEATURE_COLUMNS}\n"
                "Update FEATURE_COLUMNS (and the assembly in risk_features.py) "
                "to match the retrained model."
            )

        # Warn loudly on sklearn skew — the handoff calls this out as a source
        # of silent misbehaviour, not just a load failure.
        trained_with = str(bundle.get("sklearn_version") or "")
        if trained_with:
            try:
                import sklearn

                if sklearn.__version__ != trained_with:
                    import warnings

                    warnings.warn(
                        f"Risk model was trained with scikit-learn {trained_with} "
                        f"but {sklearn.__version__} is installed. Predictions may "
                        "be unreliable; pin the trained version.",
                        RuntimeWarning,
                        stacklevel=2,
                    )
            except ImportError:
                pass

        _bundle = bundle
        return _bundle


def thresholds() -> dict[str, float]:
    """Operating points from the model file. Never hardcode these."""
    return dict(_load_model().get("thresholds") or {})


def model_version() -> str | None:
    try:
        return _load_model().get("version")
    except ModelNotAvailableError:
        return None


def model_info() -> dict:
    """Version, thresholds and training metrics — for the UI's model banner."""
    bundle = _load_model()
    results = bundle.get("results") or {}
    return {
        "version": bundle.get("version"),
        "cutoff": bundle.get("cutoff"),
        "sklearn_version": bundle.get("sklearn_version"),
        "thresholds": dict(bundle.get("thresholds") or {}),
        "roc_auc": results.get("roc_auc"),
        "pr_auc": results.get("pr_auc"),
        "pr_auc_baseline": results.get("pr_auc_baseline"),
        "n_loans": results.get("n_loans"),
        "n_members": results.get("n_members"),
        "risk_rate_pct": results.get("risk_rate_pct"),
        "bands": BAND_META,
        "operating_points": operating_points(),
        "operating_point": DEFAULT_OPERATING_POINT,
        "never_rejects": NEVER_REJECTS_NOTICE,
        # Handoff §7: the model supports judgement, it does not replace it. At
        # the loose setting it still misses about a third of trouble.
        "limits": (
            "Cross-validated ROC-AUC 0.682. At the recommended setting the model "
            "misses about a third of problem loans. It supports judgement; it "
            "does not replace it."
        ),
    }


def band(score: float, thr: dict[str, float] | None = None) -> str:
    """Traffic light per handoff §3. GREEN / AMBER / RED."""
    t = thr if thr is not None else thresholds()
    if score < t["green_amber"]:
        return "GREEN"
    if score < t["amber_red"]:
        return "AMBER"
    return "RED"


def operating_points() -> dict:
    """The four settings from handoff §3, each with its live threshold value.

    Lets the cooperative see what a different setting would cost them —
    the review workload against the share of trouble caught — without any of
    those numbers being hardcoded in a UI.
    """
    thr = thresholds()
    return {
        key: {**meta, "threshold": thr.get(key)}
        for key, meta in OPERATING_POINTS.items()
    }


# ---------------------------------------------------------------------------
# Band metadata — the team's traffic light, verbatim from handoff §3.
#
# The action text, the expected share of applications and the historical bad
# rate are the cooperative's own published figures. They are the numbers the
# system should show a reviewer (and a thesis panel), not paraphrases: "about
# 18 in 100 loans in this band ran into trouble" is defensible in a way that
# invented prose is not.
#
# `share` and `bad_rate_per_100` describe the TRAINING population, so they are
# stable commentary on what a band means — not live statistics about the queue
# currently on screen.
# ---------------------------------------------------------------------------
BAND_META = {
    "GREEN": {
        "label": "Low Risk",
        "action": "Process normally",
        "share": 0.40,
        "bad_rate_per_100": 8,
    },
    "AMBER": {
        "label": "Watch",
        "action": "Verify income and payslip",
        "share": 0.40,
        "bad_rate_per_100": 18,
    },
    "RED": {
        "label": "High Risk",
        "action": "Refer to Manager / BOD before approval",
        "share": 0.20,
        "bad_rate_per_100": 25,
    },
}

BAND_ACTIONS = {k: v["action"] for k, v in BAND_META.items()}
BAND_LABELS = {k: v["label"] for k, v in BAND_META.items()}

# The four operating points, verbatim from handoff §3. `loose` is the
# cooperative's recommended setting: it reviews the top ~45% of applications
# and catches 67% of the loans that go on to have trouble.
#
# The trade-off is real and belongs to the cooperative, not to this code — a
# stricter setting reviews far fewer files but misses far more trouble — so all
# four are published through the API rather than one being baked in.
OPERATING_POINTS = {
    "loose": {
        "label": "Loose",
        "recommended": True,
        "reviews_share": 0.45,
        "catches_share": 0.67,
        "hit_rate": 0.22,
        "description": "Reviews the top ~45% of applications and catches 67% of problem loans.",
    },
    "moderate": {
        "label": "Moderate",
        "recommended": False,
        "reviews_share": 0.30,
        "catches_share": 0.50,
        "hit_rate": 0.25,
        "description": "Reviews the top ~30% and catches half of problem loans.",
    },
    "balanced": {
        "label": "Balanced",
        "recommended": False,
        "reviews_share": 0.20,
        "catches_share": 0.33,
        "hit_rate": 0.25,
        "description": "Reviews the top ~20% and catches a third of problem loans.",
    },
    "strict": {
        "label": "Strict",
        "recommended": False,
        "reviews_share": 0.10,
        "catches_share": 0.21,
        "hit_rate": 0.32,
        "description": "Reviews only the top ~10%, catching about a fifth of problem loans.",
    },
}

# The operating point the cooperative runs at. Handoff §3 recommends `loose`.
DEFAULT_OPERATING_POINT = "loose"

# Handoff §4, first rule. Carried in every scored payload so the constraint
# travels with the number rather than living only in a UI string that a later
# redesign could drop.
NEVER_REJECTS_NOTICE = (
    "This score routes an application for review. It is not grounds for denial "
    "— every member retains the right to apply."
)


def _build_frame(feature_rows: list[dict[str, Any]]):
    """List of feature dicts -> DataFrame in contract order, unknowns as NaN."""
    import numpy as np
    import pandas as pd

    normalized: list[dict[str, float]] = []
    for row in feature_rows:
        out: dict[str, float] = {}
        for feat in FEATURE_COLUMNS:
            val = coerce_float(row.get(feat))
            out[feat] = np.nan if val is None else val
        normalized.append(out)
    return pd.DataFrame(normalized, columns=FEATURE_COLUMNS).astype(float)


# ---------------------------------------------------------------------------
# Driver attribution
#
# HistGradientBoostingClassifier has no .coef_, so the old coefficient x value
# attribution is gone. Rather than take on `shap` as a dependency, drivers are
# computed by occlusion: re-score the row with one feature blanked to NaN and
# measure how far the probability moves. The model's native NaN handling makes
# this exact — "what does the model predict without knowing this?" — and it is
# the same quantity a SHAP value approximates.
#
# Signed so the UI's existing semantics survive: positive = this feature pushed
# the score UP (riskier). All 21 occlusions for a batch of loans go through a
# single predict_proba call, which keeps the queue endpoint fast.
# ---------------------------------------------------------------------------
def _occlusion_contributions(model, frame) -> list[dict[str, float]]:
    """Per-row {feature: signed contribution}, computed in one batched call."""
    import numpy as np
    import pandas as pd

    n_rows = len(frame)
    n_feat = len(FEATURE_COLUMNS)

    # Block layout: the n_rows intact rows first, then one occluded copy of the
    # whole set per feature. Keeps it to a single predict_proba.
    blocks = [frame]
    for feat in FEATURE_COLUMNS:
        occluded = frame.copy()
        occluded[feat] = np.nan
        blocks.append(occluded)
    stacked = pd.concat(blocks, ignore_index=True)

    probs = model.predict_proba(stacked)[:, 1]
    base = probs[:n_rows]

    per_row: list[dict[str, float]] = []
    for i in range(n_rows):
        contribs: dict[str, float] = {}
        for j, feat in enumerate(FEATURE_COLUMNS):
            without = probs[(j + 1) * n_rows + i]
            contribs[feat] = float(base[i] - without)
        per_row.append(contribs)
    return per_row


# Reference values for the UI's "value vs cohort" bar. Medians of the training
# cohort (932 loans / 237 members, cutoff 2026-02-26). Points features use the
# classification point scales, not pesos.
_COHORT_MEDIANS: dict[str, float] = {
    "LoanAmount": 50000.0,
    "Term": 24.0,
    "MonthlyDue": 2500.0,
    "Dependents": 2.0,
    "OccTier": 1.0,
    "Age": 47.0,
    "PriorLoans": 2.0,
    "PriorRefinances": 0.0,
    "PriorBehind": 0.0,
    "PriorRestructured": 0.0,
    "PriorPenalties": 0.0,
    "PriorBorrowed": 100000.0,
    "DebtGrowth": 1.0,
    "MonthsSinceLastLoan": 7.0,
    "ConcurrentLoans": 1.0,
    "ShareCapital": 12.0,
    "Savings": 10000.0,
    "HasTimeDeposit": 0.0,
    "SavingsChange": 0.0,
    "Groceries": 5.0,
    "HasSnapshot": 1.0,
}


def cohort_medians() -> dict[str, float]:
    return dict(_COHORT_MEDIANS)


def score_many(
    feature_rows: list[dict[str, Any]],
    operating_point: str = DEFAULT_OPERATING_POINT,
) -> list[dict]:
    """Score a batch of assembled feature dicts.

    Each result is the payload the Credit Risk UI reads:

        {
          "probability": float,        # 0..1, higher = riskier
          "band": "GREEN"|"AMBER"|"RED",
          "risk_label": str,
          "action": str,               # what the cooperative does with this band
          "band_share": float,         # share of applications in this band
          "band_bad_rate_per_100": int,# historical trouble rate for this band
          "flagged": bool,             # at/above the active operating point
          "operating_point": str,      # which setting decided `flagged`
          "never_rejects": str,        # handoff §4 — routes, never denies
          "model_version": str,
          "drivers": [ {feature, value, cohort_median,
                        contribution, direction}, ... ],
        }
    """
    if not feature_rows:
        return []

    import numpy as np

    bundle = _load_model()
    model = bundle["pipeline"]
    thr = dict(bundle.get("thresholds") or {})
    version = bundle.get("version")
    medians = cohort_medians()

    if operating_point not in OPERATING_POINTS:
        raise ValueError(
            f"Unknown operating point {operating_point!r}. "
            f"Expected one of {sorted(OPERATING_POINTS)}."
        )
    flag_threshold = thr[operating_point]

    frame = _build_frame(feature_rows)
    probs = model.predict_proba(frame)[:, 1]
    contribs = _occlusion_contributions(model, frame)

    results: list[dict] = []
    for i, prob in enumerate(probs):
        probability = float(prob)
        row_values = frame.iloc[i].to_dict()

        drivers = []
        for feat, contribution in sorted(
            contribs[i].items(), key=lambda kv: abs(kv[1]), reverse=True
        ):
            if contribution > 1e-9:
                direction = "up"
            elif contribution < -1e-9:
                direction = "down"
            else:
                direction = "neutral"
            raw = row_values.get(feat)
            drivers.append({
                "feature": feat,
                # NaN is not JSON-serialisable; None tells the UI "not recorded".
                "value": None if raw is None or np.isnan(raw) else float(raw),
                "cohort_median": float(medians.get(feat, 0.0)),
                "contribution": float(contribution),
                "direction": direction,
            })

        current_band = band(probability, thr)
        meta = BAND_META[current_band]
        results.append({
            "probability": probability,
            "band": current_band,
            "risk_label": meta["label"],
            "action": meta["action"],
            # Context for the band, from the training population (handoff §3).
            # Describes what the band means, not the queue currently on screen.
            "band_share": meta["share"],
            "band_bad_rate_per_100": meta["bad_rate_per_100"],
            "flagged": probability >= flag_threshold,
            "operating_point": operating_point,
            "never_rejects": NEVER_REJECTS_NOTICE,
            "model_version": version,
            "thresholds": thr,
            "drivers": drivers,
        })
    return results


def score(
    features: dict[str, Any],
    operating_point: str = DEFAULT_OPERATING_POINT,
) -> dict:
    """Score a single assembled feature dict. See score_many()."""
    return score_many([features], operating_point=operating_point)[0]
