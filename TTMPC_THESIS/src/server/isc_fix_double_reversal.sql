-- =============================================================================
-- ISC FIX — a reversal must not itself be reversible  (2026-09-06)
-- =============================================================================
-- SYMPTOM
--   After a manager reverses a posting, the offsetting row appears in the
--   history with its own active "Reverse" button.
--
-- WHY IT IS NOT MERELY COSMETIC
--   isc_reverse() guards only with:
--       IF v_original.status <> 'posted' THEN RAISE ... END IF;
--   A reversal row is inserted with status = 'posted' (deliberately -- that is
--   what frees the period for a corrected posting under the partial EXCLUDE
--   index). So the guard passes and the database would happily reverse the
--   reversal, re-crediting the full amount to all 263 members.
--
--   Verified against live data: the reversal row carries status='posted' and
--   reversed_by IS NULL, so nothing currently distinguishes it.
--
-- FIX
--   1. Add reverses_posting_id -- set only on rows that ARE a reversal, and
--      pointing at the posting they offset. This is an explicit marker rather
--      than inferring from "total_interest < 0", which would be fragile.
--   2. isc_reverse() refuses when that column is non-null.
--   3. Backfill the existing reversal row so the guard covers it too.
--
-- Safe on a live database. Safe to run more than once.
-- =============================================================================

BEGIN;

ALTER TABLE public.isc_postings
  ADD COLUMN IF NOT EXISTS reverses_posting_id uuid REFERENCES public.isc_postings(id);

COMMENT ON COLUMN public.isc_postings.reverses_posting_id IS
  'Set only on a reversal row; points at the posting it offsets. NULL on an '
  'ordinary posting. A row with this set can never itself be reversed.';

-- Backfill: link each existing reversal to the posting it offsets, matching on
-- period + rate + the negated total. Narrow enough not to touch anything else.
UPDATE public.isc_postings r
SET reverses_posting_id = o.id
FROM public.isc_postings o
WHERE r.reverses_posting_id IS NULL
  AND r.total_interest < 0
  AND o.status = 'reversed'
  AND o.period_start = r.period_start
  AND o.period_end   = r.period_end
  AND o.rate         = r.rate
  AND abs(o.total_interest + r.total_interest) < 0.01;

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

  -- A reversal row carries status='posted' (that is what frees the period for
  -- a corrected posting), so the status check below cannot catch it. Without
  -- this guard a manager could reverse a reversal and re-credit every member.
  IF v_original.reverses_posting_id IS NOT NULL THEN
    RAISE EXCEPTION 'This entry is itself a reversal and cannot be reversed. Post a new Interest on Share Capital instead.';
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

  INSERT INTO public.isc_postings (
    id, period_start, period_end, month_count, rate,
    total_members, total_basis, total_interest,
    status, posted_by, posted_by_email, posted_at, reverses_posting_id
  ) VALUES (
    v_reversal_id, v_original.period_start, v_original.period_end,
    v_original.month_count, v_original.rate,
    v_original.total_members, -v_original.total_basis, -v_original.total_interest,
    'posted', v_actor.uid, v_actor.email, now(), p_posting_id
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

COMMIT;
