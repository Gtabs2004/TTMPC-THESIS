# Hardcoded Values, Stubs & WIP Audit — TTMPC REGANT

**Scope:** `TTMPC_THESIS/src/**` (React frontend + `server/` FastAPI backend + `analytics/` ML notebooks). `node_modules`, `dist`, `.venv`, and `dev-dist` were excluded (build artifacts / vendored code, not audited).

**Method:** Pattern search across the six focus categories (static UI/mock data, mocked endpoints, ML bypasses, auth bypasses, hardcoded config/secrets, WIP markers), followed by manual read-through of every hit to confirm whether it's live/dead/dangerous code before scoring severity.

---

## 1. Executive Summary

| Severity | Count | Meaning |
|---|---|---|
| 🔴 Critical | 1 | Fabricated data can reach a real financial transaction screen |
| 🟠 Moderate | 7 | Broken behavior in production, or missing feature masked as done |
| 🟡 Low | 6 | Dead code, cosmetic hardcoding, or already-safe patterns worth tightening |

**Headline finding:** the codebase is cleaner than the six-category brief anticipates — no mocked FastAPI routes, no ML bypasses, no hardcoded auth/session objects, and no hardcoded secrets were found anywhere in `src/`. Both ML endpoints (`/score-loan`, `/api/analytics/demand/forecast`) correctly raise `HTTPException(503)` when their `.pkl` files are unavailable instead of faking a prediction. The one genuinely dangerous item is a client-side mock-data fallback on the Cashier payments screen (§2 below).

---

## 2. Detailed Itemization

