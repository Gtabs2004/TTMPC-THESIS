-- =============================================================================
-- ISC v2 — FIX: cbu_deposit_id collision in isc_settle_posting
-- =============================================================================
-- Run AFTER isc_v2_03_post_settle.sql. Read the reasoning before running.
--
-- THE BUG (mine, in isc_settle_posting)
--
--   ERROR: duplicate key value violates unique constraint
--          "capital_build_up_cbu_deposit_id_uk"
--   DETAIL: Key (cbu_deposit_id)=(CBUD_100) already exists.
--
--   Settlement loops over members and, for each one, recomputes the next
--   sequence number with a MAX() scan:
--
--       SELECT coalesce(max(<numeric suffix>), 0) + 1 INTO v_next_seq
--       FROM public.capital_build_up;
--
--   That was meant to pre-supply the id so the BEFORE INSERT trigger's own
--   MAX() scan never fires (§5.3 -- otherwise 263 full table scans). The
--   intent was right; the implementation is not.
--
-- THE DEFECT
--   THE MAX() SCAN INSIDE THE LOOP recomputes the same number on consecutive
--   iterations, so the second member's insert claims an id the first already
--   took. A per-iteration scan is both slow AND wrong.
--
--   (An earlier draft of this note also blamed lpad(n,3,'0'). Measured after
--   the fix: the highest suffix in use is 830, so lpad was already emitting
--   un-padded 4-digit ids like CBUD_830 and was NOT the cause. Padding is
--   still widened to 4 below -- it keeps text ordering sane and costs nothing
--   -- but the collision was entirely the rescan.)
--
-- THE FIX
--   Compute the starting number ONCE, before the loop, then increment a local
--   counter per member. No scan inside the loop at all -- which is what §5.3
--   actually asked for -- and no possibility of two rows claiming one id.
--
--   Padding is widened to 4 so ids keep sorting sensibly as text for a while
--   longer; the authoritative ordering remains the NUMERIC parse used
--   everywhere else (§11.1), never the text.
--
-- Idempotent: replaces one function. No data is changed.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.isc_settle_posting(
  p_posting_id      uuid,
  p_cash_member_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_effective_date  date   DEFAULT current_date
)
RETURNS TABLE (
  capitalised_count integer,
  cash_count        integer,
  capitalised_total numeric,
  cash_total        numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_posting     record;
  v_row         record;
  v_cbu_id      uuid;
  v_seq         integer;      -- computed ONCE, incremented in the loop
  v_cbud        text;
  v_balance     numeric;
  v_cap_count   integer := 0;
  v_cash_count  integer := 0;
  v_cap_total   numeric := 0;
  v_cash_total  numeric := 0;
BEGIN
  IF NOT public.has_portal_role(auth.uid(), auth.email(), ARRAY['bookkeeper']) THEN
    RAISE EXCEPTION 'Only a bookkeeper may settle Interest on Share Capital.';
  END IF;

  SELECT * INTO v_posting FROM public.isc_postings WHERE id = p_posting_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISC posting % does not exist.', p_posting_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.isc_transactions
              WHERE isc_posting_id = p_posting_id AND settlement <> 'unsettled') THEN
    RAISE EXCEPTION 'This posting has already been settled. Settlement cannot be repeated.';
  END IF;

  -- Back-dating would place a CBU row before deposits made since, carrying a
  -- starting balance read from those later rows -- bug 1's broken chain (§14.2).
  IF p_effective_date < v_posting.period_end THEN
    RAISE EXCEPTION
      'Settlement date % is before the posting period ends (%). A capitalisation cannot be back-dated.',
      p_effective_date, v_posting.period_end;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_cash_member_ids) AS cid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.isc_transactions
      WHERE isc_posting_id = p_posting_id AND member_id = cid)
  ) THEN
    RAISE EXCEPTION 'The cash list contains a member who is not part of this posting.';
  END IF;

  -- ---- members taking CASH: mark only, no CBU row ---------------------------
  UPDATE public.isc_transactions
  SET settlement       = 'cash',
      settled_at       = now(),
      settled_by       = auth.uid(),
      settled_by_email = auth.email()
  WHERE isc_posting_id = p_posting_id
    AND member_id = ANY(p_cash_member_ids);

  SELECT count(*), coalesce(sum(interest_amount), 0)
  INTO v_cash_count, v_cash_total
  FROM public.isc_transactions
  WHERE isc_posting_id = p_posting_id AND settlement = 'cash';

  -- ---------------------------------------------------------------------------
  -- THE FIX: one scan, before the loop. Then increment locally.
  --
  -- The previous version rescanned per member, which was both the performance
  -- problem §5.3 warned about AND a correctness bug -- consecutive iterations
  -- could compute the same number and collide on the unique index.
  -- ---------------------------------------------------------------------------
  SELECT coalesce(max(
           nullif(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer
         ), 0)
  INTO v_seq
  FROM public.capital_build_up;

  -- ---- everyone else CAPITALISES -------------------------------------------
  FOR v_row IN
    SELECT * FROM public.isc_transactions
    WHERE isc_posting_id = p_posting_id
      AND settlement = 'unsettled'
      AND interest_amount > 0
    ORDER BY member_id
  LOOP
    -- Bug 1's discipline: the member's CURRENT ending balance at insert time,
    -- never a period-end snapshot.
    SELECT coalesce(ending_share_capital, 0)
    INTO v_balance
    FROM public.capital_build_up
    WHERE member_id = v_row.member_id
    ORDER BY
      transaction_date DESC,
      NULLIF(regexp_replace(coalesce(cbu_deposit_id, ''), '^CBUD_0*', ''), '')::integer DESC NULLS LAST,
      id DESC
    LIMIT 1;

    v_balance := coalesce(v_balance, 0);

    v_seq    := v_seq + 1;
    -- Pad to 4. The authoritative ordering is the NUMERIC parse used
    -- everywhere else (§11.1); padding only keeps text sorting sane longer.
    v_cbud   := 'CBUD_' || lpad(v_seq::text, 4, '0');
    v_cbu_id := gen_random_uuid();

    INSERT INTO public.capital_build_up (
      id, member_id, transaction_date,
      starting_share_capital, capital_added, ending_share_capital,
      deposit_account, cbu_deposit_id, source_isc_id
    ) VALUES (
      v_cbu_id, v_row.member_id, p_effective_date,
      v_balance, v_row.interest_amount, v_balance + v_row.interest_amount,
      'INTEREST_ON_SHARE_CAPITAL', v_cbud, v_row.id
    );

    UPDATE public.isc_transactions
    SET settlement         = 'capitalised',
        settled_at         = now(),
        settled_by         = auth.uid(),
        settled_by_email   = auth.email(),
        capitalised_cbu_id = v_cbu_id
    WHERE id = v_row.id;

    v_cap_count := v_cap_count + 1;
    v_cap_total := v_cap_total + v_row.interest_amount;
  END LOOP;

  UPDATE public.isc_postings SET status = 'settled' WHERE id = p_posting_id;

  RETURN QUERY SELECT v_cap_count, v_cash_count, v_cap_total, v_cash_total;
END;
$$;

REVOKE ALL ON FUNCTION public.isc_settle_posting(uuid, uuid[], date) FROM public;
GRANT EXECUTE ON FUNCTION public.isc_settle_posting(uuid, uuid[], date) TO authenticated;

COMMIT;


-- =============================================================================
-- VERIFY -- what does the sequence look like now?
-- =============================================================================
SELECT
  'highest cbu_deposit_id number in use'                         AS item,
  coalesce(max(nullif(regexp_replace(coalesce(cbu_deposit_id,''),'^CBUD_0*',''),'')::integer), 0)::text AS value
FROM public.capital_build_up
UNION ALL SELECT
  'rows with a duplicate deposit id (must be 0)',
  (SELECT count(*)::text FROM (
     SELECT cbu_deposit_id FROM public.capital_build_up
     WHERE cbu_deposit_id IS NOT NULL
     GROUP BY cbu_deposit_id HAVING count(*) > 1) d)
UNION ALL SELECT
  'partial settlement left behind? (must be 0)',
  (SELECT count(*)::text FROM public.isc_transactions WHERE settlement = 'capitalised');
