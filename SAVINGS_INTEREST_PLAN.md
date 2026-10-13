# Monthly Savings Interest: Plan and Shelved Code

**Status: PLAN ONLY. Not built, not applied.** (2026-10-13)

The code below was written and checked: the frontend built, lint passed and the backend routes registered. It was then **removed from the app on purpose**, because the cooperative has not confirmed how savings interest ("tubo") is actually computed. When the process is confirmed:

1. Adjust the rules in §2.
2. Restore the code from the appendices.
3. Apply the SQL on TEST, then LIVE.

**Still in the app** (not part of this shelf): the BOD **Interest Policies** page and the `deposit_interest_policies` table (`src/server/deposit_interest_policies_schema.sql`). They store the editable SAVINGS / TD_6M / TD_12M rates that this feature reads.

---

## 1. Questions to confirm with the cooperative first

| # | Question | Draft assumption used in the code |
|---|---|---|
| S1 | What is the savings interest rate? | Read from `deposit_interest_policies` (SAVINGS). Placeholder 1% per year |
| S2 | How often is interest credited? | Monthly |
| S3 | Which balance earns interest: month-end, lowest in the month, or average daily? | **Month-end balance** (easiest to change, see §2) |
| S4 | Is there a minimum balance to earn interest? | Uses `minimum_balance` from the policy; blank = none |
| S5 | Do exiting / terminated / closed members earn interest? | Exiting yes; terminated and closed no |
| S6 | Is withholding tax deducted from savings interest? | No |
| S7 | Who posts, and who may undo a posting? | Bookkeeper posts; Manager reverses, never their own posting (same rule as ISC) |
| S8 | Do standalone (organisation) accounts earn interest? | No, only `account_kind = 'member'` |
| S9 | When is interest computed, and from when do imported balances count? | Imported opening balances count only from their `posted_at` date. Months before the import show ₱0 |

## 2. Calculation rule (draft)

```
interest = round( month_end_balance × annual_rate / 100 / 12 , 2 )      -- half-up, to the centavo
month_end_balance = SUM(credits) − SUM(debits) in savings_ledger
                    with posted_at before 00:00 Asia/Manila on the 1st of the next month
```

- **Summed, not taken from the last `running_balance`**, so rows with the same timestamp can't be ordered wrongly.
- **Interest is dated when posted (after month end)**, so it never inflates the same month's balance. It counts in the following month, which is normal compounding.
- **Eligible:** all of the following must hold, or the account is listed with the reason it was excluded:
  - `account_kind = 'member'` (excludes standalone and future time-deposit accounts)
  - account `status = 'active'`
  - member not terminated or closed
  - balance > 0
  - balance ≥ minimum (if a minimum is set)
  - interest ≥ ₱0.01
- **Changing the basis (S3):** if the coop picks lowest or average balance, only the `bal` part of `savings_interest_compute()` changes.

## 3. Design decisions

| Topic | Decision |
|---|---|
| Where the logic lives | Postgres functions: `savings_interest_compute(period)`, `savings_interest_post(...)`, `savings_interest_reverse(...)`. FastAPI only checks the login, passes the verified user in, and shapes responses. Amounts never come from the browser |
| Atomic | Post and reverse are each one plpgsql function, so one transaction. Any error rolls back everything |
| Duplicate posts | A partial unique index allows one `posted` batch per month, plus an advisory lock per month for two people clicking at once |
| Rate history | `deposit_interest_policies` holds only the current rate, so the rate, minimum and policy timestamp are **copied onto the batch and each line**. A posted month never changes when the BOD edits the rate later |
| Ledger | Uses the existing `savings_ledger`. One credit per account: source `savings_interest`, reference `INT-YYYY-MM`. The existing trigger updates the balance. Balances are never written directly |
| One insert for the whole batch | All ledger rows go in with one `INSERT … SELECT`. The realtime broadcast trigger fires per statement, so this sends 1 broadcast, not about 250 |
| Receipts | References `INT-…` with these sources are not receipt-eligible (`receipt_is_savings_entry`), so no receipts are issued (verified) |
| Audit | One `audit_log` row per batch (entity `savings`, action `post`; reversal = `update`; `context.kind = 'savings_interest'`). The existing ledger audit trigger also logs each credit. Existing allowed values are reused, so no constraint change is needed |
| Reversal | A compensating debit per account (reference `INT-YYYY-MM-REV`). The batch is marked `reversed` and kept, with a reason (≥ 10 characters). If a member already withdrew the interest, the reversal is refused and the accounts are listed |
| Re-post after reversal | Allowed. The new batch gets `INT-YYYY-MM-2`, `-3`, … |
| No saved draft | The preview is computed live each time. Period statuses: Not Processed / Posted / Reversed |
| Legacy table | `Savings_Transactions.Balance` is a bigint (whole pesos), so interest centavos can't be mirrored there. `Member_Dashboard.jsx:428` still reads it in one branch, so check that before going live |

## 4. Screens

- **Bookkeeper → Savings & Capital → Savings Interest** (`/bookkeeper-savings-interest`):
  - Controls: month picker (defaults to last month), status chip, rate and minimum (from the policy), Recalculate, and **Post Interest** (enabled only after the month ends, if not posted, and with ≥ 1 eligible account).
  - Six summary tiles: eligible, excluded, to review, eligible balance, proposed interest, posted interest.
  - Table: account name with its label, membership ID, account number, month-end balance, rate, interest, and status or reason. Filters: Eligible / To review / All excluded / All, plus search.
  - The confirm dialog says the server recomputes every amount and that all accounts post together or none do.
  - A Posting History tab, with each batch's stored lines.
- **Manager → Savings Interest** (`/manager-savings-interest`): the same page with the history tab first. In a batch's details the Manager can **Reverse Posting** with a reason. This is hidden if the Manager posted the batch, and the database blocks it too.

## 5. How to rebuild

1. Answer §1 and edit §2 / Appendix A to match.
2. Save Appendix A as `src/server/savings_interest_schema.sql`, then apply it on **TEST** (after `deposit_interest_policies_schema.sql`). Check the policy row exists:
   ```sql
   SELECT product_code, annual_rate, minimum_balance FROM public.deposit_interest_policies WHERE product_code = 'SAVINGS';
   ```
3. Append Appendix B to the end of `src/server/main.py`. It uses the existing `re`, `Decimal`, `money`, `datetime/timezone/timedelta`, `_resolve_staff_role` and `_get_current_user`.
4. Save Appendix C as `src/utils/savingsInterest.js` and Appendix D as `src/Bookkeeper/Components/Savings_Interest.jsx`.
5. Add the wiring in Appendix E (routes and sidebar entries).
6. Test on TEST (§6), then LIVE only after the coop confirms the rate.

