# TTMPC Credit Risk — Handoff Package

This folder contains everything needed to (a) reproduce the trained credit risk model, and (b) integrate it into the loan management system.

## Contents

| File | Audience | Purpose |
|---|---|---|
| `TTMPC_Production_Notebook.ipynb` | **You (data scientist)** | Master notebook. Run in Google Colab to produce the `.pkl` and metadata. |
| `feature_contract.md`             | **Developers**          | Plain-language spec of what the model expects. Read first. |
| `predict_example.py`              | **Developers**          | Runnable inference example with all feature-preparation logic included. |
| `model_metadata.json`             | **Developers + machines** | Generated when the notebook runs. Machine-readable feature spec. |
| `ttmpc_credit_risk_model.pkl`     | **Developers**          | Generated when the notebook runs. The trained Random Forest. |

## Workflow

### For you (the data scientist)

1. Upload `TTMPC_Production_Notebook.ipynb` to your Google Colab.
2. Make sure `Loan_Ledger.xlsx` and `MembersProfile.csv` are in your Google Drive under `MyDrive/TTMPC_Credit_Risk/` (or edit the path in the Setup cell).
3. Run the whole notebook top to bottom (Runtime → Run all).
4. After the final verification cell passes ✅, two files appear in `MyDrive/TTMPC_Credit_Risk/outputs/`:
   - `ttmpc_credit_risk_model.pkl`
   - `model_metadata.json`
5. Bundle those two files with `feature_contract.md` and `predict_example.py` and send them to the developers.


### For the developers

1. Read `feature_contract.md` first.
2. Run `predict_example.py` to see the model produce predictions on test cases.
3. Adapt the feature-preparation functions in that file to your integration code.
4. Pin the scikit-learn version recorded in `model_metadata.json` in your production environment.

## What's NOT in this handoff

These belong to the methodology/thesis notebook, not the production pipeline:

- Exploratory data analysis (histograms, boxplots, correlation heatmaps)
- Statistical validation (t-tests, chi-square, paired t-test vs lazy baseline)
- Operational audits (concurrent loan check, 6-month wait-period, MIGS comparison)
- Pre-modeling feature screening

If the developers ask for these later, they live in a separate notebook for documentation purposes.

## Retraining

Re-run `TTMPC_Production_Notebook.ipynb` end-to-end with updated source data. The notebook is fully reproducible (random seed is fixed at 42). Recommended cadence: every 6–12 months as new repayment history accumulates.
