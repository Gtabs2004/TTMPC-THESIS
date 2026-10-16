# Time Deposit — Lifecycle Completion Plan (accrual, maturity, pre-termination)

**Status:** Planning only. No code written yet.
**Relationship to existing TD docs:** `REGANT_Time_Deposit_Tracking_and_Claude_Prompt.md` is the original spec
and Step 1/2 recon (its §13 holds ten open bookkeeper questions; its §11 is the
build checklist). `TD_HANDOFF_FOR_COPILOT.md` is the condensed handoff recording
what Steps 1–2 concluded and what Step 3 (`td_open()`, dashboard, member portal,
audit/receipts) already shipped on 2026-10-16. **This document picks up exactly
where those leave off**: placement opens, but nothing in the app can accrue
interest daily, settle at maturity, roll over, or pre-terminate. It does not
replace those two documents — it narrows in on the four lifecycle questions that
were blocking that remaining work, records today's answers, and plans the wiring
needed to act on them.

All but one of the original ten open questions (tracking doc §13: Q1 funding
source, Q4/Q5 rollover rate and timing, Q6 maturity behavior, Q7
maturity-date/timezone convention, Q8 deductions, Q9 rounding, plus TD-33's
notification requirement and the un-numbered question of what triggers
accrual at all) are answered below. Q10 (second-approval — partially covered
by D1 for pre-termination specifically, but not for a plain maturity
settlement/rollover) is the one that remains fully open, alongside Q2
(minimum placement) and Q3 (bracket basis) — see "What remains open" at the
end.

> **Note on Q7's answer (D8 below):** it is recorded as a **documented
> simulation assumption**, not a confirmed cooperative policy — the same
> distinction the pasted answer itself draws. It is safe to build and test
> against now; it still needs TTMPC's sign-off before being treated as the
> coop's actual official rule.

---

## 1. Decisions made today (2026-10-16)

| # | Question | Decision |
|---|---|---|
| D0 | Funding source (tracking doc Q1): Regular Savings transfer, cash, or both? | **Cash.** The member pays cash at the counter; the Cashier opens the TD against that cash, already in hand at the moment of opening — not a transfer out of an existing Regular Savings balance. |
| D1 | Who approves a pre-termination? | **Cashier requests → Bookkeeper approves → Cashier executes the payout.** Mirrors the ISC/loan pattern (preparer vs. approver split) rather than letting the Cashier pre-terminate unilaterally. |
| D2 | ~~Default action at maturity with no member instruction?~~ | **SUPERSEDED by D6 below (same session, this follow-up round).** Originally "auto roll-over" (`ROLL_ALL`); replaced once renewal was clarified as a staff-and-member counter transaction, not a system default. Kept here, struck through, so nothing downstream still points at the old answer. |
| D3 | Is withholding tax applied to member TD interest? | **Configurable, defaults to 0.** Not confirmed with the coop's accountant/CDA rules yet. The engine's `tax_rate` field stays wired but BOD-settable later; nothing is hardcoded to a nonzero rate now. |
| D4 | What triggers daily accrual and the maturity check? | **A scheduled backend job** (daily), not a manual button and not lazy on-page-view computation. Matches how the engine's `execute_daily_accrual_batch()` was already written — idempotent, catch-up safe, designed to be called once a day for all active contracts. **Narrowed by D6**: the job still accrues and flags `matured` automatically; it never settles or rolls over on its own. |
| D5 | Does the member get notified at maturity (tracking doc TD-33)? | **Yes — both channels: a heads-up N days before maturity, and again on the maturity date itself**, through the existing bell (`loan_notifications`, despite its name — see §3.4) and the existing email dispatch path. Not a new notification system. |
| D6 | Rollover timing (tracking doc Q5) — does maturity settle itself, or does a human have to process it? | **A human has to process it.** A matured TD stays `matured` — status-only, no money movement — until the member physically comes in and the staff (Cashier) processes the renewal or payout with them. **There is no automatic rollover.** This replaces D2. |
| D7 | Rollover rate (tracking doc Q4) — original contract rate, or the rate in effect at renewal? | **The rate for whichever term the member chooses at renewal.** The member is offered the same choice as a new placement — 180 or 365 days — and 6-month vs. 1-year already carry separately maintained rates (`deposit_interest_policy_tiers`, `TD_6M`/`TD_12M`). So the "rate to use" question collapses into "look up the current bracket rate for the term just chosen," exactly like `td_open()` already does for a brand-new placement — never the original contract's rate, and never a rate chosen independently of the term. |
| D8 | Maturity date, timezone, day-count convention, weekends/holidays (tracking doc Q7) | **Documented simulation assumption, not yet TTMPC-confirmed** — see §2.2 for the full rule set and a real conflict it surfaces with the engine's current default divisor. |
| D9 | How many days before maturity does the heads-up notification (D5) fire? | **3 days.** Resolves the "New (TD-33 lead time)" item — `td_notify_upcoming()` (§3.4) fires at `maturity_date - 3`. |
| D10 | Rounding convention for the ledger entry (tracking doc Q9) | **Always round the final computed amount to 2 decimal places (the centavo), regardless of how many decimal places the raw calculation produces** — e.g. a result of ₱1,234.567 or ₱1,234.5678 is posted as ₱1,234.57. This confirms the engine's existing `money()` helper (`ROUND_HALF_UP` to `Decimal("0.01")` in `time_deposit_engine.py`) is already the bookkeeper's actual rule — no code change needed, only the confirmation itself. |

