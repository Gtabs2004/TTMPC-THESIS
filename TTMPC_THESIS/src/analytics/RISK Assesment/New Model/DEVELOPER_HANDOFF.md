# Developer Handoff — TTMPC Risk Model v3.3

**For the team integrating the model into the cooperative's loan system.**

This document describes the model the system should run, how to load it, what to feed
it, and the rules the surrounding system must enforce. It supersedes all earlier handoff
notes. If anything here disagrees with an older `.pkl` or an older document, this
document and the v3.3 model file win.

---

## 0. What changed since the previous handoff (read this first)

If you integrated an earlier version, these are the breaking changes:

- **The model file is different.** Use the `ttmpc_risk_model.pkl` produced by the v5
  notebook (internal version tag `3.3`). Earlier files (`3.1`, ROC-AUC 0.659) were
  trained before the member records were repaired and must be replaced.
- **Feature #18 changed.** It was `TotalDeposits` (a peso amount). It is now
  **`HasTimeDeposit`** (a 0/1 flag). If your integration passes `TotalDeposits`, it will
  break the feature contract. See Section 2.
- **Do not hardcode thresholds.** Read them from the model file (`bundle['thresholds']`).
  They are recomputed at every retraining and will change. Hardcoded values will silently
  drift out of date.

---

## 1. Load

```python
import pickle
with open('ttmpc_risk_model.pkl', 'rb') as f:
    bundle = pickle.load(f)

model      = bundle['pipeline']      # HistGradientBoostingClassifier
FEATURES   = bundle['features']      # 21 names - order matters
THRESHOLDS = bundle['thresholds']    # read these; never hardcode
```

Requires `scikit-learn >= 1.3`, `pandas`, `numpy`. Match the `scikit-learn` version
recorded in `bundle['sklearn_version']` — loading a pickle across major versions can fail
or behave unpredictably.

The model handles missing values (`NaN`) natively. **Do not impute. Do not fill blanks
with 0.** A blank and a zero mean different things (see Section 2).

---

## 2. Feature contract

Build a single-row DataFrame with **exactly these 21 columns, in this order**. Pass
`np.nan` for anything genuinely unknown — never `0` as a stand-in.

| # | Feature | Type | Meaning |
|---|---|---|---|
| 1 | `LoanAmount` | float | Amount applied for |
| 2 | `Term` | float | Months requested (the ORIGINAL term — see the restructuring rule in Section 4) |
| 3 | `MonthlyDue` | float | `LoanAmount/Term + LoanAmount*rate` |
| 4 | `Dependents` | float | From member profile |
| 5 | `OccTier` | float | Occupation stability tier: 1 steadiest … 4 least steady, 0 unknown (see mapping below) |
| 6 | `Age` | float | Age in years on the application date |
| 7 | `PriorLoans` | int | Count of the member's **previous** loans |
| 8 | `PriorRefinances` | float | Previous loans settled by taking a new loan |
| 9 | `PriorBehind` | float | Previous loans that went 3+ months behind |
| 10 | `PriorRestructured` | float | Previous loans with non-standard (restructured) terms — history only, never the current loan |
| 11 | `PriorPenalties` | float | Previous loans that incurred a penalty |
| 12 | `PriorBorrowed` | float | Sum of all previous loan amounts |
| 13 | `DebtGrowth` | float | `LoanAmount / the member's first-ever loan amount` |
| 14 | `MonthsSinceLastLoan` | float | `nan` for a first loan |
| 15 | `ConcurrentLoans` | int | Loans still open on the application date |
| 16 | `ShareCapital` | float | Share-capital classification POINTS (0–20), not the peso amount |
| 17 | `Savings` | float | Latest savings balance (peso) |
| 18 | `HasTimeDeposit` | int | **1 if the member has a time deposit, else 0** |
| 19 | `SavingsChange` | float | This year's savings minus last year's |
| 20 | `Groceries` | float | Grocery patronage POINTS (3–10), not the peso amount |
| 21 | `HasSnapshot` | int | 1 if any of fields 16, 17, 19, 20 are available, else 0 |

**Interest rates for `MonthlyDue`:** Consolidated `0.0083` per month, Emergency `0.02`.

### Two features are POINTS, not pesos

