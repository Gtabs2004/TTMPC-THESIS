"""
TTMPC Loan Demand Forecasting — server-side inference helpers.

Computes monthly disbursed-amount forecasts per loan type (Consolidated,
Emergency, Bonus) directly from the exported loan ledger CSV plus a config
of precomputed backtest statistics — no trained model object (SARIMAX,
statsmodels, joblib) is loaded or pickled anymore.

Methodology, per `demand_model_config.json` (validated 2026-10 against its
own recorded backtest MAE/RMSE/WAPE — see SESSION notes):
  - Consolidated, Emergency: 12-month trailing moving average ("MA-12").
    Forecasting month M's value = the average of the 12 actual months
    immediately before M. A forecast beyond the known series chains on
    its own prior forecasts the same way a trailing average always does.
  - Bonus: seasonal naive — forecasting month M = the actual value from
    month M one year earlier (fallback to the trailing-12 average if that
    month isn't in the known series yet, e.g. forecasting more than one
    year past the data).
  - Confidence bands are NOT a statistical interval around the forecast;
    they are the point forecast plus/minus the model's own *empirical*
    backtest error distribution (`error_quantiles`): p10/p90 for the
    ~80% band (alpha=0.20), p025/p975 for the ~95% band. This matches the
    old SARIMAX payload's band semantics closely enough for the frontend,
    which only ever treats lower/upper as numbers to draw, but it is a
    fundamentally different (non-parametric) source — don't conflate the
    two methods' confidence meanings if this file is read later.

Config and data are loaded lazily on first request and cached for the
lifetime of the process (same caching contract as before — call
`clear_cache()` in tests or after replacing the CSV to force a reload).
"""

from __future__ import annotations

import csv
import json
import threading
from datetime import date
from pathlib import Path
from typing import Literal


_CONFIG_PATH = Path(__file__).resolve().parent.parent / "Final_Modeling" / "demand_model_config.json"
_DATA_PATH = Path(__file__).resolve().parent.parent / "Final_Modeling" / "df_modeling_export.csv"

SUPPORTED_LOAN_TYPES = ("consolidated", "emergency", "bonus")

_METHOD_BY_TYPE = {
    "consolidated": "ma12",
    "emergency": "ma12",
    "bonus": "seasonal_naive",
}

# Second, wider band returned next to the requested one (default 80%).
SECONDARY_ALPHA = 0.05  # 95% CI


class DemandModelNotAvailableError(RuntimeError):
    pass


_cache: dict[str, object] = {}
_lock = threading.Lock()


def clear_cache() -> None:
    """Drop the cached config/series so the next call re-reads from disk."""
    with _lock:
        _cache.clear()


def _load_config() -> dict:
    if "config" in _cache:
        return _cache["config"]
    with _lock:
        if "config" in _cache:
            return _cache["config"]
        if not _CONFIG_PATH.exists():
            raise DemandModelNotAvailableError(
                f"Demand model config not found at {_CONFIG_PATH}. "
                "Place demand_model_config.json in src/Final_Modeling/."
            )
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            _cache["config"] = json.load(f)
        return _cache["config"]


def _read_csv_rows() -> list[dict]:
    if "rows" in _cache:
        return _cache["rows"]
    with _lock:
        if "rows" in _cache:
            return _cache["rows"]
        if not _DATA_PATH.exists():
            raise DemandModelNotAvailableError(
                f"Demand model data CSV not found at {_DATA_PATH}. "
                "Place df_modeling_export.csv in src/Final_Modeling/."
            )
        with open(_DATA_PATH, encoding="utf-8", newline="") as f:
            _cache["rows"] = list(csv.DictReader(f))
        return _cache["rows"]


def _month_key(iso_date: str) -> str | None:
    """'YYYY-MM-DD...' -> 'YYYY-MM', or None if unparseable."""
    s = (iso_date or "").strip()
    if len(s) < 7:
        return None
    return s[:7]


def _add_months(ym: str, n: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7])
    total = (y * 12 + (m - 1)) + n
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _month_range(start: str, end: str) -> list[str]:
    out = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur = _add_months(cur, 1)
    return out


def _config_entry(loan_type: str) -> dict:
    cfg = _load_config()
    key = loan_type.strip().lower()
    if key not in SUPPORTED_LOAN_TYPES:
        raise DemandModelNotAvailableError(
            f"Unknown loan_type '{loan_type}'. Supported: {', '.join(SUPPORTED_LOAN_TYPES)}."
        )
    entry = (cfg.get("loan_types") or {}).get(key)
    if not entry:
        raise DemandModelNotAvailableError(
            f"No demand model config entry for '{key}' in {_CONFIG_PATH.name}."
        )
    return entry


def _monthly_series(loan_type: str) -> dict[str, float]:
    """Full monthly series from series_start through the last month present
    in the CSV, with months absent from the data filled in as 0.0 (a month
    with no disbursements is a real zero, not a gap to skip)."""
    cache_key = f"series:{loan_type}"
    if cache_key in _cache:
        return _cache[cache_key]

    entry = _config_entry(loan_type)
    series_start = entry["series_start"]
    key = loan_type.strip().lower()

    totals: dict[str, float] = {}
    last_month = series_start
    for row in _read_csv_rows():
        raw_type = str(row.get("LoanType") or "").strip().lower()
        if raw_type != key:
            continue
        ym = _month_key(row.get("ApplicationDate"))
        if ym is None or ym < series_start:
            continue
        try:
            amount = float(str(row.get("LoanAmount") or 0).replace(",", "").strip() or 0)
        except (TypeError, ValueError):
            amount = 0.0
        totals[ym] = totals.get(ym, 0.0) + amount
        if ym > last_month:
            last_month = ym

    full = {m: totals.get(m, 0.0) for m in _month_range(series_start, last_month)}
    with _lock:
        _cache[cache_key] = full
    return full