## 6. Tests to run on TEST (not yet written)

Run as a SQL script inside `BEGIN … ROLLBACK` with test accounts and back-dated ledger rows:
- **Balances:** an account with ₱10,000 at 1% gets ₱8.33. Deposits and withdrawals during the month give the right month-end balance. An entry at 23:30 Manila on the last day counts; one at 00:10 on the 1st doesn't.
- **Exclusions:** standalone, closed account, terminated member, zero balance, and below minimum are each excluded with the right reason.
- **Posting:** credits only eligible accounts, raises balances by the interest, and writes the batch, lines and an audit row.
- **Guards:**
  - posting the same month twice fails
  - posting the current month fails
  - a Manager can't post
  - a Bookkeeper can't reverse
  - the poster can't reverse their own batch
- **Rate history:** changing the policy rate after posting leaves the batch's rate unchanged.
- **Reversal:** reversal restores balances; a second reversal fails; re-posting gives `INT-YYYY-MM-2`. If the interest was already withdrawn, the reversal fails and nothing changes.
- **Concurrency:** two browser tabs posting the same month at once; exactly one succeeds.

---

## Appendix A: `src/server/savings_interest_schema.sql`

```sql
-- ============================================================================
-- Monthly Savings Interest — batches, lines, compute / post / reverse.
-- STATUS: NOT APPLIED — REQUIRES MANUAL EXECUTION (TEST first, never LIVE
--         until the cooperative confirms the real savings rate).
-- ----------------------------------------------------------------------------
-- Prerequisites, in order (all already in the repo):
--   1. savings_accounts_schema.sql        savings_accounts, savings_ledger, balance trigger
--   2. audit_log_schema.sql + audit_log_cashier_triggers.sql   (entity 'savings', action 'post')
--   3. account_management_part_b.sql      member.member_status
--   4. deposit_interest_policies_schema.sql   the SAVINGS rate row
--   5. THIS FILE
-- Verify step 4 first:
--   SELECT product_code, annual_rate, crediting_frequency, minimum_balance, updated_at
--   FROM public.deposit_interest_policies WHERE product_code = 'SAVINGS';
--   -- expect exactly 1 row
--
-- Rule implemented (provisional — see SAVINGS_INTEREST_PLAN.md §1–2 at the repo root;
-- final report; change only savings_interest_compute() if the coop decides
-- otherwise):
--   interest = round( month_end_balance * annual_rate / 100 / 12 , 2 )   (half-up)
--   month_end_balance = SUM(credits) - SUM(debits) in savings_ledger with
--     posted_at before 00:00 Asia/Manila on the 1st of the next month.
--     Summed, not "last running_balance", so same-timestamp rows can't be
--     ordered wrongly. Interest posted for a month is dated when posted (after
--     month end), so it never counts toward that same month's balance.
--   Eligible: account_kind = 'member', account status 'active', member not
--     terminated/closed, balance > 0, balance >= SAVINGS.minimum_balance (if
--     set), and interest >= ₱0.01. Everything else is listed with a reason.
--
-- Rate history: deposit_interest_policies keeps only the current rate, so the
-- rate, minimum and policy timestamp are COPIED onto each batch and line when
-- posted. A posted month never changes when the BOD edits the rate later. An
-- unposted month uses the rate in force at posting time.
--
-- Safety:
--   * Post and reverse are single plpgsql functions = one transaction each. Any
--     error (e.g. insufficient funds on a reversal) rolls back everything.
--   * One 'posted' batch per month: partial unique index + advisory lock.
--   * A reversed month can be posted again; the new batch gets INT-YYYY-MM-2, -3...
--   * Ledger rows go in with ONE INSERT ... SELECT, so the existing balance
--     trigger runs per row but the realtime broadcast fires once per batch.
--   * References INT-... with source savings_interest(_reversal) are not
--     receipt-eligible (receipt_is_savings_entry), so no receipts are issued.
--   * Functions are service-role only: FastAPI checks the JWT, then passes the
--     verified actor in. The functions re-check the actor's role themselves.
--
-- Rollback (only if no batch has been posted; posted rows are financial history):
--   DROP FUNCTION IF EXISTS public.savings_interest_reverse(uuid, uuid, text, text);
--   DROP FUNCTION IF EXISTS public.savings_interest_post(date, uuid, text);
--   DROP FUNCTION IF EXISTS public.savings_interest_compute(date);
--   DROP TABLE IF EXISTS public.savings_interest_lines;
--   DROP TABLE IF EXISTS public.savings_interest_batches;
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

-- 1. Batches: one row per posting attempt that succeeded. --------------------
CREATE TABLE IF NOT EXISTS public.savings_interest_batches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         text NOT NULL UNIQUE,              -- INT-2026-10, INT-2026-10-2 after a reversal
    period_month      date NOT NULL CHECK (extract(day FROM period_month) = 1),
    status            text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
    annual_rate       numeric(7, 4) NOT NULL,             -- snapshot, whole % p.a.
    minimum_balance   numeric(14, 2),                     -- snapshot, NULL = none
    policy_updated_at timestamptz,                        -- which policy version was used
    account_count     integer NOT NULL,
    total_balance     numeric(16, 2) NOT NULL,
    total_interest    numeric(14, 2) NOT NULL,
    posted_by         uuid NOT NULL,
    posted_by_email   text,
    posted_at         timestamptz NOT NULL DEFAULT now(),
    reversed_by       uuid,
    reversed_by_email text,
    reversed_at       timestamptz,
    reversal_reason   text,
    CONSTRAINT savings_interest_reversal_fields_chk CHECK (
        (status = 'posted'   AND reversed_at IS NULL)
     OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL)
    )
);

-- The duplicate-posting guard: at most one live (posted) batch per month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_savings_interest_one_posted_per_month
    ON public.savings_interest_batches (period_month)
    WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_savings_interest_batches_period
    ON public.savings_interest_batches (period_month DESC, posted_at DESC);

COMMENT ON TABLE public.savings_interest_batches IS
    'Monthly savings interest postings. Never deleted; a reversal flips status and posts compensating debits.';

-- 2. Lines: one row per credited account, with the calculation behind it. ----
CREATE TABLE IF NOT EXISTS public.savings_interest_lines (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id           uuid NOT NULL REFERENCES public.savings_interest_batches(id) ON DELETE RESTRICT,
    account_number     text NOT NULL REFERENCES public.savings_accounts(account_number) ON DELETE RESTRICT,
    account_name       text NOT NULL,                     -- snapshot (keeps labels like "(Gero)")
    member_id          uuid,
    month_end_balance  numeric(14, 2) NOT NULL,
    annual_rate        numeric(7, 4) NOT NULL,
    interest           numeric(14, 2) NOT NULL CHECK (interest > 0),
    ledger_id          uuid NOT NULL REFERENCES public.savings_ledger(id),
    reversal_ledger_id uuid REFERENCES public.savings_ledger(id),
    UNIQUE (batch_id, account_number)
);

CREATE INDEX IF NOT EXISTS idx_savings_interest_lines_account
    ON public.savings_interest_lines (account_number);

-- RLS on, no client policies: every read/write goes through FastAPI (service role).
ALTER TABLE public.savings_interest_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_interest_lines   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.savings_interest_batches FROM anon, authenticated;
REVOKE ALL ON public.savings_interest_lines   FROM anon, authenticated;
GRANT ALL ON public.savings_interest_batches TO service_role;
GRANT ALL ON public.savings_interest_lines   TO service_role;


-- 3. Compute: the preview AND the posting both use this. Read-only. ----------
CREATE OR REPLACE FUNCTION public.savings_interest_compute(p_period date)
RETURNS TABLE (
    account_number    text,
    account_name      text,
    member_id         uuid,
    membership_id     text,
    account_kind      text,
    account_status    text,
    member_status     text,
    month_end_balance numeric,
    annual_rate       numeric,
    minimum_balance   numeric,
    interest          numeric,
    eligible          boolean,
    reason            text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate    numeric;
    v_min     numeric;
    v_cutoff  timestamptz;
BEGIN
    IF p_period IS NULL OR extract(day FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'Period must be the first day of a month (got %).', p_period;
    END IF;

    SELECT p.annual_rate, p.minimum_balance INTO v_rate, v_min
    FROM public.deposit_interest_policies p
    WHERE p.product_code = 'SAVINGS';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No SAVINGS row in deposit_interest_policies. Apply deposit_interest_policies_schema.sql first.';
    END IF;
    IF v_rate IS NULL OR v_rate < 0 OR v_rate >= 100 THEN
        RAISE EXCEPTION 'SAVINGS interest rate % is invalid.', v_rate;
    END IF;

    -- 00:00 Manila time on the 1st of the following month.
    v_cutoff := ((p_period + interval '1 month')::timestamp) AT TIME ZONE 'Asia/Manila';

    RETURN QUERY
    WITH bal AS (
        SELECT l.account_number AS acct,
               coalesce(sum(CASE WHEN l.entry_type = 'credit' THEN l.amount ELSE -l.amount END), 0) AS b
        FROM public.savings_ledger l
        WHERE l.posted_at < v_cutoff
        GROUP BY l.account_number
    ),
    base AS (
        SELECT sa.account_number AS acct, sa.account_name AS aname, sa.member_id AS mid,
               m.membership_id::text AS mship, sa.account_kind AS kind, sa.status AS astatus,
               lower(coalesce(m.member_status, '')) AS mstatus,
               coalesce(bal.b, 0)::numeric(14, 2) AS meb,
               round(coalesce(bal.b, 0) * v_rate / 100 / 12, 2) AS calc
        FROM public.savings_accounts sa
        LEFT JOIN public.member m ON m.id = sa.member_id
        LEFT JOIN bal ON bal.acct = sa.account_number
    ),
    judged AS (
        SELECT base.*,
               CASE
                 WHEN base.kind <> 'member'   THEN 'Not a regular member savings account (' || base.kind || ')'
                 WHEN base.astatus <> 'active' THEN 'Account is ' || base.astatus
                 WHEN base.mstatus IN ('terminated', 'closed') THEN 'Member is ' || base.mstatus
                 WHEN base.meb <= 0           THEN 'No balance at month end'
                 WHEN v_min IS NOT NULL AND base.meb < v_min
                                              THEN 'Below minimum balance of ₱' || to_char(v_min, 'FM999,999,990.00')
                 WHEN base.calc < 0.01        THEN 'Interest is below ₱0.01'
               END AS why
        FROM base
    )
    SELECT j.acct, j.aname, j.mid, j.mship, j.kind, j.astatus, nullif(j.mstatus, ''),
           j.meb, v_rate, v_min,
           CASE WHEN j.why IS NULL THEN j.calc ELSE 0::numeric END,
           j.why IS NULL,
           j.why
    FROM judged j
    ORDER BY (j.why IS NULL) DESC, j.aname, j.acct;
END;
$$;


-- 4. Post: compute + write batch, lines, ledger credits, audit. Atomic. -------
CREATE OR REPLACE FUNCTION public.savings_interest_post(
    p_period      date,
    p_actor       uuid,
    p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role      text;
    v_cutoff    timestamptz;
    v_rate      numeric;
    v_min       numeric;
    v_policy_at timestamptz;
    v_prior     integer;
    v_ref       text;
    v_batch_id  uuid;
    v_count     integer;
    v_total_bal numeric;
    v_total_int numeric;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'Actor is required.';
    END IF;
    SELECT lower(coalesce(ma.role, '')) INTO v_role
    FROM public.member_account ma WHERE ma.auth_user_id = p_actor LIMIT 1;
    IF coalesce(v_role, '') <> 'bookkeeper' THEN
        RAISE EXCEPTION 'Only the Bookkeeper can post savings interest.';
    END IF;

    IF p_period IS NULL OR extract(day FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'Period must be the first day of a month (got %).', p_period;
    END IF;
    v_cutoff := ((p_period + interval '1 month')::timestamp) AT TIME ZONE 'Asia/Manila';
    IF now() < v_cutoff THEN
        RAISE EXCEPTION '% has not ended yet; interest can only be posted after month end.', to_char(p_period, 'FMMonth YYYY');
    END IF;

    -- Serialise posts for the same month (second caller waits, then sees the batch).
    PERFORM pg_advisory_xact_lock(hashtext('savings_interest:' || p_period::text));

    IF EXISTS (SELECT 1 FROM public.savings_interest_batches b
               WHERE b.period_month = p_period AND b.status = 'posted') THEN
        RAISE EXCEPTION 'Interest for % is already posted. Reverse it first to post again.', to_char(p_period, 'FMMonth YYYY');
    END IF;

    SELECT p.annual_rate, p.minimum_balance, p.updated_at INTO v_rate, v_min, v_policy_at
    FROM public.deposit_interest_policies p WHERE p.product_code = 'SAVINGS';

    DROP TABLE IF EXISTS _si_lines;  -- a reverse+repost in one transaction (tests) reuses the name
    CREATE TEMP TABLE _si_lines ON COMMIT DROP AS
    SELECT c.account_number, c.account_name, c.member_id, c.month_end_balance, c.annual_rate, c.interest
    FROM public.savings_interest_compute(p_period) c
    WHERE c.eligible;

    SELECT count(*), coalesce(sum(month_end_balance), 0), coalesce(sum(interest), 0)
    INTO v_count, v_total_bal, v_total_int FROM _si_lines;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'No eligible accounts for %; nothing to post.', to_char(p_period, 'FMMonth YYYY');
    END IF;

    SELECT count(*) INTO v_prior FROM public.savings_interest_batches b WHERE b.period_month = p_period;
    v_ref := 'INT-' || to_char(p_period, 'YYYY-MM') || CASE WHEN v_prior > 0 THEN '-' || (v_prior + 1) ELSE '' END;

    INSERT INTO public.savings_interest_batches
        (reference, period_month, status, annual_rate, minimum_balance, policy_updated_at,
         account_count, total_balance, total_interest, posted_by, posted_by_email)
    VALUES
        (v_ref, p_period, 'posted', v_rate, v_min, v_policy_at,
         v_count, v_total_bal, v_total_int, p_actor, p_actor_email)
    RETURNING id INTO v_batch_id;

    -- One statement: balance trigger runs per row, realtime broadcast once.
    WITH ins AS (
        INSERT INTO public.savings_ledger
            (account_number, entry_type, amount, running_balance, reference, source, remarks, posted_by, recorded_by)
        SELECT t.account_number, 'credit', t.interest, 0, v_ref, 'savings_interest',
               'Savings interest for ' || to_char(p_period, 'FMMonth YYYY') || ' at '
                 || to_char(t.annual_rate, 'FM990.0099') || '% p.a. on '
                 || to_char(t.month_end_balance, 'FM999,999,990.00'),
               'bookkeeper', p_actor
        FROM _si_lines t
        RETURNING id, account_number
    )
    INSERT INTO public.savings_interest_lines
        (batch_id, account_number, account_name, member_id, month_end_balance, annual_rate, interest, ledger_id)
    SELECT v_batch_id, t.account_number, t.account_name, t.member_id, t.month_end_balance, t.annual_rate, t.interest, ins.id
    FROM ins JOIN _si_lines t ON t.account_number = ins.account_number;

    INSERT INTO public.audit_log
        (actor_user_id, actor_role, actor_email, entity_type, entity_id, action, before, after, context)
    VALUES
        (p_actor, 'bookkeeper', p_actor_email, 'savings', v_ref, 'post', NULL,
         jsonb_build_object('status', 'posted', 'accounts', v_count,
                            'total_interest', v_total_int, 'annual_rate', v_rate),
         jsonb_build_object('kind', 'savings_interest', 'batch_id', v_batch_id,
                            'period', to_char(p_period, 'YYYY-MM'), 'reference', v_ref,
                            'minimum_balance', v_min, 'total_balance', v_total_bal));

    RETURN jsonb_build_object(
        'batch_id', v_batch_id, 'reference', v_ref, 'period', to_char(p_period, 'YYYY-MM'),
        'account_count', v_count, 'total_balance', v_total_bal, 'total_interest', v_total_int,
        'annual_rate', v_rate
    );
END;
$$;


-- 5. Reverse: compensating debits, batch -> reversed. Manager only, never the
--    poster (same segregation of duties as ISC reversal). Atomic.
CREATE OR REPLACE FUNCTION public.savings_interest_reverse(
    p_batch_id    uuid,
    p_actor       uuid,
    p_actor_email text,
    p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role     text;
    b          public.savings_interest_batches%ROWTYPE;
    v_short    text;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'Actor is required.';
    END IF;
    SELECT lower(coalesce(ma.role, '')) INTO v_role
    FROM public.member_account ma WHERE ma.auth_user_id = p_actor LIMIT 1;
    IF coalesce(v_role, '') <> 'manager' THEN
        RAISE EXCEPTION 'Only the Manager can reverse a savings interest posting.';
    END IF;
    IF length(trim(coalesce(p_reason, ''))) < 10 THEN
        RAISE EXCEPTION 'Give a reason of at least 10 characters.';
    END IF;

    SELECT * INTO b FROM public.savings_interest_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch % not found.', p_batch_id;
    END IF;
    IF b.status <> 'posted' THEN
        RAISE EXCEPTION 'Batch % is already %.', b.reference, b.status;
    END IF;
    IF b.posted_by = p_actor THEN
        RAISE EXCEPTION 'You posted this batch, so you cannot reverse it.';
    END IF;

    -- Friendly pre-check; the ledger trigger would also block the overdraft.
    SELECT string_agg(l.account_number || ' (' || sa.account_name || ')', ', ') INTO v_short
    FROM public.savings_interest_lines l
    JOIN public.savings_accounts sa ON sa.account_number = l.account_number
    WHERE l.batch_id = b.id AND sa.balance < l.interest;
    IF v_short IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot reverse %: these accounts no longer hold the interest amount: %', b.reference, v_short;
    END IF;

    WITH ins AS (
        INSERT INTO public.savings_ledger
            (account_number, entry_type, amount, running_balance, reference, source, remarks, posted_by, recorded_by)
        SELECT l.account_number, 'debit', l.interest, 0, b.reference || '-REV', 'savings_interest_reversal',
               'Reversal of ' || b.reference || ': ' || trim(p_reason), 'manager', p_actor
        FROM public.savings_interest_lines l
        WHERE l.batch_id = b.id
        RETURNING id, account_number
    )
    UPDATE public.savings_interest_lines l
       SET reversal_ledger_id = ins.id
      FROM ins
     WHERE l.batch_id = b.id AND l.account_number = ins.account_number;

    UPDATE public.savings_interest_batches
       SET status = 'reversed', reversed_by = p_actor, reversed_by_email = p_actor_email,
           reversed_at = now(), reversal_reason = trim(p_reason)
     WHERE id = b.id;

    INSERT INTO public.audit_log
        (actor_user_id, actor_role, actor_email, entity_type, entity_id, action, before, after, context)
    VALUES
        (p_actor, 'manager', p_actor_email, 'savings', b.reference, 'update',
         jsonb_build_object('status', 'posted'),
         jsonb_build_object('status', 'reversed', 'reason', trim(p_reason)),
         jsonb_build_object('kind', 'savings_interest', 'batch_id', b.id,
                            'period', to_char(b.period_month, 'YYYY-MM'), 'reference', b.reference,
                            'accounts', b.account_count, 'total_interest', b.total_interest));

    RETURN jsonb_build_object('batch_id', b.id, 'reference', b.reference, 'status', 'reversed',
                              'account_count', b.account_count, 'total_interest', b.total_interest);
END;
$$;

-- Service role only. FastAPI verifies the JWT and passes the actor in.
REVOKE EXECUTE ON FUNCTION public.savings_interest_compute(date)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.savings_interest_post(date, uuid, text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.savings_interest_reverse(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.savings_interest_compute(date)               TO service_role;
GRANT  EXECUTE ON FUNCTION public.savings_interest_post(date, uuid, text)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.savings_interest_reverse(uuid, uuid, text, text) TO service_role;

COMMIT;
```