These are implementation/process decisions, not cooperative policy, except D3,
D6, D7, and D8, which **do** touch cooperative policy and should still be
confirmed with the bookkeeper/TTMPC before being relied on for a real
(non-test) renewal, payout, or accrual total in production. D1, D4, and D5 are
safe to build against now.

> **D3 interacts with tracking-doc §13 Q8** ("withholding tax or other
> deductions") — this is the same open question, now given a safe-default
> answer so the rest of the lifecycle can be built without waiting on the
> accountant. If the coop confirms a nonzero rate, it is a BOD policy-table
> change, not a schema or code change (see §4.3).

---

## 2. What already exists and will NOT be rebuilt

From `time_deposit_engine.py` (pure functions, no DB access, already written and
presumably unit-tested against the bookkeeper's worked examples):

- `calculate_td_interest()` — bracket lookup, 180/365-day formulas. **Live**, used by `td_calculate_preview()` / the opening flow.
- `execute_placement()` — **live** via the `td_open()` RPC (Supabase, `isc`-style pattern).
- `execute_daily_accrual_batch()` — accrues every missed day up to `run_date`, skips non-`ACTIVE` contracts, stops the day before maturity. **Built, never called from anywhere.**
- `execute_maturity_settlement()` — `FULL_PAYOUT` / `ROLL_PRINCIPAL_ONLY` / `ROLL_ALL`, requires `days_accrued == term_days` first. **Built, never called.**
- `execute_pre_termination()` — step-down rate by elapsed-term ratio (0% under 25%, capped at the savings rate 25–50%, 50%/75% of contract rate beyond), admin fee, clawback of excess accrued interest/tax. **Built, never called.**

`time_deposits` / `time_deposit_ledger` / `time_deposit_status_history` tables,
RLS, audit trigger, and receipt trigger are **live** (`time_deposit_01/02/03*.sql`,
already applied per the handoff doc's checklist). The schema already has
everything the engine needs: `status` (`locked`/`matured`/`closed`),
`cycle_number` + `prior_deposit_id` for rollover chains, and an entry_type enum
on the ledger that already includes `rollover_principal` / `rollover_interest`.

**Gap this plan closes:** there is currently no RPC and no scheduled job that
calls any of the three engine functions above. `td_open()` is the only RPC that
exists.

### 2.1 D0 changes what `td_open()` must post — not just "unblocks" it

The handoff doc (line 36) describes today's `td_open()` as deliberately
non-funding: it creates the certificate and a `time_deposit_ledger` placement
row, but "without debiting `savings_ledger` or recording a cash receipt." That
was the right call while funding source was unknown — Q1 was open.

D0 resolves Q1 as **cash**, not a Regular Savings transfer. That has a concrete
consequence the engine code does not yet reflect: `execute_placement()` in
`time_deposit_engine.py` (line ~312) currently posts

```python
_line(MEMBER_SAVINGS, TIME_DEPOSIT_LIABILITY, principal, ...)
```

— a debit to `MEMBER_SAVINGS`, which is the right line *only* if the funding
source were an existing savings balance. For a cash placement the debit side
should be a cash/till account (mirroring how `Add_Savings.jsx`'s cash deposit
flow posts today — same "cash received over the counter" shape, not a transfer
between two member-owned ledger accounts). This is a one-line change to which
account `execute_placement()` debits, not a redesign, but it is a real code
change the next implementation stage needs to make — it should not be read as
"D0 means the existing `td_open()` is already correct and just needs a receipt
bolted on."

The receipt-on-open gap the handoff doc also flagged (no cash receipt issued)
should now be closed in the same stage, using the existing `receipt_issue_time_deposit()`
trigger path (`time_deposit_02_audit_receipts.sql`) — it already fires on any
`time_deposit_ledger` insert, so once `td_open()` posts a real cash-funded
placement line, the receipt follows for free, the same way `td_open()`'s
existing placement-type ledger row already does today.

### 2.2 D8 — maturity date, timezone, and day-count rules (simulation default)

Six rules, given as a documented simulation assumption pending TTMPC's
official confirmation — not yet cooperative policy, but concrete enough to
build and test against now:

1. **Timezone:** all business-date calculations use `Asia/Manila` (UTC+8).
2. **Maturity date:** derived once, at placement, from the contract's agreed
   term — `placement_date + term_days`, exactly as `time_deposits.maturity_date`
   is already computed and stored today (`time_deposit_01_schema.sql`'s
   `maturity_date date NOT NULL` + the existing CHECK `maturity_date >
   placement_date`). A contract must never be flagged `matured` before that
   stored date, in `Asia/Manila` terms.
3. **Interest day-count convention: Actual/365.** Actual elapsed days divided
   by 365, for both terms, unless TTMPC confirms otherwise.
4. **Weekends and holidays never move the maturity date.** If maturity falls
   on a weekend or holiday, the stored `maturity_date` is untouched; how staff
   actually processes a contract that matures on a non-business day is a
   cooperative-process question, not something the system decides by shifting
   the date.
5. **Scheduled processing (§3.1):** `td_accrue_due(p_run_date)` uses the
   supplied business date (in `Asia/Manila` terms) consistently for every
   contract in the batch; `td_flag_matured()` compares each contract's own
   stored `maturity_date` against that same business date — never the
   server's local/UTC date.
6. **Validation:** before this is relied on for real money, test timezone
   boundaries (a placement or accrual run near midnight UTC+8), leap years,
   and weekend/holiday maturity dates, to confirm nothing is flagged matured
   early or late.

> **A real conflict this surfaces, not yet resolved:** Actual/365 (rule 3)
> describes the **interest year** used to size each day's accrual — i.e. the
> `divisor` in `calculate_daily_accrual(principal, rate, tax_rate, divisor)`.
> That function's own default is **`divisor=360`** (`time_deposit_engine.py`
> line 193), and `TDTerms.divisor` (line 72) also defaults to 360, though it
> accepts either `360` or `365` (the function's own validation at line 163-164
> rejects anything else). The **placement preview formula** in
> `calculate_td_interest()` is a separate code path that already matches the
> bookkeeper's confirmed worked examples exactly — 180-day term:
> `principal × annual_rate ÷ 365 × 180`; 365-day term: `principal × annual_rate`
> flat (no explicit divisor at all, which is its own kind of Actual/365). **If
> daily accrual is left at its current default of 360 while the placement
> preview effectively assumes 365, the sum of 180 or 365 daily accruals will
> not equal the number the member was shown at placement** — the exact kind of
> silent reconciliation gap the ISC build spent several rounds finding and
> fixing the hard way (`ISC_DIVIDEND_PLAN.md` §22's "rule 7" discipline: payouts
> must sum to the stated total *exactly*, never approximately). **Before any
> accrual RPC (§3.1) is built, `TDTerms.divisor` must be explicitly passed as
> `365` at contract creation** (not left to default), and a test should assert
> that summing `calculate_daily_accrual()` over a full term reproduces
> `calculate_td_interest()`'s number exactly, for both 180 and 365-day
> contracts. This is a concrete pre-implementation checklist item, not a new
> open question — rule 3 already answers which divisor is correct; the gap is
> that the code doesn't yet use it by default.

---

## 3. What "wiring it up" means — three new RPCs + one scheduler entry point

Following the pattern `td_open()` already set (Postgres RPC, `SECURITY DEFINER`,
one transaction, idempotency key, bookkeeper/cashier role check inside the
function — not just hidden by the UI), three more RPCs are needed:

### 3.1 `td_accrue_due(p_run_date date DEFAULT current_date)`
- Server-side wrapper around the logic of `execute_daily_accrual_batch()`,
  reimplemented in plpgsql (the Python engine module is the reference
  implementation / what gets unit-tested; the RPC is the authoritative version
  that actually runs, matching how ISC's Python-shaped logic ended up as SQL
  functions, not FastAPI calls — §5.1 of `ISC_DIVIDEND_PLAN.md` is the precedent
  for *why*: the actor should be the system, and a single DB transaction is the
  only way to guarantee a crash mid-batch can't leave some contracts accrued and
  others not for the same day).
- Idempotent: an already-accrued day for a contract must be a no-op if called
  twice (same guarantee the engine's `last_accrual_date` check already gives in
  Python — the RPC needs the same check).
- Does **not** settle anything at maturity. It only accrues up to
  `maturity_date - 1 day`, same boundary as the engine function.
- Separately, the same job (or a second RPC, `td_flag_matured()`) transitions a
  contract's `status` from `locked` to `matured` once `maturity_date <=
  p_run_date` and every interest day has been accrued. This is a pure status
  flip — no money moves — matching the existing `matured` status already defined
  in the schema's CHECK constraint and already read by `v_time_deposit_kpis`
  (`matured_awaiting_settlement_count`).
- **Per D6, this is the job's entire reach into maturity.** It flags `matured`
  and stops. It never calls `td_settle_maturity` itself, under any default or
  grace window — that only happens when a staff member (Cashier) processes the
  member's actual choice at the counter. A matured, unprocessed contract can
  sit in `matured` indefinitely with no auto-action; that is the intended
  behavior, not a gap to fill later.

### 3.2 `td_settle_maturity(p_time_deposit_id uuid, p_mode text, p_new_term_days integer DEFAULT NULL)`
- Wraps `execute_maturity_settlement()`. `p_mode` is one of `FULL_PAYOUT` /
  `ROLL_PRINCIPAL_ONLY` / `ROLL_ALL`.
- **Staff-callable only (per D6).** There is no automatic caller. The Cashier
  serves the member at the counter, records what they chose, and calls this
  RPC — same shape as `td_open()` being Cashier-initiated. The scheduled job
  (§3.1) never calls this function.
- `p_new_term_days` (180 or 365) is **required whenever a new cycle is created**
  (`ROLL_PRINCIPAL_ONLY` / `ROLL_ALL`) — per D7, the member re-chooses the term
  at renewal exactly as they would for a new placement, and the function looks
  up that term's current bracket rate from `deposit_interest_policy_tiers`
  itself (same lookup `td_open()` already does) rather than accepting a rate
  from the caller. This removes any path for the client to supply an arbitrary
  rate, matching `td_open()`'s existing "the client previews, the database
  decides" posture.
- On `ROLL_PRINCIPAL_ONLY` / `ROLL_ALL`: must create the **new cycle** as a new
  `time_deposits` row with `prior_deposit_id` pointing at the matured one and
  `cycle_number + 1`, per the schema's existing `time_deposits_cycle_parent_chk`
  constraint — never mutate the old row's dates/terms in place. The old row's
  `status` becomes `closed` only once the new cycle is created in the same
  transaction (tracking doc §6 Option A: "Preserve the original certificate...
  Create a linked renewal/cycle record rather than overwriting"). The new
  cycle's `placement_date` is the date the Cashier processes it (per D6 —
  renewal timing is "when staff caters the member," not the original
  `maturity_date`).
- On `FULL_PAYOUT`: old row becomes `closed`, no new cycle, `p_new_term_days`
  is ignored/must be NULL.

### 3.3 `td_pre_terminate(p_time_deposit_id uuid, p_admin_fee numeric, p_reason text)` split into two steps, per D1
Two RPCs, not one, to implement the Cashier-requests / Bookkeeper-approves /
Cashier-executes split:

- **`td_request_pre_termination(p_time_deposit_id uuid, p_reason text)`** —
  Cashier-callable. Writes a request row (new table, `time_deposit_pretermination_requests`,
  status `pending`/`approved`/`rejected`/`executed`) with a quote computed via
  `quote_pre_termination()`'s logic, frozen at request time (so the member sees
  a number that does not silently drift if BOD changes the savings rate before
  approval). No money moves, no ledger row, no status change on the TD itself.
- **`td_decide_pre_termination(p_request_id uuid, p_approve boolean, p_reason text)`** —
  Bookkeeper-only (checked inside the function, same `has_portal_role()` /
  role-guard pattern as `isc_post()` and `isc_settle_posting()`). Sets the
  request to `approved` or `rejected`. Does not move money either — mirrors
  ISC's "the real guard is in the database" principle (`ISC_DIVIDEND_PLAN.md`
  §5.4): a cashier calling this directly gets rejected by the role check even
  if some UI bug exposed the button.
- **`td_execute_pre_termination(p_request_id uuid)`** — Cashier-callable, only
  succeeds if the request is `approved` and not already `executed`. Wraps
  `execute_pre_termination()`: posts the clawback + payout + admin fee lines,
  sets `time_deposits.status = 'closed'`, marks the request `executed`.

This three-step split gives segregation of duties (one role can't both request
and approve) without inventing a new permission model — it reuses the same
shape ISC already proved out for its own segregation requirement (bookkeeper
posts ISC, only Manager reverses; here, Cashier requests TD pre-termination,
only Bookkeeper approves, Cashier executes once approved).

### 3.4 Maturity notifications (D5) — reuse `loan_notifications`, don't build a new feed

The codebase already has exactly one persistent in-app notification feed:
`loan_notifications` (schema: `loan_notifications_schema.sql`). Despite the
name, nothing in the table is actually loan-specific at the schema level —
`loan_id` is "FK-by-convention" text, not a real foreign key, and
`notification_type` has no CHECK constraint restricting its values. The
renewal-override feature already relies on this: `_override_notify()`
(`main.py` ~6432) inserts into `loan_notifications` with
`notification_type="renewal_override_request"` etc. — a non-loan-status event
riding the same table. **TD maturity notifications are the same shape of
reuse**, not a new case:

- `td_flag_matured()` (§3.1), when it flips a contract to `matured`, also
  inserts a `loan_notifications` row: `recipient_role='member'`,
  `recipient_member_id` = the TD's member, `notification_type='td_matured'`,
  `redirect_url` pointing at the member's TD detail view, `loan_id=NULL`.
- A second insert point, `td_notify_upcoming()` (or folded into the same daily
  job), fires **3 days** before `maturity_date` (D9) —
  `notification_type='td_maturity_upcoming'` — satisfying tracking doc TD-33's
  "notify before maturity (e.g. 7 days)" with the cooperative's own confirmed
  lead time.
- Both call sites should reuse the existing dedup mechanism
  (`loan_notifications_dedup_unread_uniq` — a partial unique index on
  `dedup_key` for unread rows) so the scheduled job can run daily without
  spamming a duplicate "matured" notification every single day a contract sits
  unsettled, exactly how the loan workflow already prevents re-notifying on
  every retry of the same stage transition.
- **Email** goes out through the existing dispatch path
  (`dispatch_loan_email` / `loan_email_templates.py`-style service, matching
  how `/api/loans/notifications/dispatch` already works) rather than a new
  Resend integration — add two templates (`td_maturity_upcoming`,
  `td_matured`) alongside the existing loan-status templates, not a parallel
  email system.
- This is additive and needs no schema migration: no new table, and the
  existing `loan_notifications` columns already cover every field a TD
  notification needs. The only genuinely new code is the two insert call
  sites (upcoming + matured) and the two email templates.

> **Naming note, not a blocker:** `loan_notifications` / `loan_id` reusing a
> loan-shaped name for a now-cross-feature table is exactly the kind of
> naming debt this project already tolerates elsewhere (e.g. `isc`'s original
> schema file naming, ISC_DIVIDEND_PLAN.md's own candid notes on naming drift).
> Renaming the table is out of scope for this plan — it would touch every
> existing loan/renewal-override call site for no behavioral gain.

---

## 4. The scheduled job itself (D4)

### 4.1 No scheduler currently exists in this codebase
`main.py` has `BackgroundTasks` (FastAPI's per-request fire-and-forget helper,
used today only for email/notification dispatch) — **not** a recurring job
scheduler. There is no `APScheduler`, no `cron`, no `Celery beat` dependency in
`requirements.txt`, and the documented run command is just
`uvicorn --reload ...`. This is a real gap to close, not something to route
around.

### 4.2 Options (to decide before implementation, not decided by this plan)
| Option | How it would work | Trade-off |
|---|---|---|
| **Supabase `pg_cron`** | A Postgres extension schedules `SELECT td_accrue_due(); SELECT td_flag_matured();` directly inside the database, once a day. (Per D6, `td_settle_maturity` is never part of this schedule — it only runs when staff calls it.) | No new Python dependency, runs even if the FastAPI process is down; but moves "when does the job run" out of application code and into Supabase project config — needs to be documented somewhere Ops/the bookkeeper's team can find it, and it's a Supabase-project-level setting (check whether the plan's Supabase tier supports `pg_cron`). |
| **APScheduler inside FastAPI** | Add `apscheduler` to `requirements.txt`, schedule a daily job at app startup that calls the three RPCs via the same `supabase` client already used elsewhere in `main.py`. | Keeps the logic in the already-reviewed Python codebase; but only runs while the FastAPI process is up — if the dev server/host restarts or is down at the scheduled time, that day's accrual is simply caught up the next time it does run (the engine's `execute_daily_accrual_batch` is explicitly built to catch up missed days, so this is a lesser risk than it sounds, but worth stating plainly). |
| **External cron hitting a protected endpoint** | A new `POST /api/time-deposits/run-daily-job` endpoint, protected by a service-only secret/role, triggered by an OS-level or hosting-platform cron. | Works regardless of hosting choice; adds one more secret to manage and one more "is this actually running" monitoring question. |

This plan recommends **Supabase `pg_cron`** calling the RPCs directly, because
it keeps the daily job as close as possible to the data it touches (same
reasoning ISC used for doing posting via RPC instead of FastAPI — §5.1/§7 of
`ISC_DIVIDEND_PLAN.md`: atomicity and no extra network hop), and because it
removes any dependency on the FastAPI process's uptime for something that must
run every single day without fail. **This is a recommendation, not a decision**
— confirm before implementing, since it is new infrastructure for this project
and should be reviewed alongside whatever the Supabase plan tier actually
supports.

### 4.3 Rollout sequence (confirmed) — decide the mechanism, then build up to it

Rather than picking `pg_cron` and wiring it live in one step, the rollout
follows a fixed order, each step a gate on the next:

1. **Confirm the available Supabase scheduling mechanism first.** Check the
   project's enabled extensions (`pg_cron` specifically), the role/permissions
   needed to create a cron job, and any deployment-tier constraint — before
   writing a single line of scheduler-wiring code. This is the "Which Supabase
   scheduling mechanism is actually available/approved" item in §5, and it
   gates everything below it.
2. **Use `pg_cron` if it is available and approved** (§4.2's recommendation),
   scheduling `td_accrue_due()` and `td_flag_matured()` (and the two
   notification inserts, §3.4) at their defined daily/3-day intervals. If
   `pg_cron` is not available on the project's tier, fall back to the
   APScheduler or external-cron options in §4.2's table — in that order of
   preference, for the reasons already given there.
3. **Every RPC stays independently callable and testable before any cron
   entry exists.** `td_accrue_due(p_run_date)`, `td_flag_matured()`, and the
   notification inserts must each be callable by hand (SQL editor or a test
   script, same as ISC's `isc_checks/*.sql` pattern — `ISC_DIVIDEND_PLAN.md`
   §22.9's "Do not weaken the guard to make a test pass" applies equally
   here) with a specific `p_run_date`, *before* a cron schedule is attached to
   any of them. Scheduling is the last step, not an early one.
4. **Idempotency is mandatory, not optional, given a cron will eventually call
   this unattended.** A repeated run for the same `p_run_date` (cron retry,
   manual re-run, overlap) must never create a duplicate accrual day or a
   duplicate maturity flag — §3.1 already specifies this at the function
   level (reusing the engine's own `last_accrual_date` check), but it must be
   re-verified specifically under a simulated double-fire before go-live, not
   assumed correct because the single-call case was tested.
5. **A full dry run precedes enabling the live schedule.** Before `pg_cron` (or
   whichever mechanism) is actually turned on in production: verify the
   execution date resolves correctly in `Asia/Manila` terms (D8), that the
   role the job runs as has exactly the permissions it needs (and no more —
   same posture as `isc_post()`'s `SECURITY DEFINER` + internal role check,
   not a blanket service-role grant), that every run writes an
   `audit_log`/ledger trail (§4.4 below), and that a failed run is visible
   somewhere a human will actually see it, not just swallowed.

### 4.4 What the job must NOT do
- **Must never call `td_settle_maturity`, under any condition.** Per D6,
  settlement and rollover are exclusively staff-and-member counter actions.
  The job's only reach into a contract's lifecycle is accrual (§3.1) and the
  `locked → matured` status flip — nothing that moves money or creates a new
  cycle.
- Must not invent a rate or a tax rate beyond what D3/D7 already settled.
- Must not retroactively change `annual_rate` on an existing cycle's row. A new
  cycle's rate is looked up fresh at the moment staff processes the renewal;
  the just-matured cycle's own row is historical and immutable once `closed`.
- Must log what it did somewhere auditable — `audit_write('time_deposit', id,
  'post', ...)` on every accrual/settlement row it creates, exactly like
  `td_open()` already does via the `audit_trg_time_deposit_ledger()` trigger
  (which fires automatically on any `time_deposit_ledger` insert, so the job
  gets this for free as long as it posts through the ledger table rather than
  updating balances directly).

---

## 5. What remains open — do not guess these

Carried over from the tracking doc's §13, still unanswered, and newly surfaced
by this plan:

| # | Question | Why it blocks something |
|---|---|---|
| New | **Which Supabase scheduling mechanism is actually available/approved** (§4.2/§4.3 step 1). | Infrastructure decision, needs confirming before any of §3's RPCs are wired to run unattended. §4.3 gives the rollout sequence once this is answered, but does not answer it. |
| New | **TTMPC's official confirmation of D8** (§2.2) — Actual/365, `Asia/Manila`, and the weekend/holiday rule are a documented simulation default, not yet signed off. | Same caution as D3/D6/D7: safe to build and test against, not yet safe to call "the cooperative's policy" in anything presented to TTMPC as confirmed fact. |

Nothing in §1–§4 should be implemented against the scheduling mechanism/D8's
official confirmation by guessing a value beyond what is already recorded.
The RPCs in §3 and the scheduler in §4 can be **built and unit-tested**
against the engine's existing worked examples without those answers, the same
way the interest-calculation formula was build-able before Q1–Q9 were
resolved — but none of them should be pointed at production data or given a
live cron schedule until these remaining questions are settled, and even once
the mechanism is chosen, §4.3's five-step sequence (test manually → verify
idempotency → dry run) comes before flipping the schedule on.