`ShareCapital` (#16) and `Groceries` (#20) are the cooperative's classification point
scores, not money amounts. `ShareCapital` runs 0–20; `Groceries` runs 3–10. Do not feed
the peso value here — the model was trained on the point scores. (The peso share-capital
amount is used elsewhere, for the loan-to-capital cap check, but not as a model feature.)

### Occupation → `OccTier` mapping

Groups the free-text occupation into an income-steadiness tier (lower = steadier income).
Anything not listed maps to tier 4; blank/unknown maps to 0.

| Tier | Meaning | Example occupations |
|---|---|---|
| 1 | Steadiest — state-backed fixed salary or pension | Public school teacher, government employee, retired teacher, dietitian (institutional) |
| 2 | Formal wage / agency contract | Cashier, security guard, store clerk, caregiver, encoder |
| 3 | Variable / intermittent / term-limited | Seafarer, beautician, barber, elected local official (SB member) |
| 4 | Least steady / informal / micro-business | Farmer, vendor, rice dealer, small business, entrepreneur |
| 0 | Unknown / not recorded | (blank) |

**Income is deliberately absent.** It was tested and removed: missing for about half of
loans, and it made the model slightly worse even where recorded. Do not add it back
without re-validating.

**Features 7–15 count PREVIOUS loans only.** Including the application being scored will
leak the outcome and corrupt the prediction.

---

## 3. Score

```python
import pandas as pd, numpy as np

row   = pd.DataFrame([{...}])[FEATURES].astype(float)
score = model.predict_proba(row)[0, 1]        # 0.0 - 1.0, higher = riskier

flagged = score >= THRESHOLDS['loose']        # recommended setting
```

### Operating points (from the final model)

Scores are low in absolute terms (most sit between roughly 0.05 and 0.35). Use the
thresholds from the file, not intuition.

| Setting | Threshold key | Reviews | Catches | Hit rate |
|---|---|---|---|---|
| **loose** (recommended) | `loose` | top ~45% | 67% of problem loans | 22% |
| moderate | `moderate` | top ~30% | 50% | 25% |
| balanced | `balanced` | top ~20% | 33% | 25% |
| strict | `strict` | top ~10% | 21% | 32% |

### Traffic light

```python
def band(score, THRESHOLDS):
    if score < THRESHOLDS['green_amber']: return 'GREEN'
    if score < THRESHOLDS['amber_red']:   return 'AMBER'
    return 'RED'
```

| Band | Share of applications | Historical bad rate | Action |
|---|---|---|---|
| GREEN | ~40% | ~8 in 100 | Process normally |
| AMBER | ~40% | ~18 in 100 | Verify income and payslip |
| RED | ~20% | ~25 in 100 | Refer to Manager / BOD before approval |

A RED loan runs into trouble about three times as often as a GREEN one. Read the exact
band thresholds from `THRESHOLDS['green_amber']` and `THRESHOLDS['amber_red']`.

---

## 4. Rules the system must enforce

**The model never rejects an application.** It routes applications to a review queue. A
score is not grounds for denial — the cooperative's by-laws grant every member the right
to apply, and Non-MIGS members explicitly retain that right.

**Do not use MIGS status as an input.** Under the 2024 Guidelines, three months of
non-payment makes a member delinquent and demotes them to Non-MIGS. Feeding MIGS status
into a delinquency model is circular. Use the underlying numbers — share capital, savings,
groceries — never the classification or total points.

**Do not add attendance as a gatekeeper.** It is worth 5 of 100 classification points,
does not predict repayment, and blocking applications on it would contradict the by-laws.

**Use the ORIGINAL loan term, never the restructured one.** When a loan is extended, the
ledger overwrites the original term with the new one. The extended term is not known on
the application date and leaks the outcome. Feature #2 (`Term`) must be the term requested
at application. Feature #10 (`PriorRestructured`) is different and permitted: it counts
only the member's previous, already-closed loans that had non-standard terms.

**Log every score** with the input row and the model version tag. Required for retraining
and audit.

---

## 5. Validation before going live

Score the loans in `modeling_dataset_scored.csv` through your integration and compare
against the `model_score` column already in that file.

| Check | Expected |
|---|---|
| Mean score | about 0.15 |
| Share above the loose threshold | about 45% |
| ROC-AUC against the `risk` column | about 0.68 |

A materially higher AUC means something has leaked — most likely a feature computed from
the loan being scored rather than from prior loans. Investigate before shipping.

---

## 6. Retraining

Retrain once a year, after the January classification update. Re-run the pipeline notebook
with a new cut-off date. **Preserve the grouped cross-validation** (StratifiedGroupKFold,
grouped by member) — without it, validation scores look better than the model truly
performs, because the same member's loans leak between training and test.

Each retraining recomputes the thresholds. Read them fresh from the new file; do not carry
the old numbers forward.

---

## 7. Known limits (state these to anyone relying on the model)

- **ROC-AUC 0.682** (cross-validated; single-split out-of-fold is 0.655). At the loose
  setting the model misses about a third of trouble. It supports judgement; it does not
  replace it.
- **PR-AUC 0.342** against a 0.151 baseline — more than twice as good as random at
  concentrating risky loans near the top.
- **Bonus loans are out of scope** — different repayment mechanism (one lump sum). Too few
  in the records to model. Score bonus applicants only for baseline capacity; do not train
  on them.
- **Some borrowers have incomplete profiles.** Their applications score with several blanks
  and `HasSnapshot = 0`. That is expected and handled.
- **The model reflects the cooperative's record quality.** The ceiling here is data, not
  method — missing income, incomplete late-payment counts, and overwritten loan terms all
  cap performance. Better records will raise the score more than any modelling change.

---

## 8. Two data-hygiene requests to the cooperative (worth passing on)

These are not code changes, but they directly limit the model and the system's usefulness:

1. **Record loan extensions as a new entry, not by overwriting the original term.** This
   would let future versions use extension history, which is currently unusable.
2. **Record each member's number of late payments consistently.** It is left blank for
   many members, which both weakens the model's validation and can wrongly cost members
   classification points.
