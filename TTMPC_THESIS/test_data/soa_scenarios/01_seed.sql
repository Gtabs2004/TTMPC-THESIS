-- SOA test scenarios -- STEP 1: seed (LIVE database).
--
-- Creates, per scenario, the end state the app itself would have produced:
--   loans row (released -> partially paid), one loan_schedules row per settled
--   installment (Paid) plus the single open row (Unpaid), one validated
--   loan_payments row per settled installment, and its loan_payment_ledger row.
--
-- Deliberately NOT created:
--   * loan_payments_legacy rows  -- they would exempt the loan from penalties
--   * loan_penalties rows        -- the app must accrue them itself (the test)
--   * receipts                   -- would consume real LIVE receipt numbers
--   * rows for missed installments -- the app keeps ONE open row per loan;
--     scenario 2's two misses are represented by open row #7 being 59 days past due
--
-- Every row is tagged TESTSOA (control_number / schedule_id / payment_reference)
-- so 99_rollback.sql can remove exactly these rows. All-or-nothing: any failed
-- check raises and the whole transaction rolls back.
--
-- Test date: 2026-10-13. Due dates are on the 15th; payments on the 13th.

BEGIN;

CREATE TEMP TABLE _soa_scn (
  n          int,
  email      text,
  ctrl       text,
  type_code  text,
  principal  numeric,
  term       int,
  rate_pct   numeric,   -- monthly rate in PERCENT, as loans.interest_rate stores it
  paid       int,       -- settled installments
  disbursal  date,
  first_due  date
) ON COMMIT DROP;

INSERT INTO _soa_scn VALUES
  (1, 'lynxridao@gmail.com',         'TESTSOA-CL-0001', 'CONSOLIDATED', 300000, 24, 0.83,  9, '2025-12-15', '2026-01-15'),
  (2, 'erdenjhed.teope@wvsu.edu.ph', 'TESTSOA-CL-0002', 'CONSOLIDATED', 200000, 24, 0.83,  6, '2026-01-15', '2026-02-15'),
  (3, 'serevee7@gmail.com',          'TESTSOA-EL-0003', 'EMERGENCY',     20000, 12, 2.00, 10, '2025-11-15', '2025-12-15');

DO $$
DECLARE
  s           record;
  v_member    uuid;
  v_n_acc     int;
  v_status    text;
  v_lt        public.loans.loan_type_id%TYPE;
  v_conflict  text;
  r           numeric;
  k           int;
  v_due       date;
  v_paid_at   timestamptz;
  -- per-installment values
  pc          numeric;  ic numeric;  amt numeric;  rem numeric;
  -- emergency centavo arithmetic (mirrors build_single_schedule_row)
  pc_cents    bigint;   bal_cents bigint;  p_cents bigint;  end_cents bigint;  i_cents bigint;
  v_total_int numeric;
  v_amort     numeric;
  v_sched     uuid;
  v_pay       uuid;
  v_ref       text;
