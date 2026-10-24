# Message to the developers: plain-language risk explanations (two screens)

Date: 2026-10-24
From: Erden (risk model presentation)
Scope: display text and defaults only. No change to the model, scoring, thresholds, backend (`main.py`, `risk_model.py`) or database.

## Why

On the defense demo, the reasons behind a risk band were hard for non-technical reviewers to read. The Credit Risk sidebar showed raw signed numbers (+0.168), cohort medians and a note about log-odds. We want both screens to explain the result the same way: what the reviewer should do, what the model read, and which factors raised or lowered the score.

## Change 1: Credit Risk sidebar (Bookkeeper and Manager)

File: `TTMPC_THESIS/src/components/CreditRisk/CreditRiskPage.jsx`, the "Feature Contributions" block inside the detail drawer (about lines 523 to 600).

| Before | After |
|---|---|
| List of features with signed numbers, "Applicant" and "Cohort median" lines, "above cohort by 130%" | Section "Values the model read": loan amount, previous loans, previously behind, concurrent loans, share capital points, grocery points, savings, occupation tier. A missing value shows "not recorded", never 0. |
| Footnote about "log-odds" and "when the PKL is swapped" | Section "Score drivers": one bar per factor, red = "Raises", green = "Lowers", "No effect" when neutral. Longer bar = stronger effect. One plain sentence explains the colors. |

The values come from the drivers list the page already loads. No new API field is needed.

## Change 2: Loan application review, "Payment Risk Indicators"

File: `TTMPC_THESIS/src/Manager/Components/LoanApprovalDetails.jsx` (about lines 1986 to 2300).

1. Removed the line "In the past, about N out of 100 loans scored like this one had repayment problems."
2. Added a bulleted checklist under the "What to do" headline. The headline still comes from the backend, so it matches the model file and the manuscript.

| Band | Checklist shown |
|---|---|
| Green (Low Risk) | Confirm the payslip is on file. Ensure the loan amount is within the debt ceiling (5x share capital for MIGS, 3x for Non-MIGS). Make sure there is no open loan with a past-due balance. |
| Amber (Medium Risk) | Check the latest payslip and net take-home pay. Confirm the monthly payment fits the Debt Capacity Framework limit (40% of net take-home pay). Confirm the existing loan balance and payment history. Record the verification result as a note on the application. Forward only after the check is done. |
| Red (High Risk) | The first four Amber steps, then: look at the member's top risk factors and address them (prior late payments, renewal history, several open loans); ask the Manager or BOD to decide, with the notes attached; consider conditions (a lower amount within the debt ceiling, a longer term so the monthly payment fits, a co-maker if the cooperative requires one, or payroll deduction if the member is a salaried teacher); after approval, put the member on early follow-up. |

3. "Show technical detail" is now open by default (the toggle stays, and `showRiskDetail` starts as `true`).
4. Bug fix: a neutral finding such as "Already carrying 1 open loan" was listed under "In the member's favour". Only real strengths stay there now. Neutral findings go under "Points to check" with a grey dot (red dot is kept for real concerns).

## How to review

1. Open the diff of the two files above.
2. Run the app, go to Credit Risk, and click one High, one Medium and one Low loan. Check the drawer shows "Values the model read" and "Score drivers", with no signed numbers.
3. Open the same loans from Loan Approval and check the checklist matches the table above and the technical detail is already open.
4. Check a member with one open loan: it must not appear under "In the member's favour".

## Things to know

- The checklist text is advice for the reviewer. The system has no field for a co-maker condition, payroll deduction or early follow-up tracking in this screen; nothing is saved by the checklist.
- The headline wording (Standard review / Verify income and payslip / Review most closely before approval) is unchanged and still comes from `BAND_META` in `risk_model.py`. If the group later decides on new headlines, change `BAND_META` and the manuscript (band description and Table XXVII) together so all three agree.
- Not changed, but open for the group: the sidebar header still reads "Predicted Default Probability" while the manuscript calls the output a Risk Score and the outcome a risky loan; and Age can show as a "Raises" bar, which a panelist may ask about.
- Both files had an old unused-variable lint error before this change (for example `topDrivers` in `CreditRiskPage.jsx`). No new lint errors were added in the edited blocks.

## What we need from you

Apply or merge the two file changes, check them on the TEST data with the steps above, and tell us when they are on MAIN. Please reply if any rule in the checklist (debt ceiling multiples, 40% limit) is stated differently in the live eligibility code.

## Code to paste

