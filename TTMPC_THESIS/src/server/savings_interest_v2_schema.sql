-- Savings Interest v2 — quarterly, Actual/365, running-balance accrual.
-- Confirmed cooperative rule (SAVINGS_INTEREST_V2_PLAN.md, 2026-10-17).
--
-- savings_interest_batches: one row per account per quarter-close. The
-- authoritative Decimal/ROUND_HALF_UP math stays in Python
-- (savings_interest_v2/ledger_engine.py); this table only stores results and
-- enforces "can't post the same account+quarter twice" / reversal bookkeeping.
-- The actual balance change is a public.savings_ledger credit row
-- (source='savings_interest'), inserted by the same FastAPI call that writes
-- this batch row — the existing savings_ledger trigger applies it to the
-- balance, so no separate balance-mutation logic is needed here.
--
-- Segregation of duties mirrors loan_renewal_override_requests and the ISC
-- plan: Bookkeeper posts, Manager reverses, never their own posting. RLS is
-- on with NO client policies — all access goes through FastAPI on the
-- service-role key (same reasoning as loan_renewal_override_schema.sql).
--
-- Idempotent. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.savings_interest_batches (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_number      text NOT NULL REFERENCES public.savings_accounts(account_number) ON DELETE CASCADE,
    period_quarter      date NOT NULL,  -- must be Mar 31 / Jun 30 / Sep 30 / Dec 31
    annual_rate         numeric(7,4) NOT NULL,
    opening_balance      numeric(14,2) NOT NULL,
    closing_balance      numeric(14,2) NOT NULL,
    interest_posted     numeric(14,2) NOT NULL CHECK (interest_posted >= 0),
    ledger_entry_id     uuid REFERENCES public.savings_ledger(id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'posted'
        CHECK (status IN ('posted', 'reversed')),
    posted_by_user_id   uuid,
    posted_by_email     text,
    posted_at           timestamptz NOT NULL DEFAULT now(),
    reversed_by_user_id uuid,
    reversed_by_email   text,
    reversed_at         timestamptz,
    reversal_reason     text,
    reversal_ledger_entry_id uuid REFERENCES public.savings_ledger(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT savings_interest_batches_quarter_end_chk CHECK (
        (EXTRACT(MONTH FROM period_quarter)::int, EXTRACT(DAY FROM period_quarter)::int)
            IN ((3, 31), (6, 30), (9, 30), (12, 31))
    )
);

-- One posting per account per quarter — the uniqueness guard the plan's
-- "duplicate-posting" test matrix item (§4.4 of SAVINGS_INTEREST_PLAN.md)
-- needs. A reversed batch frees the quarter for re-posting.
CREATE UNIQUE INDEX IF NOT EXISTS uq_savings_interest_one_posted_per_quarter
    ON public.savings_interest_batches (account_number, period_quarter)
    WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_savings_interest_batches_account
    ON public.savings_interest_batches (account_number, period_quarter DESC);

-- Optional line-level detail (one row per ledger interval inside a posted
-- batch) for the "Accrued Int." tooltip breakdown. Not required to post or
-- reverse a batch; kept only so the frontend can show the exact
-- days x balance x rate math per interval without recomputing it.
CREATE TABLE IF NOT EXISTS public.savings_interest_lines (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id        bigint NOT NULL REFERENCES public.savings_interest_batches(id) ON DELETE CASCADE,
    line_date       date NOT NULL,
    code            text NOT NULL CHECK (code IN ('CD', 'WD', 'Int.')),
    elapsed_days    integer NOT NULL CHECK (elapsed_days >= 0),
    resulting_balance numeric(14,2) NOT NULL,
    line_interest   numeric(14,2) NOT NULL CHECK (line_interest >= 0),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_savings_interest_lines_batch
    ON public.savings_interest_lines (batch_id, line_date);

-- RLS on, no client policies: service-role (FastAPI) only, same posture as
-- loan_renewal_override_requests.
ALTER TABLE public.savings_interest_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_interest_lines   ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.savings_interest_batches TO service_role;
GRANT ALL ON public.savings_interest_lines   TO service_role;

COMMIT;