## Appendix B: append to the end of `src/server/main.py`

```python


# =============================================================================
# Monthly Savings Interest
# -----------------------------------------------------------------------------
# All money logic lives in Postgres (savings_interest_schema.sql):
#   savings_interest_compute(period)  -> per-account month-end balance, interest, eligibility
#   savings_interest_post(...)        -> batch + lines + ledger credits + audit, one transaction
#   savings_interest_reverse(...)     -> compensating debits, batch -> reversed, one transaction
# These endpoints only verify the caller (JWT -> member_account.role), pass the
# verified actor in, and shape the response. Amounts never come from the client.
# Bookkeeper previews/posts; Manager reverses (never their own posting).
# =============================================================================

_SAVINGS_INTEREST_PERIOD_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
_SAVINGS_INTEREST_BATCH_COLUMNS = (
    "id,reference,period_month,status,annual_rate,minimum_balance,policy_updated_at,"
    "account_count,total_balance,total_interest,posted_by,posted_by_email,posted_at,"
    "reversed_by,reversed_by_email,reversed_at,reversal_reason"
)
_MANILA_OFFSET = timedelta(hours=8)


class SavingsInterestPostRequest(BaseModel):
    period: str = Field(..., description="Accounting month, YYYY-MM")


class SavingsInterestReverseRequest(BaseModel):
    reason: str = Field(..., min_length=10, max_length=1000)


def _savings_interest_period(value: str) -> str:
    """'2026-10' -> '2026-10-01' (the first day the SQL functions expect)."""
    match = _SAVINGS_INTEREST_PERIOD_RE.match(str(value or "").strip())
    if not match:
        raise HTTPException(status_code=400, detail="Period must be in YYYY-MM format.")
    return f"{match.group(1)}-{match.group(2)}-01"


def _savings_interest_role(current_user: dict, allowed: set[str]) -> str:
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not initialized.")
    role = (_resolve_staff_role(current_user["id"], current_user.get("email") or "") or "").lower()
    if role not in allowed:
        raise HTTPException(status_code=403, detail="You do not have access to savings interest processing.")
    return role


def _savings_interest_db_error(exc: Exception) -> HTTPException:
    """Surface the RAISE EXCEPTION text from the SQL functions as a 400."""
    message = getattr(exc, "message", None) or (exc.args[0] if exc.args else None) or str(exc)
    if isinstance(message, dict):
        message = message.get("message") or str(message)
    text = str(message)
    if "savings_interest" in text and ("does not exist" in text or "Could not find" in text):
        text = "Savings interest tables are not installed. Apply savings_interest_schema.sql first."
    return HTTPException(status_code=400, detail=text)


@app.get("/api/savings-interest/preview")
def savings_interest_preview(period: str, current_user: dict = _Depends(_get_current_user)):
    """Live calculation for a month plus that month's batches. Writes nothing."""
    _savings_interest_role(current_user, {"bookkeeper", "manager"})
    period_date = _savings_interest_period(period)

    try:
        rows = supabase.rpc("savings_interest_compute", {"p_period": period_date}).execute().data or []
        batches = (
            supabase.table("savings_interest_batches")
            .select(_SAVINGS_INTEREST_BATCH_COLUMNS)
            .eq("period_month", period_date)
            .order("posted_at", desc=True)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        raise _savings_interest_db_error(exc)

    posted = next((b for b in batches if b.get("status") == "posted"), None)
    period_status = "posted" if posted else ("reversed" if batches else "not_processed")

    eligible = [r for r in rows if r.get("eligible")]
    # Exceptions: regular member accounts left out for a reason worth checking
    # (closed account, terminated member, below minimum) — not a plain zero balance.
    exceptions = [
        r for r in rows
        if r.get("account_kind") == "member" and not r.get("eligible")
        and r.get("reason") != "No balance at month end"
    ]
    first = rows[0] if rows else {}
    now_manila = datetime.now(timezone.utc) + _MANILA_OFFSET
    month_ended = (int(period_date[:4]), int(period_date[5:7])) < (now_manila.year, now_manila.month)

    def total(key: str) -> str:
        return str(money(sum((Decimal(str(r[key])) for r in eligible), Decimal("0"))))

    return {
        "success": True,
        "period": period_date[:7],
        "period_status": period_status,
        "month_ended": month_ended,
        "policy": {
            "annual_rate": first.get("annual_rate"),
            "minimum_balance": first.get("minimum_balance"),
        },
        "summary": {
            "eligible_count": len(eligible),
            "excluded_count": len(rows) - len(eligible),
            "exception_count": len(exceptions),
            "total_eligible_balance": total("month_end_balance"),
            "total_proposed_interest": total("interest"),
            "total_posted_interest": posted.get("total_interest") if posted else None,
        },
        "batches": batches,
        "rows": rows,
    }


@app.post("/api/savings-interest/post")
def savings_interest_post(body: SavingsInterestPostRequest, current_user: dict = _Depends(_get_current_user)):
    """Post a month. The SQL function recomputes everything; the client sends only the period."""
    _savings_interest_role(current_user, {"bookkeeper"})
    period_date = _savings_interest_period(body.period)
    try:
        result = supabase.rpc("savings_interest_post", {
            "p_period": period_date,
            "p_actor": current_user["id"],
            "p_actor_email": current_user.get("email"),
        }).execute().data
    except Exception as exc:  # noqa: BLE001
        raise _savings_interest_db_error(exc)
    return {"success": True, "data": result}


@app.get("/api/savings-interest/batches")
def savings_interest_batches(current_user: dict = _Depends(_get_current_user)):
    """Every posting ever made (posted and reversed), newest first."""
    _savings_interest_role(current_user, {"bookkeeper", "manager"})
    try:
        rows = (
            supabase.table("savings_interest_batches")
            .select(_SAVINGS_INTEREST_BATCH_COLUMNS)
            .order("period_month", desc=True)
            .order("posted_at", desc=True)
            .limit(200)
            .execute()
        ).data or []
    except Exception as exc:  # noqa: BLE001
        raise _savings_interest_db_error(exc)
    return {"success": True, "data": rows}


@app.get("/api/savings-interest/batches/{batch_id}")
def savings_interest_batch_detail(batch_id: str, current_user: dict = _Depends(_get_current_user)):
    """One batch with its stored per-account calculation (the snapshot, not a recompute)."""
    _savings_interest_role(current_user, {"bookkeeper", "manager"})
    try:
        batch = (
            supabase.table("savings_interest_batches")
            .select(_SAVINGS_INTEREST_BATCH_COLUMNS)
            .eq("id", batch_id)
            .limit(1)
            .execute()
        ).data or []
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found.")
        lines = (
            supabase.table("savings_interest_lines")
            .select("account_number,account_name,member_id,month_end_balance,annual_rate,interest,ledger_id,reversal_ledger_id")
            .eq("batch_id", batch_id)
            .order("account_name")
            .execute()
        ).data or []
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _savings_interest_db_error(exc)
    return {"success": True, "data": {"batch": batch[0], "lines": lines}}


@app.post("/api/savings-interest/batches/{batch_id}/reverse")
def savings_interest_reverse(
    batch_id: str,
    body: SavingsInterestReverseRequest,
    current_user: dict = _Depends(_get_current_user),
):
    """Manager-only. Posts compensating debits; the original batch and lines are kept."""
    _savings_interest_role(current_user, {"manager"})
    try:
        result = supabase.rpc("savings_interest_reverse", {
            "p_batch_id": batch_id,
            "p_actor": current_user["id"],
            "p_actor_email": current_user.get("email"),
            "p_reason": body.reason.strip(),
        }).execute().data
    except Exception as exc:  # noqa: BLE001
        raise _savings_interest_db_error(exc)
    return {"success": True, "data": result}
```

