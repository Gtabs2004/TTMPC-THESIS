"""
Retrain SARIMAX demand-forecast models from df_modeling_export.csv.

Mirrors the original Colab notebook's parameter choices (read out of the
existing .pkl files via inspect_models.py):

    Consolidated  :  order=(1, 1, 1)  seasonal_order=(0, 1, 1, 12)
    Emergency     :  order=(0, 1, 1)  seasonal_order=(1, 1, 1, 12)

Both fit on month-end-frequency series of summed disbursed amount.

Outputs:
    src/server/models/consolidated_model.pkl   (used by the live API)
    src/server/models/emergency_model.pkl
    src/analytics/Loan Demand Forecasting/consolidated_model.pkl   (archive copy)
    src/analytics/Loan Demand Forecasting/emergency_model.pkl

Run from the project root in the venv:
    .venv/Scripts/python.exe "src/analytics/Loan Demand Forecasting/train_demand_models.py"
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import joblib
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "Data" / "df_modeling_export (1).csv"

# We write to both the archive folder (alongside this script) AND the live
# server models folder so a uvicorn restart picks the new model up.
ARCHIVE_DIR = HERE
# HERE = .../src/analytics/Loan Demand Forecasting
# parents[1] = .../src   so we land in .../src/server/models
SERVER_MODELS_DIR = HERE.parents[1] / "server" / "models"

# ---------------------------------------------------------------------------
# Per-loan-type SARIMAX configuration (matches original .pkl files exactly)
# ---------------------------------------------------------------------------

MODEL_CONFIG: dict[str, dict] = {
    "Consolidated": {
        "order":          (1, 1, 1),
        "seasonal_order": (0, 1, 1, 12),
        "out_name":       "consolidated_model.pkl",
    },
    "Emergency": {
        "order":          (0, 1, 1),
        "seasonal_order": (1, 1, 1, 12),
        "out_name":       "emergency_model.pkl",
    },
}


def build_monthly_series(df: pd.DataFrame, loan_type: str) -> pd.Series:
    """Aggregate LoanAmount to month-end sums for the given LoanType.

    Months with no loans of that type are zero-filled so the SARIMAX index is
    a continuous monthly frequency (statsmodels requires this for seasonal
    differencing).
    """
    subset = df[df["LoanType"].str.strip().str.lower() == loan_type.lower()].copy()
    if subset.empty:
        raise SystemExit(f"No rows in CSV for LoanType={loan_type!r}.")

    subset["ApplicationDate"] = pd.to_datetime(subset["ApplicationDate"], errors="coerce")
    subset = subset.dropna(subset=["ApplicationDate"])

    monthly = (
        subset.set_index("ApplicationDate")["LoanAmount"]
              .resample("ME")  # month-end frequency
              .sum()
              .astype(float)
    )

    # Fill any gap months with 0 so the series is continuous.
    full_idx = pd.date_range(monthly.index.min(), monthly.index.max(), freq="ME")
    monthly = monthly.reindex(full_idx, fill_value=0.0)
    monthly.name = f"{loan_type}_monthly_amount"
    return monthly


def fit_and_save(loan_type: str, series: pd.Series, cfg: dict) -> None:
    print(f"\n[{loan_type}]")
    print(f"  series range : {series.index.min().date()} to {series.index.max().date()}  "
          f"({len(series)} months)")
    print(f"  value range  : min={series.min():.0f}  max={series.max():.0f}  mean={series.mean():.0f}")
    print(f"  SARIMAX order={cfg['order']}  seasonal_order={cfg['seasonal_order']}")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # silence SARIMAX convergence chatter
        model = SARIMAX(
            series,
            order=cfg["order"],
            seasonal_order=cfg["seasonal_order"],
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        result = model.fit(disp=False)

    aic = float(getattr(result, "aic", float("nan")))
    print(f"  fitted       : AIC={aic:.2f}")

    # Sample 3-month forecast for sanity.
    fc = result.get_forecast(steps=3)
    print(f"  sample 3-step forecast:")
    for idx, val in fc.predicted_mean.items():
        print(f"    {idx.date()}  ->  {val:,.2f}")

    # Persist to both locations.
    out_paths = [
        SERVER_MODELS_DIR / cfg["out_name"],
        ARCHIVE_DIR / cfg["out_name"],
    ]
    for path in out_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(result, path)
        print(f"  saved        : {path}")


def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: input CSV not found at {CSV_PATH}", file=sys.stderr)
        return 1

    df = pd.read_csv(CSV_PATH)
    needed_cols = {"ApplicationDate", "LoanAmount", "LoanType"}
    missing = needed_cols - set(df.columns)
    if missing:
        print(f"ERROR: CSV missing required columns: {missing}", file=sys.stderr)
        return 1

    print(f"Loaded {len(df):,} loan rows from {CSV_PATH.name}")
    type_counts = df["LoanType"].value_counts().to_dict()
    print(f"LoanType counts: {type_counts}")

    for loan_type, cfg in MODEL_CONFIG.items():
        series = build_monthly_series(df, loan_type)
        fit_and_save(loan_type, series, cfg)

    print("\nDone. Restart uvicorn to pick up the new models.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
