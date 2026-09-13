"""
Pre-live validation for the TTMPC Credit Risk Model v3.3.

Implements the checks in DEVELOPER_HANDOFF.md §5. Run this before trusting the
integration in front of the panel or the cooperative.

Usage
-----
    cd TTMPC_THESIS/src/server
    .venv/Scripts/python.exe scripts/validate_risk_model.py

By default it looks for the scored reference dataset at:

    src/analytics/RISK Assesment/New Model/modeling_dataset_scored.csv

Drop that file into the "New Model" folder next to the .pkl and re-run — no
code change needed. Override the location with --csv if it lives elsewhere.

Without the CSV the script still runs every check that does not need it
(bundle integrity, feature contract, NaN handling, threshold ordering,
determinism), and reports the dataset checks as SKIPPED.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Same joblib/loky core-probe guard as main.py — this script imports
# scikit-learn directly, so it needs its own. loky only honours the value when
# it is strictly less than the logical core count. Must precede that import.
os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(max(1, (os.cpu_count() or 2) // 2)))

# Import the server modules regardless of where this is invoked from.
_SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SERVER_DIR))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import risk_model  # noqa: E402


DEFAULT_CSV = (
    _SERVER_DIR.parent
    / "analytics"
    / "RISK Assesment"
    / "New Model"
    / "modeling_dataset_scored.csv"
)

# Expected values from the handoff §5.
EXPECTED_MEAN_SCORE = 0.15
EXPECTED_FLAGGED_SHARE = 0.45
# 0.682 cross-validated / 0.655 single-split out-of-fold, per handoff §7.
EXPECTED_ROC_AUC = 0.68

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
_results: list[tuple[str, str, str]] = []


def check(name: str, status: str, detail: str = "") -> None:
    _results.append((name, status, detail))
    icon = {PASS: "[PASS]", FAIL: "[FAIL]", SKIP: "[SKIP]"}[status]
    print(f"{icon} {name}" + (f" — {detail}" if detail else ""))


def approx(actual: float, expected: float, tol: float) -> bool:
    return abs(actual - expected) <= tol


def validate_bundle() -> dict:
    print("\n--- Bundle integrity ---")
    info = risk_model.model_info()
    check("Model loads", PASS, f"v{info['version']}, cutoff {info['cutoff']}")

    contract_ok = len(risk_model.FEATURE_COLUMNS) == 21
    check(
        "Feature contract is 21 features",
        PASS if contract_ok else FAIL,
        f"{len(risk_model.FEATURE_COLUMNS)} features",
    )

    import sklearn

    trained = info.get("sklearn_version")
    skew_ok = sklearn.__version__ == trained
    check(
        "scikit-learn version matches training",
        PASS if skew_ok else FAIL,
        f"installed {sklearn.__version__}, trained {trained}",
    )

    thr = info["thresholds"]
    ordered = (
        thr["green_amber"] < thr["amber_red"]
        and thr["loose"] < thr["moderate"] < thr["balanced"] < thr["strict"]
    )
    check(
        "Thresholds are ordered and read from the file",
        PASS if ordered else FAIL,
        ", ".join(f"{k}={v:.4f}" for k, v in sorted(thr.items())),
    )

    check(
        "Reported training performance",
        PASS,
        f"ROC-AUC {info['roc_auc']}, PR-AUC {info['pr_auc']} "
        f"(baseline {info['pr_auc_baseline']}), n={info['n_loans']}",
    )
    return info


def validate_handoff_contract() -> None:
    """The figures and rules from handoff §3 and §4.

    These are the cooperative's published numbers, and the system quotes them
    to reviewers. Pinning them here means a well-meaning edit that rewords an
    action or nudges a band figure fails loudly instead of quietly telling
    staff something the handoff never said.
    """
    print("\n--- Handoff contract (§3 traffic light, §4 rules) ---")

    # §3 traffic light: action, share of applications, historical bad rate.
    expected_bands = {
        "GREEN": ("Process normally", 0.40, 8),
        "AMBER": ("Verify income and payslip", 0.40, 18),
        "RED": ("Refer to Manager / BOD before approval", 0.20, 25),
    }
    mismatches = []
    for name, (action, share, bad_rate) in expected_bands.items():
        meta = risk_model.BAND_META.get(name, {})
        if (
            meta.get("action") != action
            or meta.get("share") != share
            or meta.get("bad_rate_per_100") != bad_rate
        ):
            mismatches.append(name)
    check(
        "Band actions and rates match handoff §3",
        PASS if not mismatches else FAIL,
        "GREEN 8/100, AMBER 18/100, RED 25/100"
        if not mismatches
        else f"drifted: {mismatches}",
    )

    # §3 operating points: four settings, loose recommended.
    points = risk_model.operating_points()
    expected_points = {
        "loose": (0.45, 0.67),
        "moderate": (0.30, 0.50),
        "balanced": (0.20, 0.33),
        "strict": (0.10, 0.21),
    }
    points_ok = all(
        name in points
        and points[name]["reviews_share"] == reviews
        and points[name]["catches_share"] == catches
        and points[name].get("threshold") is not None
        for name, (reviews, catches) in expected_points.items()
    )
    check(
        "Four operating points published with live thresholds",
        PASS if points_ok else FAIL,
        ", ".join(
            f"{k}={points[k]['threshold']:.4f}" for k in expected_points if k in points
        ),
    )

    recommended = [k for k, v in points.items() if v.get("recommended")]
    check(
        "Loose is the recommended operating point",
        PASS if recommended == ["loose"] else FAIL,
        f"recommended: {recommended}",
    )
    check(
        "Default operating point is loose",
        PASS if risk_model.DEFAULT_OPERATING_POINT == "loose" else FAIL,
        risk_model.DEFAULT_OPERATING_POINT,
    )

    # Switching the operating point must actually change what gets flagged.
    borderline = {f: None for f in risk_model.FEATURE_COLUMNS}
    loose_flag = risk_model.score(borderline, operating_point="loose")["flagged"]
    strict_flag = risk_model.score(borderline, operating_point="strict")["flagged"]
    check(
        "Operating point changes the flag",
        PASS if (loose_flag and not strict_flag) else FAIL,
        f"loose={loose_flag}, strict={strict_flag}",
    )

    # §4: the model never rejects. The rule ships with every score.
    scored = risk_model.score(borderline)
    carries_rule = "not grounds for denial" in (scored.get("never_rejects") or "")
    check(
        "Every score carries the never-rejects rule (§4)",
        PASS if carries_rule else FAIL,
    )

    # §3 band context travels with the score, so a UI need not restate it.
    has_context = (
        scored.get("action")
        and scored.get("band_share") is not None
        and scored.get("band_bad_rate_per_100") is not None
    )
    check(
        "Scores carry band action and historical rate",
        PASS if has_context else FAIL,
        f"{scored.get('band')}: {scored.get('action')}",
    )

    # §4 forbids MIGS status, total classification points and attendance as
    # inputs. Share capital and grocery POINTS are the permitted underlying
    # numbers; the classification itself is not.
    banned = {"MIGS", "MigsStatus", "TotalPoints", "TotalScore", "Attendance",
              "AttendancePoints", "Classification", "FinalStatus"}
    leaked = banned.intersection(risk_model.FEATURE_COLUMNS)
    check(
        "No MIGS / attendance / total-points feature (§4)",
        PASS if not leaked else FAIL,
        f"forbidden features present: {sorted(leaked)}" if leaked else "",
    )


def validate_nan_handling() -> None:
    print("\n--- NaN handling (handoff rule: do not impute) ---")

    all_unknown = {f: None for f in risk_model.FEATURE_COLUMNS}
    try:
        result = risk_model.score(all_unknown)
        in_range = 0.0 <= result["probability"] <= 1.0
        check(
            "Scores a row of all-unknown features",
            PASS if in_range else FAIL,
            f"p={result['probability']:.4f}, band={result['band']}",
        )
    except Exception as e:
        check("Scores a row of all-unknown features", FAIL, str(e))
        return

    # A blank must not behave like a zero — that is the whole reason the
    # handoff forbids imputation.
    blank = dict(all_unknown, LoanAmount=50000, Term=24, MonthlyDue=2500)
    zeroed = {f: 0 for f in risk_model.FEATURE_COLUMNS}
    zeroed.update(LoanAmount=50000, Term=24, MonthlyDue=2500)
    p_blank = risk_model.score(blank)["probability"]
    p_zero = risk_model.score(zeroed)["probability"]
    differs = abs(p_blank - p_zero) > 1e-6
    check(
        "Blank and zero produce different scores",
        PASS if differs else FAIL,
        f"blank={p_blank:.4f} vs zero-filled={p_zero:.4f}",
    )


def validate_determinism_and_batching() -> None:
    print("\n--- Determinism and batching ---")
    rows = [
        {
            "LoanAmount": 30000 + i * 5000, "Term": 24, "MonthlyDue": 1500 + i * 100,
            "Dependents": i % 4, "OccTier": (i % 4) + 1, "Age": 35 + i,
            "PriorLoans": i % 5, "PriorRefinances": i % 2, "PriorBehind": i % 3,
            "PriorRestructured": 0, "PriorPenalties": i % 2,
            "PriorBorrowed": 50000 * (i % 5), "DebtGrowth": 1 + i * 0.1,
            "MonthsSinceLastLoan": 6 + i, "ConcurrentLoans": i % 2,
            "ShareCapital": 5 + i, "Savings": 10000 * (i % 4), "HasTimeDeposit": i % 2,
            "SavingsChange": 500 * (i % 3), "Groceries": 3 + (i % 8), "HasSnapshot": 1,
        }
        for i in range(12)
    ]

    batch = risk_model.score_many(rows)
    singles = [risk_model.score(r) for r in rows]
    same = all(
        abs(b["probability"] - s["probability"]) < 1e-9
        for b, s in zip(batch, singles)
    )
    check(
        "Batch scoring matches single scoring",
        PASS if same else FAIL,
        f"{len(rows)} rows compared",
    )

    repeat = risk_model.score_many(rows)
    stable = all(
        abs(a["probability"] - b["probability"]) < 1e-12 for a, b in zip(batch, repeat)
    )
    check("Scoring is deterministic", PASS if stable else FAIL)

    drivers_ok = all(len(r["drivers"]) == 21 for r in batch)
    sorted_ok = all(
        all(
            abs(r["drivers"][i]["contribution"]) >= abs(r["drivers"][i + 1]["contribution"])
            for i in range(len(r["drivers"]) - 1)
        )
        for r in batch
    )
    check(
        "Drivers returned for all 21 features, sorted by impact",
        PASS if (drivers_ok and sorted_ok) else FAIL,
    )

    # Drivers must be JSON-safe: NaN would break the API response.
    sparse = risk_model.score({f: None for f in risk_model.FEATURE_COLUMNS})
    json_safe = all(
        d["value"] is None or not np.isnan(d["value"]) for d in sparse["drivers"]
    )
    check("Driver values are JSON-serialisable (NaN -> None)", PASS if json_safe else FAIL)


def validate_against_csv(csv_path: Path) -> None:
    print("\n--- Reference dataset (handoff §5) ---")
    if not csv_path.exists():
        check(
            "Reference dataset present",
            SKIP,
            f"not found at {csv_path}. Drop modeling_dataset_scored.csv into "
            "the 'New Model' folder and re-run.",
        )
        return

    df = pd.read_csv(csv_path)
    check("Reference dataset present", PASS, f"{len(df)} rows from {csv_path.name}")

    missing = [c for c in risk_model.FEATURE_COLUMNS if c not in df.columns]
    if missing:
        check("Dataset carries all 21 features", FAIL, f"missing: {missing}")
        return
    check("Dataset carries all 21 features", PASS)

    feature_rows = df[risk_model.FEATURE_COLUMNS].to_dict("records")
    # Restore NaN: to_dict turns them into float('nan'), which coerce_float
    # would pass through, but be explicit so intent is clear.
    for row in feature_rows:
        for k, v in row.items():
            if isinstance(v, float) and np.isnan(v):
                row[k] = None

    scored = risk_model.score_many(feature_rows)
    probs = np.array([s["probability"] for s in scored])

    mean_score = float(probs.mean())
    check(
        "Mean score ~= 0.15",
        PASS if approx(mean_score, EXPECTED_MEAN_SCORE, 0.03) else FAIL,
        f"{mean_score:.4f}",
    )

    loose = risk_model.thresholds()["loose"]
    flagged_share = float((probs >= loose).mean())
    check(
        "Share above loose threshold ~= 45%",
        PASS if approx(flagged_share, EXPECTED_FLAGGED_SHARE, 0.05) else FAIL,
        f"{flagged_share * 100:.1f}%",
    )

    # Agreement with the reference scores.
    #
    # These will NOT match row-for-row, and should not be expected to. The
    # model_score column is out-of-fold: every loan was scored by a model that
    # had not seen it. The shipped .pkl is the final model refit on all rows,
    # so scoring this dataset with it is in-sample. The two answer different
    # questions about the same loan.
    #
    # What must agree is the distribution — that is what shows the feature
    # pipeline is assembling inputs the way training did. A drifted mean or a
    # weak rank correlation means the integration is feeding the model
    # something different from what it was trained on.
    if "model_score" in df.columns:
        ref = df["model_score"].to_numpy(dtype=float)
        mean_gap = abs(float(probs.mean()) - float(ref.mean()))
        check(
            "Score distribution matches the reference",
            PASS if mean_gap < 0.02 else FAIL,
            f"mean {probs.mean():.4f} vs reference {ref.mean():.4f} "
            f"(gap {mean_gap:.4f}; per-row differences are expected — "
            "reference is out-of-fold, shipped model is refit)",
        )

        corr = float(np.corrcoef(probs, ref)[0, 1])
        check(
            "Scores rank-correlate with the reference",
            PASS if corr > 0.6 else FAIL,
            f"r={corr:.4f}",
        )
    else:
        check("Score distribution matches the reference", SKIP, "no model_score column")

    if "risk" in df.columns:
        try:
            from sklearn.metrics import roc_auc_score

            y = df["risk"].to_numpy()

            # The honest generalisation estimate is the out-of-fold column, not
            # anything computed here: scoring the shipped model against its own
            # training rows is in-sample and will read high no matter how sound
            # the integration is. Report both, and judge against the right one.
            if "model_score" in df.columns:
                auc_oof = float(roc_auc_score(y, df["model_score"].to_numpy(dtype=float)))
                ok = approx(auc_oof, 0.655, 0.03)
                check(
                    "Out-of-fold ROC-AUC ~= 0.655 (the real estimate)",
                    PASS if ok else FAIL,
                    f"{auc_oof:.4f}",
                )

            auc_in = float(roc_auc_score(y, probs))
            # In-sample AUC is expected to sit well above the out-of-fold
            # figure. It is reported for transparency, not as a pass criterion
            # — treating it as one would overstate the model to the panel.
            check(
                "In-sample ROC-AUC (informational, expected to be optimistic)",
                PASS,
                f"{auc_in:.4f} — do NOT quote this as the model's accuracy; "
                "use the cross-validated 0.682 from the bundle",
            )
        except Exception as e:
            check("ROC-AUC checks", SKIP, str(e))
    else:
        check("ROC-AUC checks", SKIP, "no risk column")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help="Path to modeling_dataset_scored.csv (defaults to the New Model folder)",
    )
    args = parser.parse_args()

    print("TTMPC Credit Risk Model — pre-live validation")
    print("=" * 60)

    try:
        validate_bundle()
    except risk_model.ModelNotAvailableError as e:
        print(f"\n[FAIL] Model could not be loaded: {e}")
        return 1

    validate_handoff_contract()
    validate_nan_handling()
    validate_determinism_and_batching()
    validate_against_csv(args.csv)

    print("\n" + "=" * 60)
    passed = sum(1 for _, s, _ in _results if s == PASS)
    failed = sum(1 for _, s, _ in _results if s == FAIL)
    skipped = sum(1 for _, s, _ in _results if s == SKIP)
    print(f"{passed} passed, {failed} failed, {skipped} skipped")

    if skipped:
        print(
            "\nSkipped checks need modeling_dataset_scored.csv in\n"
            f"  {DEFAULT_CSV.parent}\n"
            "Drop it there and re-run to complete the handoff §5 validation."
        )
    if failed:
        print("\nFailures above must be resolved before relying on the model.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
