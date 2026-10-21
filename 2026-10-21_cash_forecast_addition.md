# Cash sufficiency addition to the loan demand forecast: please review

To: the group leader (built the loan demand forecasting). From: Erden.

## What we are adding
The Treasurer's Vault page compares the vault only with next month's forecast. We asked the developers to show all forecast months (the endpoint already returns 12), and for each month: the forecast need, the cash already reserved, the cash available, the coverage percentage, a status (Sufficient / Tight / Shortfall) and how much cash to prepare. The full rule is in section B of `2026-10-21_message_to_developers_profile_change_requests.md`. We are not changing the model itself.

## The decision we need your view on
The status is based on the upper end of the 80% confidence band (the page and the model's default already use it), summed over consolidated and emergency. The point estimate and the upper 95% band are shown only as "likely" and "worst case" columns.

Reasons:
- The point estimate is exceeded about half the time, so it would say "sufficient" too often.
- The upper 95% band would show a shortfall in most months and stop being informative.
- The upper 80% band is a middle choice, already used in the system, and it keeps the status stable.
- It is one setting in the code, so it can move to 95% later.

Please tell us if you disagree, or if you would defend a different band in front of the panel.

## Questions only you can answer
1. What does the model forecast exactly: the loan amount by application month, or by release month? Cash leaves the vault at release and net of fees (service fee, CBU, insurance, notarial, Bonus upfront interest). If the series is gross amounts by application month, the need is slightly high (safe side). Is that how you describe it in the manuscript?
2. The Vault page adds consolidated and emergency only. The forecast endpoint also supports Bonus, and Bonus is now open all year. Should Bonus be added to the monthly need?
3. For far months, we compare each month with today's available cash, not a running balance, because collections are not forecast. Is that acceptable, or should expected collections be shown as a separate line?
4. Is the model retrained on new data, and how often? After the simulated data goes to MAIN, October looks about 3.5 times busier than August because of simulated payments. Should the forecast be retrained, or kept on the original data for the defense?

## What we do not change
The SARIMAX models, their files, and the forecast endpoints. Only the Vault page and one helper figure for reserved cash.

## As built (2026-10-21)
Decisions taken on the open questions (group leader sign-off via the developers, not re-litigated here):
1. Gross/pre-fee vs net-at-release: left as-is, no adjustment — the Vault page now carries a caption noting the forecast is by application month and gross of fees, so "need" runs slightly high (safe side).
2. Bonus loans: **added** to the monthly need, since Bonus is open all year. `FORECAST_LOAN_TYPES` in `Vault.jsx` now includes `bonus` alongside `consolidated`/`emergency`.
3. Far months: compared against **today's cash available**, not a running balance — no separate collections line added.
4. Retraining: **not retrained**. Models/endpoints untouched, consistent with "what we do not change" above.

Implementation, `TTMPC_THESIS/src/Treasurer/Components/Vault.jsx`:
- Fetches all `FORECAST_MONTHS = 12` months from `/api/analytics/demand/forecast` for consolidated/emergency/bonus and merges them by period.
- "Cash already reserved" = `summary.total_amount` from `GET /api/treasurer/disbursements/priority-queue?limit=1` (approved/ready-for-disbursement loans not yet released). "Cash available" = vault balance − reserved, held constant across all 12 rows.
- Per month: Forecasted Need (upper 80% CI, sum of the three types — unchanged default band, matches the earlier single-month card), Likely (point estimate), Worst Case (upper 95% CI), Available, Coverage %, Status (Sufficient/Tight/Shortfall — same <100%/<120%/else thresholds as before), and Prepare (max(0, need − available)).
- Next month's row still gets its own verdict callout above the table; the table itself covers all 12 months.
- No backend/model changes.