def training_end(loan_type: str) -> str | None:
    """Last month with data (ISO date, last day of month), or None if unknown."""
    series = _monthly_series(loan_type)
    if not series:
        return None
    last_ym = max(series.keys())
    y, m = int(last_ym[:4]), int(last_ym[5:7])
    # last day of month m
    next_month = _add_months(last_ym, 1)
    ny, nm = int(next_month[:4]), int(next_month[5:7])
    from datetime import date as _date, timedelta as _timedelta
    last_day = _date(ny, nm, 1) - _timedelta(days=1)
    return last_day.isoformat()


def historical(loan_type: str) -> list[dict]:
    """Return the actual monthly series the forecast is built from."""
    series = _monthly_series(loan_type)
    out = []
    for ym in sorted(series.keys()):
        y, m = int(ym[:4]), int(ym[5:7])
        out.append({"period": f"{y:04d}-{m:02d}-01", "actual": float(series[ym])})
    return out


def _ma12(series: dict[str, float], target_month: str, extended: dict[str, float]) -> float:
    """Trailing 12-month average ending the month before `target_month`,
    reading from `extended` (series plus any already-computed forecast
    months) so a multi-month-ahead forecast chains correctly."""
    months = _month_range(_add_months(target_month, -12), _add_months(target_month, -1))
    values = [extended.get(m, series.get(m, 0.0)) for m in months]
    return sum(values) / len(values) if values else 0.0


def _seasonal_naive(series: dict[str, float], target_month: str, extended: dict[str, float]) -> float:
    """Same month, one year earlier. Falls back to the MA-12 of whatever
    history is available if that exact month isn't known yet (e.g.
    forecasting more than 12 months past the last real data point)."""
    prev_year_month = _add_months(target_month, -12)
    if prev_year_month in series:
        return series[prev_year_month]
    if prev_year_month in extended:
        return extended[prev_year_month]
    return _ma12(series, target_month, extended)


def _band(entry: dict, alpha: float, point: float) -> tuple[float, float]:
    """(lower, upper) = point forecast +/- the empirical backtest error
    quantiles for the requested confidence level. alpha=0.20 -> ~80% band
    (p10/p90); anything <= 0.05 -> ~95% band (p025/p975); otherwise falls
    back to the nearer of the two available quantile pairs."""
    q = entry.get("error_quantiles") or {}
    if alpha <= 0.075:
        lo_key, hi_key = "p025", "p975"
    else:
        lo_key, hi_key = "p10", "p90"
    lo = float(q.get(lo_key, 0.0))
    hi = float(q.get(hi_key, 0.0))
    return max(0.0, point + lo), point + hi


def fitted(loan_type: str, alpha: float = 0.20) -> list[dict]:
    """In-sample one-step-ahead predictions over the training range, using
    the same method as the real forecast, for the dashboard's
    predicted-vs-actual overlay. The first 12 months of a MA-12 series (or
    first 12 of a seasonal-naive series) have no prior year/trailing window
    to predict from and are skipped, matching the old SARIMAX payload's
    behavior of dropping the undefined first in-sample step.
    """
    entry = _config_entry(loan_type)
    method = _METHOD_BY_TYPE[loan_type.strip().lower()]
    series = _monthly_series(loan_type)
    months = sorted(series.keys())

    out = []
    for ym in months:
        if method == "ma12":
            window = _month_range(_add_months(ym, -12), _add_months(ym, -1))
            if any(m not in series for m in window):
                continue
            point = sum(series[m] for m in window) / 12
        else:
            prev_year_month = _add_months(ym, -12)
            if prev_year_month not in series:
                continue
            point = series[prev_year_month]

        lower, upper = _band(entry, alpha, point)
        lower95, upper95 = _band(entry, SECONDARY_ALPHA, point)
        y, m = int(ym[:4]), int(ym[5:7])
        out.append({
            "period": f"{y:04d}-{m:02d}-01",
            "predicted": float(point),
            "lower": lower,
            "upper": float(upper),
            "lower95": lower95,
            "upper95": float(upper95),
            "in_sample": True,
        })
    return out


def forecast(loan_type: str, periods: int = 12, alpha: float = 0.20) -> list[dict]:
    """Return forecasted monthly amounts + confidence bands for the
    `periods` months immediately after the last known month.

    `lower`/`upper` use `alpha` (0.20 -> ~80% band, the default);
    `lower95`/`upper95` are always the ~95% band. Lower bounds are clipped
    at 0 since negative loan demand makes no sense.
    """
    if periods <= 0:
        return []

    entry = _config_entry(loan_type)
    method = _METHOD_BY_TYPE[loan_type.strip().lower()]
    series = _monthly_series(loan_type)
    if not series:
        return []

    last_month = max(series.keys())
    extended: dict[str, float] = {}

    out = []
    cursor = last_month
    for _ in range(periods):
        cursor = _add_months(cursor, 1)
        if method == "ma12":
            point = _ma12(series, cursor, extended)
        else:
            point = _seasonal_naive(series, cursor, extended)
        extended[cursor] = point

        lower, upper = _band(entry, alpha, point)
        lower95, upper95 = _band(entry, SECONDARY_ALPHA, point)
        y, m = int(cursor[:4]), int(cursor[5:7])
        out.append({
            "period": f"{y:04d}-{m:02d}-01",
            "predicted": float(point),
            "lower": lower,
            "upper": float(upper),
            "lower95": lower95,
            "upper95": float(upper95),
        })
    return out


def periods_to_cover(loan_type: str, months_from_today: int, today=None) -> int:
    """Forecast steps needed so the forecast reaches `months_from_today`
    months past the current month (the series can end well before today)."""
    today = today or date.today()
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