| File Path & Line # | Category | Description of Hardcoded Item | Required Dynamic Fix / API Integration | Severity |
|---|---|---|---|---|
| [Cashier_Payments.jsx:35-70](TTMPC_THESIS/src/Cashier/Components/Cashier_Payments.jsx#L35), used at [:496](TTMPC_THESIS/src/Cashier/Components/Cashier_Payments.jsx#L496) | 1. Static UI / Mock Data | `MOCK_LOANS` (fabricated members "Juan Dela Cruz", "Maria Santos" with fake balances) is loaded into `setLoans()` as a **fallback whenever the live fetch throws** — i.e. it can appear on a real cashier's payment-recording screen, not just in dev. | Remove the fallback entirely; on fetch failure, show an empty/error state and block payment entry until the API call succeeds. Never populate transaction-entry UI with fabricated loan records. | 🔴 Critical |
| [applicationConfirmation.py:950](TTMPC_THESIS/src/server/applicationConfirmation.py#L950) and [main.py:7457](TTMPC_THESIS/src/server/main.py#L7457) | 5. Config Hardcoding | Outbound member emails hardcode the login link as `http://localhost:5173/memberlogin`. In production this sends real members a dead link. | Introduce a `FRONTEND_BASE_URL` env var (mirroring `VITE_API_BASE_URL`'s pattern) and interpolate it into both email templates. | 🟠 Moderate |
| [Savings_Details.jsx:224,542,637](TTMPC_THESIS/src/Cashier/Components/Savings_Details.jsx#L224), [Savings-Transactions.jsx:444](TTMPC_THESIS/src/Bookkeeper/Components/Savings-Transactions.jsx#L444), [Cashier_Disbursement.jsx:815](TTMPC_THESIS/src/Cashier/Components/Cashier_Disbursement.jsx#L815) | 6. WIP Marker | 5 `TODO: PRINT-RECEIPT-OVERLAY` markers — receipt/voucher printing (deposit slip, withdrawal slip, disbursement voucher, per-entry reprint) is explicitly unimplemented across both Cashier and Bookkeeper portals. | Either implement the print overlay (likely `window.print()` + a print-only CSS view, or a PDF stamp via the existing `pdf-lib` pipeline) or explicitly scope it out of the thesis defense demo and say so. | 🟠 Moderate |
| [Grocery-Ledger.jsx:60](TTMPC_THESIS/src/Bookkeeper/Components/Grocery-Ledger.jsx#L60) | 1. Static UI / Mock Data | `_UNUSED_MOCK` object — self-labeled dead code, confirmed no references anywhere else in the file. | Delete. | 🟡 Low |
| [Bookkeeper/Grocery.jsx:34-43](TTMPC_THESIS/src/Bookkeeper/Components/Grocery.jsx#L34) | 1. Static UI / Mock Data | `MOCK_TRANSACTIONS` array — defined but never referenced; the component actually fetches live from `supabase.from("GROCERY_TRANSACTIONS")` ([:52-58](TTMPC_THESIS/src/Bookkeeper/Components/Grocery.jsx#L52)). Confirmed dead. | Delete the unused constant. | 🟡 Low |
| [Cashier_Grocery.jsx:34](TTMPC_THESIS/src/Cashier/Components/Cashier_Grocery.jsx#L34) | 1. Static UI / Mock Data | Same `MOCK_TRANSACTIONS` pattern, also confirmed unused/dead in this file. | Delete. | 🟡 Low |
| [migration/test_member_history_cleanup.sql:27](TTMPC_THESIS/src/server/migration/test_member_history_cleanup.sql#L27) | 6. WIP Marker | `target_member_id uuid := '00000000-...'::uuid; -- TODO: set me` — a placeholder UUID left in a one-off migration script. | Low risk since `migration/` scripts aren't part of runtime app (per CLAUDE.md), but rename the file or add a guard so it can't be run as-is against production by accident. | 🟡 Low |
| 45+ frontend files, e.g. [MIGS.jsx:28](TTMPC_THESIS/src/Bookkeeper/Components/MIGS.jsx#L28), [loanSubmission.js:4](TTMPC_THESIS/src/LOANFORMS/loanSubmission.js#L4) | 5. Config Hardcoding | `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL \|\| "http://127.0.0.1:8000"` repeated in 45+ components instead of a single shared config module. Not a bypass (env var takes priority), but if `VITE_API_BASE_URL` is ever missing from a production build, every one of these silently points at `localhost:8000` instead of failing the build. | Extract to one `src/config/api.js` that throws/warns at import time if the env var is unset in a production build; import that everywhere instead of repeating the fallback literal. | 🟡 Low |
| [Members_Profile.jsx:341, :350](TTMPC_THESIS/src/Member/Components/Members_Profile.jsx#L341) | 6. WIP Marker | Two empty `catch (_error) {}` blocks around `localStorage` read/write of notification prefs. Benign (quota/parse errors), but silent. | Low priority — at minimum `console.warn` so a broken localStorage state isn't invisible during debugging. | 🟡 Low |
| [Cashier_Payments.jsx](TTMPC_THESIS/src/Cashier/Components/Cashier_Payments.jsx) — same block as row 1 | 4. Auth/State (adjacent) | The mock-data fallback fires on *any* fetch error (network blip, 500, auth expiry) with a single generic toast — a cashier can't distinguish "API is down, don't trust this screen" from a transient hiccup. | Once the mock fallback above is removed, add error-type-specific messaging (401 → re-login prompt; 5xx → retry banner). | 🟠 Moderate |
| [loanComputeApi.js:4, 46-79, 291-324](TTMPC_THESIS/src/LOANFORMS/loanComputeApi.js#L291) | 1. Static UI / Mock Data + 5. Config | Module-level `backendComputeAvailable` flag flips permanently to `false` after the **first** failed call to `/api/loans/compute`, then stays that way for the rest of the browser session. Every subsequent loan computation silently reroutes to `computeLoanLocally()` — a full client-side reimplementation of interest/fee math with a hardcoded `FEE_POLICY_FALLBACKS` object used if the direct Supabase read of `loan_fee_policies` also comes back empty. A BOD fee-policy edit can diverge from what members see quoted if their session ever hit one transient backend error. | Make the fallback retry-per-call instead of session-sticky (drop the module-level flag, or reset it after N minutes / on next explicit compute), and treat `FEE_POLICY_FALLBACKS` as a last-resort-only path with visible logging when it fires so drift is detectable. | 🟠 Moderate |

Categories with **zero findings** (explicitly checked, none present):
- **Mocked API endpoints** — no FastAPI/Express route in `src/server/main.py` returns a hardcoded success/JSON stub; both scanned ML routes correctly propagate `ModelNotAvailableError`/`DemandModelNotAvailableError` as HTTP 503.
- **ML model bypasses** — no hardcoded feature vectors or static risk/forecast values found; `risk_model.py` and `demand_model.py` both fail loudly (503) rather than faking output when `.pkl` files are missing.
- **Auth/permission bypasses** — no hardcoded session/user objects, no `DEBUG`-gated auth skip, no hardcoded `role === "admin"` shortcuts found in `AuthContext.jsx` or elsewhere.
- **Hardcoded secrets** — no API keys, DB credentials, or `sk_live`/`sk_test`-style tokens found in `src/`; Supabase service-role key is correctly read from env in all three places it's used.
- **Hardcoded KPI dashboard values** — spot-checked BOD, Bookkeeper, Manager, Treasurer, and Member dashboards; every KPI card reads from `stats`/`kpis`/`summary` state populated by API or Supabase calls, not literals.

---

## 3. Action Plan (priority order for pre-defense hardening)

1. **🔴 Fix `Cashier_Payments.jsx` mock fallback first.** This is the only finding that can put fabricated financial data in front of a live user during a demo or real transaction. Replace the `MOCK_LOANS` fallback with a proper error state.
2. **🟠 Swap the hardcoded `localhost:5173` email links for an env-driven `FRONTEND_BASE_URL`.** Trivial fix, but any live-data demo that triggers a notification email will visibly break otherwise.
3. **🟠 Decide the fate of the 5 `PRINT-RECEIPT-OVERLAY` TODOs before the defense.** Either implement a minimal print view or explicitly state receipt printing is out of scope so it isn't discovered live by the panel.
4. **🟡 Delete the three dead `MOCK_TRANSACTIONS`/`_UNUSED_MOCK` blocks** (`Grocery.jsx`, `Cashier_Grocery.jsx`, `Grocery-Ledger.jsx`) — no functional risk, but they're confusing for anyone reading the code during Q&A.
5. **🟡 Consolidate the 45-file `API_BASE_URL` fallback pattern** into a single config module that fails loudly if the env var is missing from a production build, rather than silently defaulting to `127.0.0.1:8000`.
6. **🟡 Rename or guard the placeholder UUID in `migration/test_member_history_cleanup.sql`** so it can't be run unmodified.
7. **🟠 De-stickify the `loanComputeApi.js` local-fallback flag.** A single transient backend error currently locks a whole browser session onto duplicated, hardcoded-fee-fallback loan math instead of the BOD-configured `loan_fee_policies` values.

No changes were made to the codebase as part of this audit — this is a report only, per the requested deliverable.
