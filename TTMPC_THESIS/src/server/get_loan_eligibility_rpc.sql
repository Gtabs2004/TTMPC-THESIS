-- RPC: get_loan_eligibility
-- Replaces the FastAPI /api/loans/eligibility/{member_id} round-trip.
-- Runs entirely in Postgres: 1 Supabase call instead of
-- frontend → FastAPI → Supabase → FastAPI → frontend.
--
-- Returns a JSON object shaped like the FastAPI response:
--   { per_type: { consolidated: {...}, bonus: {...}, emergency: {...} } }
--
-- Each bucket:
--   { loan_type, can_apply_new, can_renew, reason, active_loan_id, payments_made }
--
-- Decision 3.3-1 (Simulation findings, confirmed 2026-10-23): Bonus loan
-- applications are open all year -- there is no application-time window
-- check here any more. The May/November restriction now applies only at
-- the Bookkeeper->Manager recommend step (loan_status -> 'recommended for
-- approval'), enforced by the enforce_bonus_loan_window trigger
-- (bonus_loan_window_trigger.sql), not here. (Superseded policy, for
-- history only: Q6/BONUS_LOAN_PLAN.md 2026-10-14 blocked applications
-- Dec-Apr/Jun-Oct only, closed May/November.)
-- Renewal threshold: 6 payments, matching RENEWAL_MIN_PAYMENTS = 6.

CREATE OR REPLACE FUNCTION public.get_loan_eligibility(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_renewal_min    int  := 6;

  -- active loan per type (most recent by disbursal_date / application_date)
  v_cons_id        text;
  v_cons_open_id   text;
  v_cons_open_status text;
  v_cons_payments  int := 0;
  v_emrg_id        text;
  v_emrg_open_id   text;
  v_emrg_open_status text;
  v_emrg_payments  int := 0;
  v_bonus_id       text;
  v_bonus_open_id  text;
  v_bonus_open_status text;
  v_bonus_payments int := 0;

  v_bucket_cons    jsonb;
  v_bucket_emrg    jsonb;
  v_bucket_bonus   jsonb;
BEGIN
  -- An application still in review blocks another of the same type. Keep
  -- this in sync with OPEN_APPLICATION_STATUSES in main.py. Check both status
  -- columns because older rows may have only one of them updated.
  SELECT l.control_number,
         CASE
           WHEN LOWER(COALESCE(l.loan_status, '')) = 'revision_requested'
             OR LOWER(COALESCE(l.application_status, '')) = 'revision_requested'
             THEN 'revision_requested'
           WHEN LOWER(COALESCE(l.loan_status, '')) = 'revised_submitted'
             OR LOWER(COALESCE(l.application_status, '')) = 'revised_submitted'
             THEN 'revised_submitted'
           WHEN LOWER(COALESCE(l.loan_status, '')) IN (
             'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
             'approved', 'ready for disbursement', 'to be disbursed'
           ) THEN LOWER(l.loan_status)
           ELSE LOWER(l.application_status)
         END
  INTO v_cons_open_id, v_cons_open_status
  FROM public.loans l
  JOIN public.loan_types lt ON lt.id = l.loan_type_id
  WHERE l.member_id = p_member_id
    AND (LOWER(lt.code) LIKE '%consolidated%' OR LOWER(lt.name) LIKE '%consolidated%')
    AND (
      LOWER(COALESCE(l.loan_status, '')) IN (
        'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
        'revision_requested', 'revised_submitted', 'approved', 'ready for disbursement', 'to be disbursed'
      )
      OR LOWER(COALESCE(l.application_status, '')) IN (
        'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
        'revision_requested', 'revised_submitted', 'approved', 'ready for disbursement', 'to be disbursed'
      )
    )
  ORDER BY l.application_date DESC NULLS LAST, l.control_number DESC
  LIMIT 1;

  SELECT l.control_number,
         CASE
           WHEN LOWER(COALESCE(l.loan_status, '')) = 'revision_requested'
             OR LOWER(COALESCE(l.application_status, '')) = 'revision_requested'
             THEN 'revision_requested'
           WHEN LOWER(COALESCE(l.loan_status, '')) = 'revised_submitted'
             OR LOWER(COALESCE(l.application_status, '')) = 'revised_submitted'
             THEN 'revised_submitted'
           WHEN LOWER(COALESCE(l.loan_status, '')) IN (
             'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
             'approved', 'ready for disbursement', 'to be disbursed'
           ) THEN LOWER(l.loan_status)
           ELSE LOWER(l.application_status)
         END
  INTO v_emrg_open_id, v_emrg_open_status
  FROM public.loans l
  JOIN public.loan_types lt ON lt.id = l.loan_type_id
  WHERE l.member_id = p_member_id
    AND (LOWER(lt.code) LIKE '%emergency%' OR LOWER(lt.name) LIKE '%emergency%')
    AND (
      LOWER(COALESCE(l.loan_status, '')) IN (
        'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
        'revision_requested', 'revised_submitted', 'approved', 'ready for disbursement', 'to be disbursed'
      )
      OR LOWER(COALESCE(l.application_status, '')) IN (
        'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
        'revision_requested', 'revised_submitted', 'approved', 'ready for disbursement', 'to be disbursed'
      )
    )
  ORDER BY l.application_date DESC NULLS LAST, l.control_number DESC
  LIMIT 1;

  SELECT l.control_number,
         CASE
           WHEN LOWER(COALESCE(l.loan_status, '')) = 'revision_requested'
             OR LOWER(COALESCE(l.application_status, '')) = 'revision_requested'
             THEN 'revision_requested'
           WHEN LOWER(COALESCE(l.loan_status, '')) = 'revised_submitted'
             OR LOWER(COALESCE(l.application_status, '')) = 'revised_submitted'
             THEN 'revised_submitted'
           WHEN LOWER(COALESCE(l.loan_status, '')) IN (
             'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
             'approved', 'ready for disbursement', 'to be disbursed'
           ) THEN LOWER(l.loan_status)
           ELSE LOWER(l.application_status)
         END
  INTO v_bonus_open_id, v_bonus_open_status
  FROM public.loans l
  JOIN public.loan_types lt ON lt.id = l.loan_type_id
  WHERE l.member_id = p_member_id
    AND (LOWER(lt.code) LIKE '%bonus%' OR LOWER(lt.name) LIKE '%bonus%')
    AND (
      LOWER(COALESCE(l.loan_status, '')) IN (
        'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
        'revision_requested', 'revised_submitted', 'approved', 'ready for disbursement', 'to be disbursed'
      )
      OR LOWER(COALESCE(l.application_status, '')) IN (
        'draft', 'pending', 'recommended for approval', 'recommended for bod approval',
        'revision_requested', 'revised_submitted', 'approved', 'ready for disbursement', 'to be disbursed'
      )
    )
  ORDER BY l.application_date DESC NULLS LAST, l.control_number DESC
  LIMIT 1;

  -- Latest active loan per type for this member.
  -- "active" = loan_status IN ('released','paid','partially paid')
  -- We join loan_types to classify by code/name just like FastAPI does.
  -- Postgres has no KEEP (DENSE_RANK LAST ...) (that's Oracle); ORDER BY ...
  -- DESC LIMIT 1 is the equivalent here, run once per type.
  SELECT l.control_number INTO v_cons_id
  FROM public.loans l
  JOIN public.loan_types lt ON lt.id = l.loan_type_id
  WHERE l.member_id = p_member_id
    AND (LOWER(lt.code) LIKE '%consolidated%' OR LOWER(lt.name) LIKE '%consolidated%')
    AND LOWER(l.loan_status) IN ('released','paid','partially paid')
  ORDER BY COALESCE(l.disbursal_date, l.application_date) DESC NULLS LAST
  LIMIT 1;

  SELECT l.control_number INTO v_emrg_id
  FROM public.loans l
  JOIN public.loan_types lt ON lt.id = l.loan_type_id
  WHERE l.member_id = p_member_id
    AND (LOWER(lt.code) LIKE '%emergency%' OR LOWER(lt.name) LIKE '%emergency%')
    AND LOWER(l.loan_status) IN ('released','paid','partially paid')
  ORDER BY COALESCE(l.disbursal_date, l.application_date) DESC NULLS LAST
  LIMIT 1;

  SELECT l.control_number INTO v_bonus_id
  FROM public.loans l
  JOIN public.loan_types lt ON lt.id = l.loan_type_id
  WHERE l.member_id = p_member_id
    AND (LOWER(lt.code) LIKE '%bonus%' OR LOWER(lt.name) LIKE '%bonus%')
    AND LOWER(l.loan_status) IN ('released','paid','partially paid')
  ORDER BY COALESCE(l.disbursal_date, l.application_date) DESC NULLS LAST
  LIMIT 1;

  -- Payment counts for each active loan (one query handles all three)
  IF v_cons_id IS NOT NULL OR v_emrg_id IS NOT NULL OR v_bonus_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE loan_id = v_cons_id),
      COUNT(*) FILTER (WHERE loan_id = v_emrg_id),
      COUNT(*) FILTER (WHERE loan_id = v_bonus_id)
    INTO v_cons_payments, v_emrg_payments, v_bonus_payments
    FROM public.loan_payments
    WHERE loan_id IN (v_cons_id, v_emrg_id, v_bonus_id);
  END IF;

  -- Build consolidated bucket
  IF v_cons_open_id IS NOT NULL THEN
    v_bucket_cons := jsonb_build_object(
      'loan_type', 'consolidated', 'can_apply_new', false, 'can_renew', false,
      'reason', 'You already have a consolidated application in progress (' || replace(v_cons_open_status, '_', ' ') || ').',
      'active_loan_id', v_cons_open_id, 'open_application_status', v_cons_open_status,
      'payments_made', 0
    );
  ELSIF v_cons_id IS NULL THEN
    v_bucket_cons := jsonb_build_object(
      'loan_type',      'consolidated',
      'can_apply_new',  true,
      'can_renew',      false,
      'reason',         'No active consolidated loan on record.',
      'active_loan_id', null,
      'payments_made',  0
    );
  ELSE
    v_bucket_cons := jsonb_build_object(
      'loan_type',      'consolidated',
      'can_apply_new',  false,
      'can_renew',      (v_cons_payments >= v_renewal_min),
      'reason',         'Active consolidated loan ' || v_cons_id || ' in repayment. ' ||
                        CASE WHEN v_cons_payments >= v_renewal_min
                             THEN 'Eligible for renewal.'
                             ELSE 'Needs ' || (v_renewal_min - v_cons_payments)::text || ' more monthly payment(s) before renewal.'
                        END,
      'active_loan_id', v_cons_id,
      'payments_made',  v_cons_payments
    );
  END IF;

  -- Build emergency bucket
  IF v_emrg_open_id IS NOT NULL THEN
    v_bucket_emrg := jsonb_build_object(
      'loan_type', 'emergency', 'can_apply_new', false, 'can_renew', false,
      'reason', 'You already have an emergency application in progress (' || replace(v_emrg_open_status, '_', ' ') || ').',
      'active_loan_id', v_emrg_open_id, 'open_application_status', v_emrg_open_status,
      'payments_made', 0
    );
  ELSIF v_emrg_id IS NULL THEN
    v_bucket_emrg := jsonb_build_object(
      'loan_type',      'emergency',
      'can_apply_new',  true,
      'can_renew',      false,
      'reason',         'No active emergency loan on record.',
      'active_loan_id', null,
      'payments_made',  0
    );
  ELSE
    v_bucket_emrg := jsonb_build_object(
      'loan_type',      'emergency',
      'can_apply_new',  false,
      'can_renew',      (v_emrg_payments >= v_renewal_min),
      'reason',         'Active emergency loan ' || v_emrg_id || ' in repayment. ' ||
                        CASE WHEN v_emrg_payments >= v_renewal_min
                             THEN 'Eligible for renewal.'
                             ELSE 'Needs ' || (v_renewal_min - v_emrg_payments)::text || ' more monthly payment(s) before renewal.'
                        END,
      'active_loan_id', v_emrg_id,
      'payments_made',  v_emrg_payments
    );
  END IF;

  -- Build bonus bucket (no application-time window -- decision 3.3-1)
  IF v_bonus_open_id IS NOT NULL THEN
    v_bucket_bonus := jsonb_build_object(
      'loan_type', 'bonus', 'can_apply_new', false, 'can_renew', false,
      'reason', 'You already have a bonus application in progress (' || replace(v_bonus_open_status, '_', ' ') || ').',
      'active_loan_id', v_bonus_open_id, 'open_application_status', v_bonus_open_status,
      'payments_made', 0
    );
  ELSIF v_bonus_id IS NULL THEN
    v_bucket_bonus := jsonb_build_object(
      'loan_type',      'bonus',
      'can_apply_new',  true,
      'can_renew',      false,
      'reason',         'No active bonus loan on record.',
      'active_loan_id', null,
      'payments_made',  0
    );
  ELSE
    v_bucket_bonus := jsonb_build_object(
      'loan_type',      'bonus',
      'can_apply_new',  false,
      'can_renew',      (v_bonus_payments >= v_renewal_min),
      'reason',         'Active bonus loan ' || v_bonus_id || ' in repayment. ' ||
                        CASE WHEN v_bonus_payments >= v_renewal_min
                             THEN 'Eligible for renewal.'
                             ELSE 'Needs ' || (v_renewal_min - v_bonus_payments)::text || ' more monthly payment(s) before renewal.'
                        END,
      'active_loan_id', v_bonus_id,
      'payments_made',  v_bonus_payments
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

-- Allow authenticated members to call this RPC
GRANT EXECUTE ON FUNCTION public.get_loan_eligibility(uuid) TO authenticated;