The loan review file has about 2,850 lines, so only the changed block is pasted below, with where it goes. Everything else in both files is unchanged.

### 1. `TTMPC_THESIS/src/components/CreditRisk/CreditRiskPage.jsx`

In the detail drawer, find the block that starts with `<div className="p-6">` and the heading "Feature Contributions", and ends with the grey footnote `<div className="p-6 border-t border-gray-100 bg-gray-50">` (the text about "log-odds"). Replace that whole block (the `p-6` div and the footnote div) with this:

```jsx
            {(() => {
              // Same plain presentation as "Show technical detail" on the loan
              // application review: what the model read, and which factors
              // raised or lowered this score. No raw model units on screen.
              const allDrivers = selectedLoan.drivers || [];
              if (allDrivers.length === 0) {
                return (
                  <div className="p-6">
                    <p className="text-sm text-gray-400 italic">
                      {selectedLoan.error || "No attribution available for this applicant."}
                    </p>
                  </div>
                );
              }
              const byFeature = Object.fromEntries(allDrivers.map((d) => [d.feature, d]));
              const readValue = (feat, kind) => {
                const d = byFeature[feat];
                if (!d || d.value == null) return "not recorded";
                return kind === "peso" ? formatPeso(d.value) : String(Math.round(Number(d.value) * 100) / 100);
              };
              const valuesRead = [
                ["Loan Amount", readValue("LoanAmount", "peso")],
                ["Previous Loans", readValue("PriorLoans")],
                ["Previously Behind", readValue("PriorBehind")],
                ["Concurrent Loans", readValue("ConcurrentLoans")],
                ["Share Capital (pts)", readValue("ShareCapital")],
                ["Grocery (pts)", readValue("Groceries")],
                ["Savings", readValue("Savings", "peso")],
                ["Occupation Tier", readValue("OccTier")],
              ];
              const shown = allDrivers.slice(0, DRIVERS_SHOWN);
              const maxAbs = Math.max(...shown.map((d) => Math.abs(d.contribution)), 1e-9);
              return (
                <div className="p-6 space-y-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Values the model read</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      {valuesRead.map(([label, value]) => (
                        <div key={label}>
                          <p className="text-[10px] text-gray-400 uppercase">{label}</p>
                          <p className="font-semibold text-gray-800">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Score drivers</p>
                    <div className="space-y-2.5">
                      {shown.map((d) => {
                        const pct = (Math.abs(d.contribution) / maxAbs) * 100;
                        const isUp = d.direction === "up";
                        const isNeutral = d.direction !== "up" && d.direction !== "down";
                        const barColor = isNeutral ? "bg-gray-300" : isUp ? "bg-red-400" : "bg-green-500";
                        const tagColor = isNeutral ? "text-gray-400" : isUp ? "text-red-600" : "text-green-700";
                        return (
                          <div key={d.feature}>
                            <div className="flex items-center justify-between mb-0.5 gap-2">
                              <span className="text-xs text-gray-700 font-medium truncate">{featureLabel(d.feature)}</span>
                              <span className={`text-[10px] font-bold uppercase shrink-0 ${tagColor}`}>
                                {isNeutral ? "No effect" : isUp ? "Raises" : "Lowers"}
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${pct.toFixed(1)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-3">
                      Red bars raise this application's risk score and green bars lower it. A longer bar means a stronger effect.
                    </p>
                  </div>
                </div>
              );
            })()}
```

No new imports are needed. It uses `formatPeso`, `featureLabel` and `DRIVERS_SHOWN`, which already exist in the file.

### 2. `TTMPC_THESIS/src/Manager/Components/LoanApprovalDetails.jsx`

Change A, near line 164: make the technical detail open by default.

```jsx
const [showRiskDetail, setShowRiskDetail] = useState(true);
```

Change B: replace the whole "Payment Risk Indicators" section (from its comment, "Payment Risk Indicators (TTMPC Credit Risk Model)", to the end of its `})()}` block, just before the "Bookkeeper Internal Review" section) with the code below. The pasted text starts a few lines before that comment so you can see where it sits. If the lines just before it differ in your copy, keep your own lines and replace only from the comment on.