## Appendix C: `src/utils/savingsInterest.js`

```js
import { authHeaders } from "./authHeaders";
import { apiErrorMessage } from "./apiError";

// Client for the Monthly Savings Interest endpoints (see the "Monthly Savings
// Interest" section of src/server/main.py). The backend recomputes every
// amount in Postgres; the client only ever sends a period or a reason.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json", ...(await authHeaders()) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(apiErrorMessage(payload, `Request failed (${response.status}).`));
  }
  return payload;
}

// period: "YYYY-MM"
export const fetchSavingsInterestPreview = (period) =>
  request(`/api/savings-interest/preview?period=${encodeURIComponent(period)}`);

export const postSavingsInterest = async (period) =>
  (await request("/api/savings-interest/post", { method: "POST", body: { period } })).data;

export const fetchSavingsInterestBatches = async () =>
  (await request("/api/savings-interest/batches")).data || [];

export const fetchSavingsInterestBatch = async (batchId) =>
  (await request(`/api/savings-interest/batches/${encodeURIComponent(batchId)}`)).data;

export const reverseSavingsInterestBatch = async (batchId, reason) =>
  (await request(`/api/savings-interest/batches/${encodeURIComponent(batchId)}/reverse`, {
    method: "POST",
    body: { reason },
  })).data;
```

