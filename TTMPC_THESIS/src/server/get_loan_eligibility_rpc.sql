-- RPC: get_loan_eligibility
-- Replaces the FastAPI /api/loans/eligibility/{member_id} round-trip.
-- Runs entirely in Postgres: 1 Supabase RPC call instead of
-- frontend → FastAPI → Supabase → FastAPI → frontend.
--
-- Returns JSON shaped like the FastAPI response:
--   { per_type: { consolidated: {...}, bonus: {...}, emergency: {...} } }
--
-- Each bucket: { loan_type, can_apply_new, can_renew, reason, active_loan_id, payments_made }
-- Bonus window: locked outside May (5) and November (11).
-- Renewal threshold: 6 payments (matches FastAPI RENEWAL_MIN_PAYMENTS).

CREATE OR REPLACE FUNCTION public.get_loan_eligibility(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_current_month  int  := EXTRACT(MONTH FROM now())::int;
  v_bonus_open     bool := v_current_month IN (5, 11);
  v_renewal_min    int  := 6;

  v_cons_id        text;
  v_emrg_id        text;
  v_bonus_id       text;
  v_cons_payments  int := 0;
  v_emrg_payments  int := 0;
  v_bonus_payments int := 0;

  v_bucket_cons    jsonb;
  v_bucket_emrg    jsonb;
  v_bucket_bonus   jsonb;
BEGIN
  -- Find the most recent active loan for each type in one query.
  -- "active" = loan_status IN ('released', 'paid', 'partially paid')
  -- Ordered by disbursal_date desc, application_date desc (most recent first).
  SELECT
    MAX(control_number) FILTER (WHERE loan_category = 'consolidated'),
    MAX(control_number) FILTER (WHERE loan_category = 'emergency'),
    MAX(control_number) FILTER (WHERE loan_category = 'bonus')
  INTO v_cons_id, v_emrg_id, v_bonus_id
  FROM (
    -- DISTINCT ON: one row per (member, category), the most recent active loan
    SELECT DISTINCT ON (
      CASE
        WHEN LOWER(lt.code) LIKE '%consolidated%' OR LOWER(lt.name) LIKE '%consolidated%' THEN 'consolidated'
        WHEN LOWER(lt.code) LIKE '%emergency%'    OR LOWER(lt.name) LIKE '%emergency%'    THEN 'emergency'
        WHEN LOWER(lt.code) LIKE '%bonus%'        OR LOWER(lt.name) LIKE '%bonus%'        THEN 'bonus'
      END
    )
      l.control_number,
      CASE
        WHEN LOWER(lt.code) LIKE '%consolidated%' OR LOWER(lt.name) LIKE '%consolidated%' THEN 'consolidated'
        WHEN LOWER(lt.code) LIKE '%emergency%'    OR LOWER(lt.name) LIKE '%emergency%'    THEN 'emergency'
        WHEN LOWER(lt.code) LIKE '%bonus%'        OR LOWER(lt.name) LIKE '%bonus%'        THEN 'bonus'
      END AS loan_category
    FROM public.loans l
    JOIN public.loan_types lt ON lt.id = l.loan_type_id
    WHERE l.member_id = p_member_id
      AND LOWER(l.loan_status) IN ('released', 'paid', 'partially paid')
    ORDER BY
      CASE
        WHEN LOWER(lt.code) LIKE '%consolidated%' OR LOWER(lt.name) LIKE '%consolidated%' THEN 'consolidated'
        WHEN LOWER(lt.code) LIKE '%emergency%'    OR LOWER(lt.name) LIKE '%emergency%'    THEN 'emergency'
        WHEN LOWER(lt.code) LIKE '%bonus%'        OR LOWER(lt.name) LIKE '%bonus%'        THEN 'bonus'
      END,
      COALESCE(l.disbursal_date, l.application_date) DESC NULLS LAST
  ) active_loans;

  -- Count payments for all active loans in one query
  IF v_cons_id IS NOT NULL OR v_emrg_id IS NOT NULL OR v_bonus_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE loan_id = v_cons_id),
      COUNT(*) FILTER (WHERE loan_id = v_emrg_id),
      COUNT(*) FILTER (WHERE loan_id = v_bonus_id)
    INTO v_cons_payments, v_emrg_payments, v_bonus_payments
    FROM public.loan_payments
    WHERE loan_id IN (v_cons_id, v_emrg_id, v_bonus_id);
  END IF;

  -- Consolidated bucket
  IF v_cons_id IS NULL THEN
    v_bucket_cons := jsonb_build_object(
      'loan_type', 'consolidated', 'can_apply_new', true, 'can_renew', false,
      'reason', 'No active consolidated loan on record.',
      'active_loan_id', null, 'payments_made', 0
    );
  ELSE
    v_bucket_cons := jsonb_build_object(
      'loan_type', 'consolidated', 'can_apply_new', false,
      'can_renew', (v_cons_payments >= v_renewal_min),
      'reason', 'Active consolidated loan ' || v_cons_id || ' in repayment. ' ||
        CASE WHEN v_cons_payments >= v_renewal_min THEN 'Eligible for renewal.'
             ELSE 'Needs ' || (v_renewal_min - v_cons_payments)::text || ' more monthly payment(s) before renewal.'
        END,
      'active_loan_id', v_cons_id, 'payments_made', v_cons_payments
    );
  END IF;

  -- Emergency bucket
  IF v_emrg_id IS NULL THEN
    v_bucket_emrg := jsonb_build_object(
      'loan_type', 'emergency', 'can_apply_new', true, 'can_renew', false,
      'reason', 'No active emergency loan on record.',
      'active_loan_id', null, 'payments_made', 0
    );
  ELSE
    v_bucket_emrg := jsonb_build_object(
      'loan_type', 'emergency', 'can_apply_new', false,
      'can_renew', (v_emrg_payments >= v_renewal_min),
      'reason', 'Active emergency loan ' || v_emrg_id || ' in repayment. ' ||
        CASE WHEN v_emrg_payments >= v_renewal_min THEN 'Eligible for renewal.'
             ELSE 'Needs ' || (v_renewal_min - v_emrg_payments)::text || ' more monthly payment(s) before renewal.'
        END,
      'active_loan_id', v_emrg_id, 'payments_made', v_emrg_payments
    );
  END IF;

  -- Bonus bucket (window check first)
  IF NOT v_bonus_open THEN
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', false, 'can_renew', false,
      'reason', 'Bonus loan applications are accepted only during Mid-year (May) and Year-end (November).',
      'active_loan_id', null, 'payments_made', 0
    );
  ELSIF v_bonus_id IS NULL THEN
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', true, 'can_renew', false,
      'reason', 'No active bonus loan on record.',
      'active_loan_id', null, 'payments_made', 0
    );
  ELSE
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', false,
      'can_renew', (v_bonus_payments >= v_renewal_min),
      'reason', 'Active bonus loan ' || v_bonus_id || ' in repayment. ' ||
        CASE WHEN v_bonus_payments >= v_renewal_min THEN 'Eligible for renewal.'
             ELSE 'Needs ' || (v_renewal_min - v_bonus_payments)::text || ' more monthly payment(s) before renewal.'
        END,
      'active_loan_id', v_bonus_id, 'payments_made', v_bonus_payments
    );
  END IF;

  RETURN jsonb_build_object(
    'per_type', jsonb_build_object(
      'consolidated', v_bucket_cons,
      'emergency',    v_bucket_emrg,
      'bonus',        v_bucket_bonus
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_loan_eligibility(uuid) TO authenticated;