```jsx

      {/* Payment Risk Indicators (TTMPC Credit Risk Model) — full-width row.
          Moved out of the two-column grid: with 21 features + drivers this
          section is naturally tall, and squeezing it into a half-width
          column left a wall of dead space beside the shorter Computation
          column. Full width lets the content lay out sideways instead of
          stacking. Follows the same shape as Bookkeeper Internal Review
          below — heading outside, tinted panel inside — so the two
          full-width rows line up with each other and with the card above. */}
      <div id="section-risk" className="scroll-mt-44 pt-8 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center text-lg font-bold text-gray-800">
            <BarChart2 className="w-5 h-5 mr-2 text-member-green" /> Payment Risk Indicators
          </h2>
          <button
            type="button"
            onClick={handleRunRiskAssessment}
            disabled={riskLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md border border-member-green text-member-green hover:bg-member-green hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {riskLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {riskAssessment ? 'Re-run' : 'Run Risk Assessment'}
          </button>
        </div>

          {riskError && (
            <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              {riskError}
            </div>
          )}

          {!riskAssessment && !riskLoading && !riskError && (
            <div className="p-8 border border-dashed border-gray-300 rounded-xl text-center text-sm text-gray-500">
              No risk assessment yet. Click <span className="font-semibold text-member-green">Run Risk Assessment</span> to score this application.
            </div>
          )}

          {riskAssessment && (() => {
            const features = riskAssessment.features_used || {};

            // The traffic-light band is decided by the backend from the model
            // file's own thresholds. risk_class only records whether the loan
            // crossed the recommended review threshold - it is a routing
            // signal, not an approve/deny verdict.
            const band = riskAssessment.band
              || (Number(riskAssessment.risk_class) === 1 ? 'AMBER' : 'GREEN');

            // Presentation only. The label, the recommended action and the
            // band's historical trouble rate all come from the backend, which
            // reads them from the model file - so this view never restates the
            // cooperative's figures in its own words.
            const BAND_UI = {
              RED: {
                fallbackLabel: 'High Risk',
                fallbackAction: 'Review most closely before approval',
                panel: 'border-red-200 bg-red-50',
                accent: 'bg-red-500',
                text: 'text-red-700',
                Icon: ShieldAlert,
                iconClass: 'text-red-600',
              },
              AMBER: {
                fallbackLabel: 'Medium Risk',
                fallbackAction: 'Verify income and payslip',
                panel: 'border-amber-200 bg-amber-50',
                accent: 'bg-amber-500',
                text: 'text-amber-700',
                Icon: ShieldAlert,
                iconClass: 'text-amber-600',
              },
              GREEN: {
                fallbackLabel: 'Low Risk',
                fallbackAction: 'Standard review',
                panel: 'border-green-200 bg-green-50',
                accent: 'bg-member-green',
                text: 'text-green-800',
                Icon: ShieldCheck,
                iconClass: 'text-green-700',
              },
            };
            const ui = BAND_UI[band] || BAND_UI.AMBER;
            const bandLabel = riskAssessment.risk_label || ui.fallbackLabel;
            const bandAction = riskAssessment.action || ui.fallbackAction;
            // What the reviewer does for each band. Shown as a checklist under
            // the headline action. The headline itself still comes from the
            // backend so it matches the model file and the manuscript.
            const VERIFY_STEPS = [
              'Check the latest payslip and net take-home pay',
              'Confirm the monthly payment fits the Debt Capacity Framework limit (40% of net take-home pay)',
              'Confirm the existing loan balance and payment history',
              'Record the verification result as a note on the application',
              'Forward only after the check is done',
            ];
            const BAND_STEPS = {
              GREEN: [
                'Confirm the payslip is on file',
                'Ensure the loan amount is within the debt ceiling (5x share capital for MIGS, 3x for Non-MIGS)',
                'Make sure there is no open loan with a past-due balance',
              ],
              AMBER: VERIFY_STEPS,
              RED: [
                ...VERIFY_STEPS.slice(0, 4),
                "Look at this member's top risk factors below and address them: prior late payments, renewal history, several open loans",
                'Ask the Manager or BOD to decide, with the notes attached',
                'Consider conditions: a lower amount within the debt ceiling, a longer term so the monthly payment fits, a co-maker if the cooperative requires one, or payroll deduction if the member is a salaried teacher',
                'After approval, put the member on early follow-up',
              ],
            };
            const steps = BAND_STEPS[band] || BAND_STEPS.AMBER;

            // ----------------------------------------------------------------
            // Translate the model's drivers into things a reviewer can act on.
            //
            // The raw driver list is model diagnostics: feature names, cohort
            // medians, signed contributions. None of that tells a bookkeeper
            // what to verify before approving. Each rule below turns one
            // driver into a plain-language observation about the BORROWER.
            //
            // Only findings that pass a materiality check are shown, so a
            // clean application stays visually clean instead of listing eight
            // near-zero contributions.
            // ----------------------------------------------------------------
            const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

            const FINDING_RULES = {
              PriorBehind: (v) => v > 0 && {
                tone: 'concern',
                text: `Fell 3+ months behind on ${v} previous ${v === 1 ? 'loan' : 'loans'}`,
              },
              PriorPenalties: (v) => v > 0 && {
                tone: 'concern',
                text: `Incurred penalties on ${v} previous ${v === 1 ? 'loan' : 'loans'}`,
              },
              PriorRestructured: (v) => v > 0 && {
                tone: 'concern',
                text: `${v} previous ${v === 1 ? 'loan was' : 'loans were'} restructured`,
              },
              ConcurrentLoans: (v) => v > 0 && {
                tone: v >= 2 ? 'concern' : 'neutral',
                text: `Already carrying ${v} open ${v === 1 ? 'loan' : 'loans'}`,
              },
              MonthsSinceLastLoan: (v) => v < 3 && {
                tone: 'concern',
                text: v < 1
                  ? 'Applying again within a month of the last loan'
                  : `Applying again after only ${Math.round(v)} month${Math.round(v) === 1 ? '' : 's'}`,
              },
              PriorLoans: (v) => v >= 3 && {
                tone: 'good',
                text: `Established borrowing history (${v} previous loans)`,
              },
              OccTier: (v) => v === 1 && {
                tone: 'good',
                text: 'Steady income - fixed salary or pension',
              },
              ShareCapital: (v) => v >= 15 && {
                tone: 'good',
                text: 'Strong share capital standing',
              },
              Age: (v) => v < 25 && {
                tone: 'neutral',
                text: 'Young borrower with a shorter track record',
              },
            };

            // Rank by the model's own attribution so the most influential
            // observations surface first, then keep the top few.
            const findings = (riskAssessment.drivers || [])
              .map((d) => {
                const rule = FINDING_RULES[d.feature];
                const value = num(d.value);
                if (!rule || value == null) return null;
                const hit = rule(value);
                if (!hit) return null;
                return { ...hit, weight: Math.abs(Number(d.contribution) || 0) };
              })
              .filter(Boolean)
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 5);

            const concerns = findings.filter((f) => f.tone !== 'good');
            const positives = findings.filter((f) => f.tone === 'good');

            const missingSnapshot = Number(features.HasSnapshot) === 0;

            // Technical detail, shown only on request.
            const FEATURE_LABELS = {
              LoanAmount: 'Loan Amount',
              Term: 'Term (months)',
              MonthlyDue: 'Monthly Due',
              Dependents: 'Dependents',
              OccTier: 'Occupation Stability',
              Age: 'Age',
              PriorLoans: 'Previous Loans',
              PriorRefinances: 'Previous Renewals',
              PriorBehind: 'Previously Behind',
              PriorRestructured: 'Previously Restructured',
              PriorPenalties: 'Previous Penalties',
              PriorBorrowed: 'Total Previously Borrowed',
              DebtGrowth: 'Debt Growth',
              MonthsSinceLastLoan: 'Months Since Last Loan',
              ConcurrentLoans: 'Concurrent Loans',
              ShareCapital: 'Share Capital (points)',
              Savings: 'Savings Balance',
              HasTimeDeposit: 'Has Time Deposit',
              SavingsChange: 'Savings Change (yr)',
              Groceries: 'Grocery Patronage (points)',
              HasSnapshot: 'Has Financial Snapshot',
            };
            const detailDrivers = (riskAssessment.drivers || []).slice(0, 8);
            const maxAbs = Math.max(...detailDrivers.map((d) => Math.abs(d.contribution)), 1e-9);

            return (
              <div className="space-y-4">
                {/* The decision: band, what to do, and how often this band
                    actually goes wrong. Everything a reviewer needs to act. */}
                <div className={`border rounded-xl overflow-hidden ${ui.panel}`}>
                  <div className="flex flex-col sm:flex-row">
                    <div className="flex items-center gap-3 px-5 py-4 sm:w-64 sm:shrink-0">
                      <ui.Icon className={`w-8 h-8 shrink-0 ${ui.iconClass}`} />
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Risk Band</p>
                        <p className={`text-xl font-black leading-tight ${ui.text}`}>{bandLabel}</p>
                      </div>
                    </div>
                    <div className="flex-1 border-t sm:border-t-0 sm:border-l border-black/5 bg-white/60 px-5 py-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">What to do</p>
                      <p className={`text-base font-bold ${ui.text}`}>{bandAction}</p>
                      <ul className="mt-2 space-y-1.5">
                        {steps.map((step) => (
                          <li key={step} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${ui.accent}`} />
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Plain-language findings, not model statistics. */}
                {(concerns.length > 0 || positives.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                        Points to check
                      </p>
                      {concerns.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">
                          Nothing in this member&apos;s record stands out as a concern.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {concerns.map((f) => (
                            <li key={f.text} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${f.tone === 'concern' ? 'bg-red-500' : 'bg-gray-400'}`} />
                              {f.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border border-gray-200 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                        In the member&apos;s favour
                      </p>
                      {positives.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">
                          No particular strengths stood out in the record.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {positives.map((f) => (
                            <li key={f.text} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-member-green shrink-0" />
                              {f.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {missingSnapshot && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      This member has no share capital, savings or grocery records on file, so the
                      score is based on their loan history alone. Treat it as less certain than usual.
                    </p>
                  </div>
                )}

                {/* Handoff §4 and §7: the model routes, it never rejects, and
                    it misses about a third of trouble. Both facts belong next
                    to the recommendation, not buried in a tooltip. */}
                <p className="text-xs text-gray-500 italic">
                  {riskAssessment.never_rejects
                    || 'This score routes the application for review. It is not grounds for denial - every member retains the right to apply.'}
                  {' '}It is a guide for your judgement, not a replacement for it.
                </p>

                {/* Model internals, collapsed. For auditing the model or
                    answering "why this score" - not for the approval itself. */}
                <div className="border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRiskDetail((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-member-green transition-colors"
                  >
                    <Info className="w-3.5 h-3.5" />
                    {showRiskDetail ? 'Hide' : 'Show'} technical detail
                  </button>

                  {showRiskDetail && (
                    <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="border border-gray-200 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                          Values the model read
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                          {[
                            ['Loan Amount', features.LoanAmount == null ? '\u2014' : formatCurrency(Number(features.LoanAmount))],
                            ['Previous Loans', features.PriorLoans ?? '\u2014'],
                            ['Previously Behind', features.PriorBehind ?? '\u2014'],
                            ['Concurrent Loans', features.ConcurrentLoans ?? '\u2014'],
                            ['Share Capital (pts)', features.ShareCapital ?? '\u2014'],
                            ['Grocery (pts)', features.Groceries ?? '\u2014'],
                            ['Savings', features.Savings == null ? '\u2014' : formatCurrency(Number(features.Savings))],
                            ['Occupation Tier', features.OccTier ?? '\u2014'],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <p className="text-[10px] text-gray-400 uppercase">{label}</p>
                              <p className="font-semibold text-gray-800">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {detailDrivers.length > 0 && (
                        <div className="border border-gray-200 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                            Score drivers
                          </p>
                          <div className="space-y-2.5">
                            {detailDrivers.map((d) => {
                              const pct = maxAbs > 0 ? (Math.abs(d.contribution) / maxAbs) * 100 : 0;
                              const isUp = d.direction === 'up';
                              const isNeutral = d.direction === 'neutral';
                              const barColor = isNeutral ? 'bg-gray-300' : isUp ? 'bg-red-400' : 'bg-green-500';
                              return (
                                <div key={d.feature}>
                                  <div className="flex items-center justify-between mb-0.5 gap-2">
                                    <span className="text-xs text-gray-700 font-medium truncate">
                                      {FEATURE_LABELS[d.feature] || d.feature}
                                    </span>
                                    <span className={`text-[10px] font-bold uppercase shrink-0 ${isNeutral ? 'text-gray-400' : isUp ? 'text-red-600' : 'text-green-700'}`}>
                                      {isNeutral ? 'Neutral' : isUp ? 'Raises' : 'Lowers'}
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                                    <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${pct.toFixed(1)}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: model version + scored_at */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-400 uppercase tracking-wider">
                  {riskAssessment.scored_at && (
                    <span>Scored: {new Date(riskAssessment.scored_at).toLocaleString()}</span>
                  )}
                  {riskAssessment.model_version && (
                    <span>Model: v{riskAssessment.model_version}</span>
                  )}
                  {riskAssessment.cached && (
                    <span className="text-gray-500">(cached)</span>
                  )}
                </div>
              </div>
            );
          })()}
      </div>
```