## Appendix D: `src/Bookkeeper/Components/Savings_Interest.jsx`

```jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, X, AlertCircle, CheckCircle2, Search, Undo2, Send, Eye } from "lucide-react";
import StaffSidebar from "../../components/StaffSidebar";
import { bookkeeperNav } from "../../components/StaffSidebar/configs/bookkeeper";
import { managerNav } from "../../components/StaffSidebar/configs/manager";
import StaffTopbar from "../../components/StaffTopbar";
import LoanNotificationBell from "../../components/LoanNotificationBell";
import Pagination from "../../components/Pagination";
import { useNotification } from "../../contex/NotificationContext";
import { supabase } from "../../supabaseClient";
import {
  fetchSavingsInterestPreview,
  postSavingsInterest,
  fetchSavingsInterestBatches,
  fetchSavingsInterestBatch,
  reverseSavingsInterestBatch,
} from "../../utils/savingsInterest";

/*
  Monthly Savings Interest
  ------------------------
  Bookkeeper: pick a month, review the calculation, post it.
  Manager:    review postings and reverse one (never their own) with a reason.
  Every amount is computed in Postgres (savings_interest_compute); the page only
  sends the month. The preview never touches balances.
*/

const PAGE_SIZE = 15;

const peso = (v) =>
  v === null || v === undefined || v === ""
    ? "—"
    : `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("en-PH", { maximumFractionDigits: 4 })}%`);

const monthLabel = (period) => {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Default to last month: the current month can't be posted until it ends.
const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const PERIOD_STATUS = {
  not_processed: { label: "Not Processed", cls: "bg-gray-100 text-gray-700" },
  posted: { label: "Posted", cls: "bg-green-100 text-green-700" },
  reversed: { label: "Reversed", cls: "bg-amber-100 text-amber-800" },
};

const BATCH_STATUS = {
  posted: "bg-green-100 text-green-700",
  reversed: "bg-amber-100 text-amber-800",
};

const Tile = ({ label, value, hint, tone = "text-gray-900" }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
    <p className={`mt-1 text-xl font-bold font-mono ${tone}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
);

