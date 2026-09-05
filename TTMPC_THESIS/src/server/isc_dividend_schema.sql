-- =============================================================================
-- Interest on Share Capital (ISC) — schema, averaging engine, posting &
-- reversal functions.
-- =============================================================================
-- Implements ISC_DIVIDEND_PLAN.md end to end. Read that document for the "why"
-- behind every rule enforced here — this file only implements it.
--
-- Run in the Supabase SQL editor. Safe to run multiple times (idempotent
-- CREATE OR REPLACE / IF NOT EXISTS throughout), except that once a real
-- posting exists you cannot re-run the CREATE TABLE section — that's expected,
-- schema only needs to be created once.
--
-- Depends on (must already exist):
--   public.member                    (add_member_status_column.sql)
--   public.capital_build_up          (membership_confirmation_policies.sql,
--                                      cbu_cashier_policy_and_trigger.sql)
--   public.is_cbu_staff()            (is_cbu_staff_add_bookkeeper.sql)
--   public.has_portal_role()         (loan_form_policies.sql)
--   public.audit_resolve_actor()     (audit_log_schema.sql)
--   public.audit_write()             (audit_log_schema.sql)
--   public.audit_trg_capital_build_up() / trg_audit_capital_build_up
--                                     (audit_log_cashier_triggers.sql)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), already used elsewhere
CREATE EXTENSION IF NOT EXISTS btree_gist; -- required for the EXCLUDE constraint below

CREATE TABLE IF NOT EXISTS public.isc_postings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start      date NOT NULL,                 -- first day of the "from" month
  period_end        date NOT NULL,                 -- LAST calendar day of the "to" month
  month_count       integer NOT NULL,               -- the divisor actually used
  rate              numeric(6,4) NOT NULL,          -- percent, e.g. 5.0000 = 5%
  total_members     integer NOT NULL DEFAULT 0,
  total_basis       numeric NOT NULL DEFAULT 0,
  total_interest    numeric NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  posted_by         uuid REFERENCES public.member(id),
  posted_by_email   text,
  posted_at         timestamptz NOT NULL DEFAULT now(),
  -- Reversal fields — null until this posting is reversed.
  reversed_by       uuid REFERENCES public.member(id),
  reversed_by_email text,
  reversed_at       timestamptz,
  reversal_reason   text,

  CHECK (period_start >= DATE '2025-12-01'),
  CHECK (period_end >= period_start),
  CHECK (month_count > 0),
  CHECK (rate > 0 AND rate <= 100)
);

-- No two LIVE postings may cover the same month. A reversed posting frees its
-- months for a corrected posting to reuse (see ISC_DIVIDEND_PLAN.md §8.0).
ALTER TABLE public.isc_postings
  DROP CONSTRAINT IF EXISTS isc_postings_no_overlap;
