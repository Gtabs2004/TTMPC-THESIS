"""Compare old (.bak) vs new SARIMAX demand-forecast models side by side."""
from pathlib import Path
import joblib
import pandas as pd

MODEL_DIR = Path(__file__).resolve().parent / "models"

PAIRS = {
    "consolidated": ("consolidated_model.pkl.bak", "consolidated_model.pkl"),
    "emergency":    ("emergency_model.pkl.bak",   "emergency_model.pkl"),
}


def summarize(label: str, path: Path):
    print(f"\n{'='*70}\n{label}: {path.name}\n{'='*70}")
    if not path.exists():
        print("  (missing)")
        return
    m = joblib.load(path)
    spec = m.model  # SARIMAX spec
    data = spec.data

    # Order / seasonal order
    order = getattr(spec, "order", None)
    sorder = getattr(spec, "seasonal_order", None)
    print(f"SARIMAX order        : {order}")
    print(f"Seasonal order       : {sorder}")
    print(f"k_exog               : {getattr(spec, 'k_exog', 0)}")
    print(f"nobs (training pts)  : {m.nobs}")

    # Date range
    dates = data.dates
    if dates is not None:
        idx = pd.to_datetime(list(dates))
        print(f"Train range          : {idx.min().date()}  ->  {idx.max().date()}")
        print(f"Frequency            : {getattr(idx, 'freqstr', None) or getattr(dates, 'freqstr', None)}")

    # Endogenous stats
    endog = getattr(data, "orig_endog", data.endog)
    s = pd.Series(endog).astype(float)
    print(f"Endog mean / std     : {s.mean():,.2f}  /  {s.std():,.2f}")
    print(f"Endog min  / max     : {s.min():,.2f}  /  {s.max():,.2f}")

    # Fit quality
    for attr in ("aic", "bic", "hqic", "llf"):
        v = getattr(m, attr, None)
        if v is not None:
            print(f"{attr.upper():21s}: {v:,.3f}")

    # Params
    try:
        params = m.params
        print("\nFitted parameters:")
        for name, val in params.items():
            print(f"  {name:25s} {val: .6f}")
    except Exception as e:
        print(f"(could not read params: {e})")

    # Next-12 forecast headline
    try:
        fc = m.get_forecast(steps=12).predicted_mean
        print(f"\nNext-12 forecast mean: {fc.mean():,.2f}")
        print(f"Next-12 forecast sum : {fc.sum():,.2f}")
        print(f"First period         : {fc.index[0]}  ->  {fc.iloc[0]:,.2f}")
        print(f"Last  period         : {fc.index[-1]} ->  {fc.iloc[-1]:,.2f}")
    except Exception as e:
        print(f"(forecast failed: {e})")


if __name__ == "__main__":
    for loan_type, (old, new) in PAIRS.items():
        print(f"\n\n########## {loan_type.upper()} ##########")
        summarize("OLD", MODEL_DIR / old)
        summarize("NEW", MODEL_DIR / new)