const Modal = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div
      className={`w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

const SavingsInterest = ({ portal = "Bookkeeper" }) => {
  const isManager = portal === "Manager";
  const { addNotification } = useNotification();

  const [tab, setTab] = useState(isManager ? "history" : "calculation");
  const [period, setPeriod] = useState(lastMonth());
  const [preview, setPreview] = useState(null);
  const [postedLines, setPostedLines] = useState({}); // account_number -> line, for a posted month
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [filter, setFilter] = useState("eligible");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState("");
  const [detail, setDetail] = useState(null); // { batch, lines }
  const [detailLoading, setDetailLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState("");
  const [myUserId, setMyUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyUserId(data?.session?.user?.id || null));
  }, []);

  const loadPreview = useCallback(async (p) => {
    setLoading(true);
    setLoadError("");
    setPostedLines({});
    try {
      const result = await fetchSavingsInterestPreview(p);
      setPreview(result);
      const posted = (result.batches || []).find((b) => b.status === "posted");
      if (posted) {
        const d = await fetchSavingsInterestBatch(posted.id);
        const map = {};
        (d?.lines || []).forEach((l) => { map[l.account_number] = l; });
        setPostedLines(map);
      }
    } catch (err) {
      setPreview(null);
      setLoadError(err?.message || "Unable to calculate interest for this month.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    setBatchesError("");
    try {
      setBatches(await fetchSavingsInterestBatches());
    } catch (err) {
      setBatches([]);
      setBatchesError(err?.message || "Unable to load posting history.");
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "calculation" && period) loadPreview(period);
  }, [tab, period, loadPreview]);

  useEffect(() => {
    if (tab === "history") loadBatches();
  }, [tab, loadBatches]);

  useEffect(() => { setPage(1); }, [filter, search, period]);

  const rows = useMemo(() => {
    const all = preview?.rows || [];
    const needle = search.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === "eligible" && !r.eligible) return false;
      if (filter === "excluded" && r.eligible) return false;
      if (filter === "exceptions" && (r.eligible || r.account_kind !== "member" || r.reason === "No balance at month end")) return false;
      if (!needle) return true;
      return [r.account_name, r.account_number, r.membership_id].some((v) => String(v || "").toLowerCase().includes(needle));
    });
  }, [preview, filter, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const status = preview?.period_status || "not_processed";
  const summary = preview?.summary || {};
  const canPost =
    !isManager && preview && status !== "posted" && preview.month_ended && Number(summary.eligible_count) > 0;

  const handlePost = async () => {
    setPosting(true);
    setPostError("");
    try {
      const result = await postSavingsInterest(period);
      addNotification(
        `Posted ${result?.reference}: ${peso(result?.total_interest)} to ${result?.account_count} accounts.`,
        "success",
      );
      setConfirmOpen(false);
      await loadPreview(period);
    } catch (err) {
      setPostError(err?.message || "Posting failed. Nothing was posted.");
    } finally {
      setPosting(false);
    }
  };

  const openBatch = async (batchId) => {
    setDetail(null);
    setDetailLoading(true);
    setReason("");
    setReverseError("");
    try {
      setDetail(await fetchSavingsInterestBatch(batchId));
    } catch (err) {
      addNotification(err?.message || "Unable to load batch.", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReverse = async () => {
    if (!detail?.batch) return;
    if (reason.trim().length < 10) {
      setReverseError("Give a reason of at least 10 characters.");
      return;
    }
    setReversing(true);
    setReverseError("");
    try {
      await reverseSavingsInterestBatch(detail.batch.id, reason.trim());
      addNotification(`Reversed ${detail.batch.reference}. Balances restored.`, "success");
      setDetail(null);
      await loadBatches();
    } catch (err) {
      setReverseError(err?.message || "Reversal failed. Nothing was changed.");
    } finally {
      setReversing(false);
    }
  };

  const statusChip = PERIOD_STATUS[status] || PERIOD_STATUS.not_processed;
  const inputCls = "border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <StaffSidebar portal={portal} items={isManager ? managerNav : bookkeeperNav} />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <StaffTopbar portal={portal} notifications={<LoanNotificationBell role={isManager ? "manager" : "bookkeeper"} />} />

        <main className="animate-page-in p-8">
          <div className="mb-6">
            <h1 className="font-bold text-2xl text-gray-800">Monthly Savings Interest</h1>
            <p className="text-sm text-gray-500 mt-1">
              {isManager
                ? "Review posted savings interest and reverse a posting if it was wrong. You cannot reverse a posting you made yourself."
                : "Pick a month, review each account's interest, then post. Interest is calculated on the month-end balance at the rate set on the BOD Interest Policies page."}
            </p>
          </div>

          <div className="mb-6 flex gap-2 border-b border-gray-200">
            {[
              { key: "calculation", label: "Calculation" },
              { key: "history", label: "Posting History" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
                  tab === t.key ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "calculation" && (
            <>
              {/* A. Processing controls */}
              <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div>
                  <label htmlFor="si-period" className="block text-xs font-semibold text-gray-600 mb-1">Month</label>
                  <input
                    id="si-period"
                    type="month"
                    value={period}
                    onChange={(e) => e.target.value && setPeriod(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">Status</p>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusChip.cls}`}>{statusChip.label}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">Annual rate</p>
                  <p className="text-sm font-mono text-gray-900 py-1">{pct(preview?.policy?.annual_rate)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">Minimum balance</p>
                  <p className="text-sm font-mono text-gray-900 py-1">
                    {preview?.policy?.minimum_balance == null ? "None" : peso(preview.policy.minimum_balance)}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadPreview(period)}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    Recalculate
                  </button>
                  {!isManager && (
                    <button
                      type="button"
                      onClick={() => { setPostError(""); setConfirmOpen(true); }}
                      disabled={!canPost || loading}
                      className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={16} />
                      Post Interest
                    </button>
                  )}
                </div>
              </div>

              {loadError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{loadError}</span>
                </div>
              )}
              {preview && !preview.month_ended && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{monthLabel(preview.period)} hasn't ended. This is a preview only; you can post after the month ends.</span>
                </div>
              )}
              {status === "posted" && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {monthLabel(preview.period)} is posted ({preview.batches.find((b) => b.status === "posted")?.reference}).
                    The Posted column shows what was credited. To post again, the Manager must reverse it first.
                  </span>
                </div>
              )}
              {status === "reversed" && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>An earlier posting for {monthLabel(preview.period)} was reversed. You can post a corrected batch.</span>
                </div>
              )}

              {/* B. Summary */}
              {preview && (
                <div className="mb-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                  <Tile label="Eligible accounts" value={summary.eligible_count ?? 0} />
                  <Tile label="Excluded accounts" value={summary.excluded_count ?? 0} hint="See reasons below" />
                  <Tile label="To review" value={summary.exception_count ?? 0} hint="Closed, terminated, below minimum" tone={summary.exception_count ? "text-amber-700" : "text-gray-900"} />
                  <Tile label="Eligible balance" value={peso(summary.total_eligible_balance)} hint="At month end" />
                  <Tile label="Proposed interest" value={peso(summary.total_proposed_interest)} tone="text-green-700" />
                  <Tile label="Posted interest" value={summary.total_posted_interest == null ? "—" : peso(summary.total_posted_interest)} />
                </div>
              )}

              {/* C. Account table */}
              {preview && (
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
                    <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                      {[
                        { key: "eligible", label: "Eligible" },
                        { key: "exceptions", label: "To review" },
                        { key: "excluded", label: "All excluded" },
                        { key: "all", label: "All" },
                      ].map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setFilter(f.key)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            filter === f.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="relative ml-auto">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name or account"
                        className={`${inputCls} pl-8 w-64`}
                      />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Account name</th>
                          <th className="px-4 py-3 text-left font-semibold">Account no.</th>
                          <th className="px-4 py-3 text-right font-semibold">Month-end balance</th>
                          <th className="px-4 py-3 text-right font-semibold">Rate</th>
                          <th className="px-4 py-3 text-right font-semibold">Interest</th>
                          <th className="px-4 py-3 text-left font-semibold">{status === "posted" ? "Posted" : "Status"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading && (
                          <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Calculating…</td></tr>
                        )}
                        {!loading && pageRows.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No accounts match.</td></tr>
                        )}
                        {!loading && pageRows.map((r) => {
                          const line = postedLines[r.account_number];
                          return (
                            <tr key={r.account_number} className="border-t border-gray-100">
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{r.account_name}</p>
                                <p className="text-xs text-gray-500">{r.membership_id || "No member link"}</p>
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-700">{r.account_number}</td>
                              <td className="px-4 py-3 text-right font-mono">{peso(r.month_end_balance)}</td>
                              <td className="px-4 py-3 text-right font-mono text-gray-600">{pct(r.annual_rate)}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold">{r.eligible ? peso(r.interest) : "—"}</td>
                              <td className="px-4 py-3">
                                {status === "posted" ? (
                                  line ? (
                                    <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                      Credited {peso(line.interest)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-500">{r.reason || "Not in batch"}</span>
                                  )
                                ) : r.eligible ? (
                                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Preview</span>
                                ) : (
                                  <span className="text-xs text-gray-600">{r.reason}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                    <p className="text-xs text-gray-500">{rows.length} account{rows.length === 1 ? "" : "s"}</p>
                    {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "history" && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 p-4">
                <p className="text-sm text-gray-600">Every posting is kept, including reversed ones.</p>
                <button
                  type="button"
                  onClick={loadBatches}
                  disabled={batchesLoading}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={batchesLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
              {batchesError && <p className="px-4 py-3 text-sm text-red-700">{batchesError}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Reference</th>
                      <th className="px-4 py-3 text-left font-semibold">Month</th>
                      <th className="px-4 py-3 text-right font-semibold">Accounts</th>
                      <th className="px-4 py-3 text-right font-semibold">Rate</th>
                      <th className="px-4 py-3 text-right font-semibold">Total interest</th>
                      <th className="px-4 py-3 text-left font-semibold">Posted</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchesLoading && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
                    )}
                    {!batchesLoading && batches.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No interest has been posted yet.</td></tr>
                    )}
                    {!batchesLoading && batches.map((b) => (
                      <tr key={b.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-mono text-gray-800">{b.reference}</td>
                        <td className="px-4 py-3">{monthLabel(String(b.period_month).slice(0, 7))}</td>
                        <td className="px-4 py-3 text-right font-mono">{b.account_count}</td>
                        <td className="px-4 py-3 text-right font-mono">{pct(b.annual_rate)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{peso(b.total_interest)}</td>
                        <td className="px-4 py-3">
                          <p>{formatDateTime(b.posted_at)}</p>
                          <p className="text-xs text-gray-500">{b.posted_by_email || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${BATCH_STATUS[b.status] || ""}`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openBatch(b.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            <Eye size={14} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* D. Post confirmation */}
      {confirmOpen && preview && (
        <Modal title={`Post interest for ${monthLabel(preview.period)}?`} onClose={() => !posting && setConfirmOpen(false)}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">Accounts credited</dt><dd className="font-mono">{summary.eligible_count}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Annual rate</dt><dd className="font-mono">{pct(preview.policy?.annual_rate)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total interest</dt><dd className="font-mono text-green-700">{peso(summary.total_proposed_interest)}</dd></div>
          </dl>
          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            The server recalculates every amount when you post, so the result may differ slightly if the rate was changed
            after this preview. All accounts are credited together, or none are. Only the Manager can reverse a posting.
          </p>
          {postError && <p className="mt-3 text-sm text-red-700">{postError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmOpen(false)} disabled={posting} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handlePost} disabled={posting} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              <Send size={16} /> {posting ? "Posting…" : "Post Interest"}
            </button>
          </div>
        </Modal>
      )}

      {/* Batch detail / reversal */}
      {(detail || detailLoading) && (
        <Modal
          wide
          title={detail?.batch ? `${detail.batch.reference} — ${monthLabel(String(detail.batch.period_month).slice(0, 7))}` : "Loading…"}
          onClose={() => !reversing && setDetail(null)}
        >
          {detailLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {detail?.batch && (
            <>
              <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-[10px] font-bold uppercase text-gray-500">Status</p><p className="capitalize">{detail.batch.status}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-500">Rate used</p><p className="font-mono">{pct(detail.batch.annual_rate)}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-500">Accounts</p><p className="font-mono">{detail.batch.account_count}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-gray-500">Total interest</p><p className="font-mono font-semibold">{peso(detail.batch.total_interest)}</p></div>
                <div className="col-span-2"><p className="text-[10px] font-bold uppercase text-gray-500">Posted</p><p>{formatDateTime(detail.batch.posted_at)} · {detail.batch.posted_by_email || "—"}</p></div>
                {detail.batch.status === "reversed" && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase text-gray-500">Reversed</p>
                    <p>{formatDateTime(detail.batch.reversed_at)} · {detail.batch.reversed_by_email || "—"}</p>
                    <p className="text-xs text-gray-600 mt-0.5">Reason: {detail.batch.reversal_reason}</p>
                  </div>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Account</th>
                      <th className="px-3 py-2 text-right font-semibold">Month-end balance</th>
                      <th className="px-3 py-2 text-right font-semibold">Interest</th>
                      <th className="px-3 py-2 text-left font-semibold">Ledger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.account_number} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{l.account_name}</p>
                          <p className="font-mono text-gray-500">{l.account_number}</p>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{peso(l.month_end_balance)}</td>
                        <td className="px-3 py-2 text-right font-mono">{peso(l.interest)}</td>
                        <td className="px-3 py-2 text-gray-600">{l.reversal_ledger_id ? "Credited, then reversed" : "Credited"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isManager && detail.batch.status === "posted" && (
                detail.batch.posted_by === myUserId ? (
                  <p className="mt-4 text-sm text-gray-600">You posted this batch, so another Manager must reverse it.</p>
                ) : (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <label htmlFor="si-reason" className="block text-sm font-semibold text-gray-800 mb-1">Reverse this posting</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Debits the same amount from every account above. The posting stays in history as Reversed, and the
                      Bookkeeper can then post a corrected batch.
                    </p>
                    <textarea
                      id="si-reason"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this posting being reversed? (at least 10 characters)"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[#66B538] outline-none"
                    />
                    {reverseError && <p className="mt-2 text-sm text-red-700">{reverseError}</p>}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={handleReverse}
                        disabled={reversing}
                        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <Undo2 size={16} /> {reversing ? "Reversing…" : "Reverse Posting"}
                      </button>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
};

export default SavingsInterest;
```

## Appendix E: wiring

`src/Router.jsx`:
```jsx
import SavingsInterest from "./Bookkeeper/Components/Savings_Interest";
// with the bookkeeper routes:
{path: "/bookkeeper-savings-interest", element: bookkeeperGuarded(<SavingsInterest portal="Bookkeeper"/>)},
// with the manager routes:
{path: "/manager-savings-interest", element: managerGuarded(<SavingsInterest portal="Manager"/>)},
```

`src/components/StaffSidebar/configs/bookkeeper.js`, in the "Savings & Capital" subItems:
```js
{ name: "Savings Interest",            path: "/bookkeeper-savings-interest" },
```

`src/components/StaffSidebar/configs/manager.js`: add `Percent` to the lucide-react import, then:
```js
{ name: "Savings Interest", icon: Percent,       path: "/manager-savings-interest" },
```
