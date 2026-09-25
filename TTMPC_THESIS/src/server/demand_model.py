"""
TTMPC Loan Demand Forecasting — server-side inference helpers.

Wraps SARIMAXResultsWrapper pickles that forecast monthly disbursed amount
per loan type (Consolidated, Emergency, Bonus) at month-end frequency. Each
model has its own training range — read it from the payload's
`training_end`, don't assume one. Bonus has no model until its data is
dropped into the analytics Data folder and `train_demand_models.py --only
bonus` is run; until then it raises DemandModelNotAvailableError (→ 503).

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
    "bonus":        _MODEL_DIR / "bonus_model.pkl",
}

# Second, wider band returned next to the requested one (default 80%).
SECONDARY_ALPHA = 0.05  # 95% CI

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
                f"No {key} demand model yet ({path.name} not found). Paste the data into "
                f"src/analytics/Loan Demand Forecasting/Data/{key}_loan_data.csv, run "
                f"train_demand_models.py --only {key}, then restart the server."
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


def _bands(pred, alpha: float):
    """(lower, upper) Series for `pred` at 1 - alpha confidence."""
    ci = pred.conf_int(alpha=alpha)
    # CI columns vary by statsmodels version; grab the first two positionally
    return ci.iloc[:, 0], ci.iloc[:, 1]


def training_end(loan_type: str) -> str | None:
    """Last month the model was trained on (ISO date), or None if unknown."""
    dates = _load_model(loan_type).model.data.dates
    return _isofmt(dates[-1]) if dates is not None and len(dates) else None


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


def fitted(loan_type: str, alpha: float = 0.20) -> list[dict]:
    """Return the model's in-sample one-step-ahead predictions over the training range.

    `forecast()` only produces out-of-sample months, so for any year inside the
    training data there is no predicted value to compare against the actual.
    These fitted values fill that gap: they are what the model *would have*
    predicted for each historical month, which is what the dashboard's
    predicted-vs-actual overlay needs.
    """
    model = _load_model(loan_type)

    try:
        pred = model.get_prediction(dynamic=False)
        mean = pred.predicted_mean
        lower, upper = _bands(pred, alpha)
        lower95, upper95 = _bands(pred, SECONDARY_ALPHA)
    except Exception:
        return []

    out = []
    # The first in-sample step has no prior observation to condition on, so
    # statsmodels returns 0 for it. Dropping it avoids drawing a false spike
    # down to zero at the start of the fitted line.
    for i, idx in enumerate(mean.index):
        value = float(mean.loc[idx])
        if i == 0 and value == 0.0:
            continue
        out.append({
            "period": _isofmt(idx),
            "predicted": value,
            "lower": max(0.0, float(lower.loc[idx])),
            "upper": float(upper.loc[idx]),
            "lower95": max(0.0, float(lower95.loc[idx])),
            "upper95": float(upper95.loc[idx]),
            "in_sample": True,
        })
    return out


def forecast(loan_type: str, periods: int = 12, alpha: float = 0.20) -> list[dict]:
    """Return forecasted monthly amounts + confidence bands.

    `lower`/`upper` use `alpha` (0.20 → 80% CI, the default); `lower95`/
    `upper95` are always the 95% CI. Lower bounds are clipped at 0 since
    negative loan demand makes no sense.
    """
    model = _load_model(loan_type)

    if periods <= 0:
        return []

    fc = model.get_forecast(steps=int(periods))
    mean = fc.predicted_mean
    lower, upper = _bands(fc, alpha)
    lower95, upper95 = _bands(fc, SECONDARY_ALPHA)

    out = []
    for idx in mean.index:
        out.append({
            "period": _isofmt(idx),
            "predicted": float(mean.loc[idx]),
            "lower": max(0.0, float(lower.loc[idx])),  # clip non-negative
            "upper": float(upper.loc[idx]),
            "lower95": max(0.0, float(lower95.loc[idx])),
            "upper95": float(upper95.loc[idx]),
        })
    return out


def periods_to_cover(loan_type: str, months_from_today: int, today=None) -> int:
    """Forecast steps needed so the forecast reaches `months_from_today`
    months past the current month (the model starts the month after its
    training end, which can be well before today)."""
    import datetime as _dt

    today = today or _dt.date.today()
    end = training_end(loan_type)
    if end is None:
        return months_from_today
    end_y, end_m = int(end[:4]), int(end[5:7])
    gap = (today.year - end_y) * 12 + (today.month - end_m)
    return max(1, gap + months_from_today)


def get_forecast_payload(
    loan_type: Literal["consolidated", "emergency", "bonus"],
    periods: int = 12,
    alpha: float = 0.20,
) -> dict:
    """One-shot helper returning history + forecast in a single envelope
    suitable for the dashboard chart."""
    return {
        "loan_type": loan_type,
        "periods": periods,
        "alpha": alpha,
        "secondary_alpha": SECONDARY_ALPHA,
        "training_end": training_end(loan_type),
        "historical": historical(loan_type),
        "fitted": fitted(loan_type, alpha=alpha),
        "forecast": forecast(loan_type, periods=periods, alpha=alpha),
    }