BEGIN
  FOR s IN SELECT * FROM _soa_scn ORDER BY n LOOP
    r := s.rate_pct / 100;

    -- ---- guards -----------------------------------------------------------
    IF EXISTS (SELECT 1 FROM public.loans WHERE control_number = s.ctrl) THEN
      RAISE EXCEPTION 'Scenario %: % already exists. Run 99_rollback.sql first.', s.n, s.ctrl;
    END IF;

    SELECT count(*), max(ma.user_id::text)::uuid INTO v_n_acc, v_member
    FROM public.member_account ma WHERE lower(ma.email) = lower(s.email);
    IF v_n_acc <> 1 OR v_member IS NULL THEN
      RAISE EXCEPTION 'Scenario %: % resolves to % member_account rows (need exactly 1).', s.n, s.email, v_n_acc;
    END IF;

    SELECT lower(coalesce(member_status, 'active')) INTO v_status
    FROM public.member WHERE id = v_member;
    IF v_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'Scenario %: member % is %, not active.', s.n, s.email, coalesce(v_status, 'missing');
    END IF;

    SELECT id INTO v_lt FROM public.loan_types WHERE upper(code) = s.type_code LIMIT 1;
    IF v_lt IS NULL THEN
      RAISE EXCEPTION 'Scenario %: loan type % not found.', s.n, s.type_code;
    END IF;

    SELECT string_agg(l.control_number || ' (' || coalesce(l.loan_status, '?') || ')', ', ')
      INTO v_conflict
    FROM public.loans l
    WHERE l.member_id = v_member
      AND l.loan_type_id = v_lt
      AND lower(coalesce(l.loan_status, '')) NOT IN
          ('fully paid', 'cancelled', 'rejected', 'declined', 'closed', 'completed');
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Scenario %: % already has an open % loan: %. Stopping -- not replacing real loans.',
        s.n, s.email, s.type_code, v_conflict;
    END IF;

    -- ---- loan-level totals ------------------------------------------------
    IF s.type_code = 'EMERGENCY' THEN
      pc_cents := floor(s.principal * 100 / s.term);
      bal_cents := round(s.principal * 100);
      v_total_int := 0;
      FOR k IN 1..s.term LOOP
        p_cents  := CASE WHEN k >= s.term THEN bal_cents ELSE least(pc_cents, bal_cents) END;
        end_cents := bal_cents - p_cents;
        v_total_int := v_total_int + round(end_cents * r) / 100;
        IF k = 1 THEN v_amort := (p_cents + round(end_cents * r)) / 100; END IF;
        bal_cents := end_cents;
      END LOOP;
    ELSE
      pc := round(s.principal / s.term, 2);
      ic := round(s.principal * r, 2);
      v_amort := pc + ic;
      v_total_int := ic * s.term;
    END IF;

    INSERT INTO public.loans (
      control_number, member_id, loan_type_id, loan_amount, principal_amount,
      interest_rate, term, loan_status, application_status, application_type,
      application_date, disbursal_date, payment_start_date,
      user_email, loan_purpose, monthly_amortization, total_interest,
      created_at, updated_at
    ) VALUES (
      s.ctrl, v_member, v_lt, s.principal, s.principal,
      s.rate_pct, s.term, 'released', 'released', 'new',
      (s.disbursal - 7)::timestamptz, (s.disbursal + time '10:00') AT TIME ZONE 'Asia/Manila', s.first_due,
      s.email, 'TESTSOA scenario ' || s.n || ' (test data, see test_data/soa_scenarios)',
      v_amort, v_total_int,
      now(), now()
    );

    -- ---- schedule rows + payments ----------------------------------------
    bal_cents := round(s.principal * 100);
    pc_cents  := floor(s.principal * 100 / s.term);
    FOR k IN 1..(s.paid + 1) LOOP
      v_due := s.first_due + make_interval(months => k - 1);

      IF s.type_code = 'EMERGENCY' THEN
        p_cents   := CASE WHEN k >= s.term THEN bal_cents ELSE least(pc_cents, bal_cents) END;
        end_cents := bal_cents - p_cents;
        i_cents   := round(end_cents * r);
        pc  := p_cents / 100.0;
        ic  := i_cents / 100.0;
        amt := (p_cents + i_cents) / 100.0;
        rem := end_cents / 100.0;
        bal_cents := end_cents;
      ELSE
        pc  := round(s.principal / s.term, 2);
        ic  := round(s.principal * r, 2);
        amt := pc + ic;
        rem := greatest(s.principal - k * pc, 0);
      END IF;

      INSERT INTO public.loan_schedules (
        schedule_id, loan_id, installment_no, due_date,
        expected_amount, expected_principal, expected_interest, penalty,
        remaining_principal, principal_component, interest_component,
        carried_arrears, applied_credit, schedule_status
      ) VALUES (
        'TESTSOA_SI_' || s.n || '_' || lpad(k::text, 2, '0'), s.ctrl, k, v_due,
        amt, pc, ic, CASE WHEN s.type_code ILIKE '%BONUS%' THEN 1 ELSE 2 END,
        rem, pc, ic,
        0, 0, CASE WHEN k <= s.paid THEN 'Paid' ELSE 'Unpaid' END
      )
      RETURNING id INTO v_sched;

      IF k <= s.paid THEN
        v_paid_at := ((v_due - 2) + time '09:00') AT TIME ZONE 'Asia/Manila';
        v_ref := 'TESTSOA-' || s.n || '-' || lpad(k::text, 2, '0');

        INSERT INTO public.loan_payments (
          loan_id, schedule_id, amount_paid, payment_date, penalties, deficiency,
          confirmation_status, entered_by_role, payment_reference, transaction_reference,
          confirmed_at, reviewed_at, validation_notes,
          applied_to_penalty, applied_to_arrears, applied_to_current, applied_to_credit
        ) VALUES (
          s.ctrl, v_sched, amt, v_paid_at, 0, 0,
          'validated', 'system', v_ref, v_ref || '_TXN',
          v_paid_at, v_paid_at, 'TESTSOA seed -- simulated on-time installment',
          0, 0, amt, 0
        )
        RETURNING id INTO v_pay;

        -- Inserting as validated skips the UPDATE-only ledger trigger, so write
        -- the ledger row it would have written.
        INSERT INTO public.loan_payment_ledger (
          payment_id, loan_id, schedule_id, payment_reference, transaction_reference,
          amount_paid, penalties, total_collected, posted_at, notes
        ) VALUES (
          v_pay, s.ctrl, v_sched, v_ref, v_ref || '_TXN',
          amt, 0, amt, v_paid_at, 'TESTSOA seed'
        );
      END IF;
    END LOOP;

    -- Same end state the ledger trigger produces after a validated payment.
    -- released -> partially paid does NOT fire the CBU sync (it only fires on
    -- a transition INTO 'released').
    UPDATE public.loans
    SET loan_status = 'partially paid', application_status = 'partially paid', updated_at = now()
    WHERE control_number = s.ctrl;

    RAISE NOTICE 'Scenario % seeded: % for % (% paid, open installment #%).',
      s.n, s.ctrl, s.email, s.paid, s.paid + 1;
  END LOOP;
END $$;

-- Summary of what was written (any failed guard above already aborted everything).
SELECT l.control_number, l.loan_status, l.principal_amount, l.term,
       l.monthly_amortization, l.total_interest,
       count(s.*) FILTER (WHERE s.schedule_status = 'Paid')   AS paid_rows,
       count(s.*) FILTER (WHERE s.schedule_status = 'Unpaid') AS open_rows,
       (SELECT count(*) FROM public.loan_payments p WHERE p.loan_id = l.control_number) AS payments
FROM public.loans l
JOIN public.loan_schedules s ON s.loan_id = l.control_number
WHERE l.control_number LIKE 'TESTSOA-%'
GROUP BY l.control_number, l.loan_status, l.principal_amount, l.term,
         l.monthly_amortization, l.total_interest
ORDER BY 1;

COMMIT;