ALTER TABLE public.isc_postings
  ADD CONSTRAINT isc_postings_no_overlap
  EXCLUDE USING gist (
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (status = 'posted');

CREATE TABLE IF NOT EXISTS public.isc_transactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isc_posting_id         uuid NOT NULL REFERENCES public.isc_postings(id) ON DELETE CASCADE,
  member_id              uuid NOT NULL REFERENCES public.member(id),
  average_share_capital  numeric NOT NULL,   -- the basis used, retained for audit
  total_share_capital    numeric NOT NULL,   -- closing balance at period_end (pre-interest)
  rate                   numeric(6,4) NOT NULL,
  interest_amount        numeric NOT NULL,   -- negative on a reversal posting
  created_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (isc_posting_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_isc_transactions_member ON public.isc_transactions (member_id);
CREATE INDEX IF NOT EXISTS idx_isc_postings_status ON public.isc_postings (status);

-- capital_build_up gets a fifth writer, following the same source_* pattern
-- as source_loan_id / source_payment_id / cbu_deposit_id.
ALTER TABLE public.capital_build_up
  ADD COLUMN IF NOT EXISTS source_isc_id uuid REFERENCES public.isc_transactions(id);

CREATE UNIQUE INDEX IF NOT EXISTS capital_build_up_source_isc_id_uk
  ON public.capital_build_up (source_isc_id)
  WHERE source_isc_id IS NOT NULL;

-- The averaging function does one member/month lookup per row — this index
-- makes each lookup an index scan instead of a sequential scan.
CREATE INDEX IF NOT EXISTS idx_capital_build_up_member_txndate
  ON public.capital_build_up (member_id, transaction_date DESC);

-- =============================================================================
-- 2. RLS — read access mirrors is_cbu_staff() (bookkeeper/cashier/manager/
--    treasurer/bod). Nobody writes these tables directly — only isc_post()
--    and isc_reverse() below, both SECURITY DEFINER.
-- =============================================================================

ALTER TABLE public.isc_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.isc_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.isc_postings TO authenticated;
GRANT SELECT ON public.isc_transactions TO authenticated;

DROP POLICY IF EXISTS isc_postings_staff_select ON public.isc_postings;
CREATE POLICY isc_postings_staff_select
ON public.isc_postings
FOR SELECT
TO authenticated
USING (public.is_cbu_staff());

DROP POLICY IF EXISTS isc_transactions_staff_select ON public.isc_transactions;
CREATE POLICY isc_transactions_staff_select
ON public.isc_transactions
FOR SELECT
TO authenticated
USING (public.is_cbu_staff());

-- =============================================================================
-- 3. Averaging engine — the one place the formula lives (ISC_DIVIDEND_PLAN.md
--    §3: "a change later is a single CREATE OR REPLACE and nothing else
--    moves"). Read-only: never writes anything, safe to call any number of
--    times with any rate, including null.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.isc_calculate_preview(
  p_period_start date,
  p_period_end   date,
  p_rate         numeric DEFAULT NULL
)
RETURNS TABLE (
  member_id              uuid,
  membership_id          text,
  member_name            text,
  average_share_capital  numeric,
  total_share_capital    numeric,
  month_count            integer,
  rate                   numeric,
  interest_amount        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date := date_trunc('month', p_period_start)::date;
  v_period_end   date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_month_count  integer;
BEGIN
  IF v_period_start < DATE '2025-12-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before December 2025 — no month-by-month CBU history exists before that date.';
  END IF;
  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;
  IF p_rate IS NOT NULL AND (p_rate <= 0 OR p_rate > 100) THEN
    RAISE EXCEPTION 'ISC rate must be between 0 and 100.';
  END IF;

  v_month_count := (EXTRACT(YEAR FROM date_trunc('month', p_period_end)) - EXTRACT(YEAR FROM v_period_start))::int * 12
                 + (EXTRACT(MONTH FROM date_trunc('month', p_period_end)) - EXTRACT(MONTH FROM v_period_start))::int
                 + 1;

  RETURN QUERY
  WITH month_ends AS (
    SELECT (gs + interval '1 month' - interval '1 day')::date AS month_end
    FROM generate_series(v_period_start, date_trunc('month', p_period_end)::date, interval '1 month') AS gs
  ),
  eligible_members AS (
    SELECT
      m.id,
      m.membership_id::text AS membership_id,
      btrim(concat_ws(' ', m.first_name, nullif(btrim(coalesce(m.middle_initial, '')), ''), m.last_name)) AS member_name
    FROM public.member m
    WHERE lower(coalesce(m.member_status, 'active')) = 'active'
  ),
  monthly_balances AS (
    SELECT
      em.id AS member_id,
      me.month_end,
      COALESCE(
        (
          SELECT cbu.ending_share_capital
          FROM public.capital_build_up cbu
          WHERE cbu.member_id = em.id
            AND cbu.transaction_date::date <= me.month_end
          ORDER BY
            cbu.transaction_date DESC,
            NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
            cbu.id DESC
          LIMIT 1
        ),
        0
      ) AS balance
    FROM eligible_members em
    CROSS JOIN month_ends me
  ),
  aggregated AS (
    SELECT
      mb.member_id,
      AVG(mb.balance) AS average_share_capital,
      MAX(mb.balance) FILTER (WHERE mb.month_end = v_period_end) AS total_share_capital
    FROM monthly_balances mb
    GROUP BY mb.member_id
  )
  SELECT
    em.id,
    em.membership_id,
    em.member_name,
    round(a.average_share_capital, 2),
    round(a.total_share_capital, 2),
    v_month_count,
    p_rate,
    CASE WHEN p_rate IS NULL THEN NULL ELSE round(a.average_share_capital * p_rate / 100.0, 2) END
  FROM aggregated a
  JOIN eligible_members em ON em.id = a.member_id
  WHERE a.average_share_capital > 0
  ORDER BY a.average_share_capital DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.isc_calculate_preview(date, date, numeric) TO authenticated;

-- =============================================================================
-- 4. Posting — the only place that writes a real ISC dividend. Called
--    directly from the browser (supabase.rpc()) so auth.uid() is the real
--    bookkeeper, never 'service_role' (ISC_DIVIDEND_PLAN.md §5.1).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.isc_post(
  p_period_start date,
  p_period_end   date,
  p_rate         numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start   date := date_trunc('month', p_period_start)::date;
  v_period_end     date := (date_trunc('month', p_period_end) + interval '1 month' - interval '1 day')::date;
  v_month_count    integer;
  v_posting_id     uuid := gen_random_uuid();
  v_actor          record;
  v_next_seq       integer;
  v_row            record;
  v_isc_tx_id      uuid;
  v_cbud           text;
  v_total_members  integer := 0;
  v_total_basis    numeric := 0;
  v_total_interest numeric := 0;
BEGIN
  -- The disabled Post button is only a courtesy — this is the real guard.
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may post Interest on Share Capital.';
  END IF;

  -- Never silently substitute a default rate — a blank/zero/out-of-range
  -- rate must fail loudly, not post at 0%.
  IF p_rate IS NULL OR p_rate <= 0 OR p_rate > 100 THEN
    RAISE EXCEPTION 'A valid interest rate greater than 0 and at most 100 is required to post.';
  END IF;

  IF v_period_start < DATE '2025-12-01' THEN
    RAISE EXCEPTION 'ISC period cannot start before December 2025 — no month-by-month CBU history exists before that date.';
  END IF;
  IF v_period_end < v_period_start THEN
    RAISE EXCEPTION 'ISC period end must not be before the period start.';
  END IF;

  v_month_count := (EXTRACT(YEAR FROM date_trunc('month', p_period_end)) - EXTRACT(YEAR FROM v_period_start))::int * 12
                 + (EXTRACT(MONTH FROM date_trunc('month', p_period_end)) - EXTRACT(MONTH FROM v_period_start))::int
                 + 1;

  SELECT * INTO v_actor FROM public.audit_resolve_actor();

  -- Reserve the posting row first so the EXCLUDE constraint rejects an
  -- overlapping period before any per-member work happens.
  INSERT INTO public.isc_postings (
    id, period_start, period_end, month_count, rate,
    total_members, total_basis, total_interest,
    status, posted_by, posted_by_email, posted_at
  ) VALUES (
    v_posting_id, v_period_start, v_period_end, v_month_count, p_rate,
    0, 0, 0,
    'posted', v_actor.uid, v_actor.email, now()
  );

  -- One MAX() scan up front, then a local counter — so the per-row
  -- set_cbu_deposit_id() trigger's own MAX() scan never fires for these
  -- inserts (ISC_DIVIDEND_PLAN.md §5.3).
  SELECT coalesce(
    max(nullif(regexp_replace(cbu_deposit_id, '^CBUD_0*', ''), '')::integer), 0
  ) + 1
  INTO v_next_seq
  FROM public.capital_build_up;

  FOR v_row IN
    SELECT * FROM public.isc_calculate_preview(p_period_start, p_period_end, p_rate)
  LOOP
    v_total_members := v_total_members + 1;
    v_total_basis := v_total_basis + v_row.average_share_capital;
    v_total_interest := v_total_interest + v_row.interest_amount;

    v_isc_tx_id := gen_random_uuid();
    INSERT INTO public.isc_transactions (
      id, isc_posting_id, member_id,
      average_share_capital, total_share_capital, rate, interest_amount
    ) VALUES (
      v_isc_tx_id, v_posting_id, v_row.member_id,
      v_row.average_share_capital, v_row.total_share_capital, p_rate, v_row.interest_amount
    );

    v_cbud := 'CBUD_' || lpad(v_next_seq::text, 3, '0');
    v_next_seq := v_next_seq + 1;

    INSERT INTO public.capital_build_up (
      id, member_id, transaction_date,
      starting_share_capital, capital_added, deposit_account,
      ending_share_capital, cbu_deposit_id, source_isc_id
    ) VALUES (
      gen_random_uuid(), v_row.member_id, now(),
      v_row.total_share_capital, v_row.interest_amount, 'INTEREST_ON_SHARE_CAPITAL',
      v_row.total_share_capital + v_row.interest_amount, v_cbud, v_isc_tx_id
    );
  END LOOP;

  UPDATE public.isc_postings
  SET total_members = v_total_members,
      total_basis = v_total_basis,
      total_interest = v_total_interest
  WHERE id = v_posting_id;

  RETURN v_posting_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.isc_post(date, date, numeric) TO authenticated;

-- =============================================================================
-- 5. Reversal — never delete/edit, post the opposite. Manager-only, even
--    against the bookkeeper who created the posting (ISC_DIVIDEND_PLAN.md
--    §5.4, §8.2).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.isc_reverse(
  p_posting_id uuid,
  p_reason     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor       record;
  v_original    record;
  v_reversal_id uuid := gen_random_uuid();
  v_next_seq    integer;
  v_tx          record;
  v_isc_tx_id   uuid;
  v_cbud        text;
  v_new_ending  numeric;
BEGIN
  -- Deliberately narrower than is_cbu_staff(): the bookkeeper who posted
  -- this is excluded on purpose, even though they can view and post ISC.
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['manager']) THEN
    RAISE EXCEPTION 'Only a manager may reverse an Interest on Share Capital posting.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A written reason is required to reverse a posting.';
  END IF;

  SELECT * INTO v_original FROM public.isc_postings WHERE id = p_posting_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISC posting not found.';
  END IF;
  IF v_original.status <> 'posted' THEN
    RAISE EXCEPTION 'This posting has already been reversed.';
  END IF;

  SELECT * INTO v_actor FROM public.audit_resolve_actor();

  UPDATE public.isc_postings
  SET status = 'reversed',
      reversed_by = v_actor.uid,
      reversed_by_email = v_actor.email,
      reversed_at = now(),
      reversal_reason = btrim(p_reason)
  WHERE id = p_posting_id;

  -- The reversal is itself a normal posting row (negative totals) — the
  -- EXCLUDE constraint only applies WHERE status = 'posted', and the
  -- original just flipped to 'reversed' above, so this insert is legal even
  -- though it covers the exact same months.
  INSERT INTO public.isc_postings (
    id, period_start, period_end, month_count, rate,
    total_members, total_basis, total_interest,
    status, posted_by, posted_by_email, posted_at
  ) VALUES (
    v_reversal_id, v_original.period_start, v_original.period_end, v_original.month_count, v_original.rate,
    v_original.total_members, -v_original.total_basis, -v_original.total_interest,
    'posted', v_actor.uid, v_actor.email, now()
  );

  SELECT coalesce(
    max(nullif(regexp_replace(cbu_deposit_id, '^CBUD_0*', ''), '')::integer), 0
  ) + 1
  INTO v_next_seq
  FROM public.capital_build_up;

  FOR v_tx IN
    SELECT * FROM public.isc_transactions WHERE isc_posting_id = p_posting_id
  LOOP
    v_isc_tx_id := gen_random_uuid();
    INSERT INTO public.isc_transactions (
      id, isc_posting_id, member_id,
      average_share_capital, total_share_capital, rate, interest_amount
    ) VALUES (
      v_isc_tx_id, v_reversal_id, v_tx.member_id,
      v_tx.average_share_capital, v_tx.total_share_capital, v_tx.rate, -v_tx.interest_amount
    );

    -- The member's running balance right now (after the original posting,
    -- and after any other CBU activity since) — not total_share_capital,
    -- which is a snapshot from the original calculation.
    SELECT cbu.ending_share_capital
    INTO v_new_ending
    FROM public.capital_build_up cbu
    WHERE cbu.member_id = v_tx.member_id
    ORDER BY
      cbu.transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu.cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
      cbu.id DESC
    LIMIT 1;
    v_new_ending := coalesce(v_new_ending, 0);

    v_cbud := 'CBUD_' || lpad(v_next_seq::text, 3, '0');
    v_next_seq := v_next_seq + 1;

    INSERT INTO public.capital_build_up (
      id, member_id, transaction_date,
      starting_share_capital, capital_added, deposit_account,
      ending_share_capital, cbu_deposit_id, source_isc_id
    ) VALUES (
      gen_random_uuid(), v_tx.member_id, now(),
      v_new_ending, -v_tx.interest_amount, 'INTEREST_ON_SHARE_CAPITAL_REVERSAL',
      v_new_ending - v_tx.interest_amount, v_cbud, v_isc_tx_id
    );
  END LOOP;

  RETURN v_reversal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.isc_reverse(uuid, text) TO authenticated;

-- =============================================================================
-- 6. Audit trail — ISC rows are audited for free by the existing
--    capital_build_up trigger (audit_log_cashier_triggers.sql). Widen the
--    context so ISC rows are distinguishable from ordinary cashier deposits,
--    per ISC_DIVIDEND_PLAN.md §5.2 ("do not build a second audit system").
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_trg_capital_build_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_write(
      'cbu',
      coalesce(NEW.cbu_deposit_id, NEW.id::text),
      'record',
      NULL,
      jsonb_build_object(
        'member_id',              NEW.member_id,
        'capital_added',          NEW.capital_added,
        'starting_share_capital', NEW.starting_share_capital,
        'ending_share_capital',   NEW.ending_share_capital,
        'transaction_date',       NEW.transaction_date
      ),
      jsonb_build_object(
        'member_id',      NEW.member_id,
        'capital_added',  NEW.capital_added,
        'deposit_account', NEW.deposit_account,
        'source_isc_id',  NEW.source_isc_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
