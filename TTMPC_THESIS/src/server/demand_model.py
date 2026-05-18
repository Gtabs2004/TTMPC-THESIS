"""
TTMPC Loan Demand Forecasting — server-side inference helpers.

Wraps two SARIMAXResultsWrapper pickles that forecast monthly disbursed amount
for Consolidated and Emergency loans. Both were trained on 36 monthly
observations (Jan 2022 – Dec 2024) at month-end frequency.

Models are loaded lazily on first request and cached for the lifetime of the
process. ML deps (statsmodels, joblib, pandas) are imported lazily so the
server can start without them.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Literal


_MODEL_DIR = Path(__file__).resolve().parent / "models"

LOAN_TYPE_FILES: dict[str, Path] = {
    "consolidated": _MODEL_DIR / "consolidated_model.pkl",
    "emergency":    _MODEL_DIR / "emergency_model.pkl",
}

SUPPORTED_LOAN_TYPES = tuple(LOAN_TYPE_FILES.keys())


class DemandModelNotAvailableError(RuntimeError):
    pass


_models: dict[str, Any] = {}
_lock = threading.Lock()


def _load_model(loan_type: str):
    key = loan_type.strip().lower()
    if key not in LOAN_TYPE_FILES:
        raise DemandModelNotAvailableError(
            f"Unknown loan_type '{loan_type}'. Supported: {', '.join(SUPPORTED_LOAN_TYPES)}."
        )

    if key in _models:
        return _models[key]

    with _lock:
        if key in _models:
            return _models[key]

        path = LOAN_TYPE_FILES[key]
        if not path.exists():
            raise DemandModelNotAvailableError(
                f"Model file not found: {path}. Run the Colab/Jupyter notebook "
                "and place the .pkl into src/server/models/."
            )

        try:
            import joblib
        except ImportError as e:
            raise DemandModelNotAvailableError(
                "joblib is not installed. Run: pip install -r src/server/requirements.txt"
            ) from e

        try:
            import statsmodels  # noqa: F401 — required for unpickling SARIMAX
        except ImportError as e:
            raise DemandModelNotAvailableError(
                "statsmodels is not installed. Run: pip install -r src/server/requirements.txt"
            ) from e

        _models[key] = joblib.load(path)
        return _models[key]


def _isofmt(period) -> str:
    """Format a pandas Timestamp / Period as ISO date (YYYY-MM-DD)."""
    try:
        return period.strftime("%Y-%m-%d")
    except Exception:
        return str(period)


def historical(loan_type: str) -> list[dict]:
    """Return the training-data series the model was fit on."""
    model = _load_model(loan_type)
    import pandas as pd

    data = model.model.data
    endog = getattr(data, "orig_endog", None)
    if endog is None:
        endog = data.endog
    dates = data.dates

    series = pd.Series(endog).astype(float)
    if dates is None:
        # Fallback: synthetic monthly index
        idx = pd.date_range("2022-01-31", periods=len(series), freq="ME")
    else:
        idx = pd.to_datetime(list(dates))

    out = []
    for ts, val in zip(idx, series):
        out.append({"period": _isofmt(ts), "actual": float(val)})
    return out


def forecast(loan_type: str, periods: int = 12, alpha: float = 0.20) -> list[dict]:
    """Return forecasted monthly amounts + 80% (default) confidence bands.

    `alpha=0.20` → 80% CI. Use 0.05 for 95%.
    Lower bound is clipped at 0 since negative loan demand makes no sense.
    """
    model = _load_model(loan_type)

    if periods <= 0:
        return []

    fc = model.get_forecast(steps=int(periods))
    mean = fc.predicted_mean
    ci = fc.conf_int(alpha=alpha)

    # CI columns vary by statsmodels version; grab the first two columns positionally
    lower_col, upper_col = ci.columns[0], ci.columns[1]

    out = []
    for idx in mean.index:
        predicted = float(mean.loc[idx])
        lo = float(ci.at[idx, lower_col])
        hi = float(ci.at[idx, upper_col])
        out.append({
            "period": _isofmt(idx),
            "predicted": predicted,
            "lower": max(0.0, lo),  # clip non-negative
            "upper": hi,
        })
    return out


def get_forecast_payload(
    loan_type: Literal["consolidated", "emergency"],
    periods: int = 12,
    alpha: float = 0.20,
) -> dict:
    """One-shot helper returning history + forecast in a single envelope
    suitable for the dashboard chart."""
    return {
        "loan_type": loan_type,
        "periods": periods,
        "alpha": alpha,
        "historical": historical(loan_type),
        "forecast": forecast(loan_type, periods=periods, alpha=alpha),
    }
