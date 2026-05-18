"""
One-off introspection — figure out what library + interface the demand models use.

Run from the project root in the activated venv:
    python "src/analytics/Loan Demand Forecasting/inspect_models.py"
"""

import joblib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODELS = {
    "consolidated": ROOT / "consolidated_model.pkl",
    "emergency":    ROOT / "emergency_model.pkl",
}

print("=" * 70)
for name, path in MODELS.items():
    print(f"\n[{name}]  ({path.name})")
    if not path.exists():
        print("  MISSING")
        continue

    try:
        obj = joblib.load(path)
    except Exception as e:
        print(f"  Failed to load with joblib: {e}")
        continue

    print(f"  type     : {type(obj).__module__}.{type(obj).__name__}")

    # Common sklearn introspection
    for attr in ("feature_names_in_", "n_features_in_", "classes_", "coef_", "estimators_"):
        if hasattr(obj, attr):
            try:
                val = getattr(obj, attr)
                summary = (
                    f"len={len(val)}" if hasattr(val, "__len__")
                    else f"value={val}"
                )
                print(f"  .{attr:<22} {summary}")
            except Exception:
                pass

    # Prophet-specific
    if type(obj).__name__ == "Prophet":
        print("  (Prophet model — call .make_future_dataframe(periods=N) then .predict())")
        try:
            print(f"  .history.columns          {list(obj.history.columns)}")
            print(f"  .history rows             {len(obj.history)}")
            print(f"  .history date range       {obj.history['ds'].min()} → {obj.history['ds'].max()}")
        except Exception as e:
            print(f"  Prophet introspection error: {e}")

    # Pipeline introspection
    if hasattr(obj, "named_steps"):
        print(f"  pipeline steps: {list(obj.named_steps.keys())}")

    # Dict-wrapped models (some teams pickle {"model": ..., "features": ...})
    if isinstance(obj, dict):
        print(f"  dict keys: {list(obj.keys())}")
        for k, v in obj.items():
            print(f"    {k}: type={type(v).__module__}.{type(v).__name__}")

    # SARIMAX introspection
    if "SARIMAX" in type(obj).__name__:
        try:
            data = obj.model.data
            endog = data.orig_endog if hasattr(data, "orig_endog") else data.endog
            dates = data.dates
            print(f"  order             : {obj.model.order}")
            if hasattr(obj.model, "seasonal_order"):
                print(f"  seasonal_order    : {obj.model.seasonal_order}")
            print(f"  n_observations    : {len(endog)}")
            if dates is not None:
                try:
                    print(f"  date_range        : {dates[0]} → {dates[-1]}")
                    print(f"  inferred_freq     : {getattr(dates, 'freqstr', dates.inferred_freq)}")
                except Exception:
                    pass
            try:
                import pandas as pd
                series = pd.Series(endog).head(5)
                print(f"  first 5 values    : {series.tolist()}")
                series = pd.Series(endog).tail(5)
                print(f"  last 5 values     : {series.tolist()}")
                vals = pd.Series(endog).astype(float)
                print(f"  value range       : min={vals.min():.2f}  max={vals.max():.2f}  mean={vals.mean():.2f}")
            except Exception as e:
                print(f"  value inspect err: {e}")

            # Sample 3-step forecast
            try:
                fc = obj.get_forecast(steps=3)
                pred = fc.predicted_mean
                ci = fc.conf_int(alpha=0.20)  # 80% CI
                print(f"  sample 3-step forecast (mean):")
                for idx, v in pred.items():
                    lo, hi = ci.loc[idx].tolist()
                    print(f"    {idx}  →  {v:.2f}   (80% CI: {lo:.2f} – {hi:.2f})")
            except Exception as e:
                print(f"  forecast probe err: {e}")
        except Exception as e:
            print(f"  SARIMAX introspection error: {e}")

print("\n" + "=" * 70)
