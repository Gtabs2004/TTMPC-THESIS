-- =============================================================================
-- TEST for loan_payments_restrict_select_rls.sql
-- RUN IN: TEST project SQL Editor, AFTER applying the fix there.
-- Changes nothing (read-only). Works without login accounts: it pretends to be
-- a real member / staff user by setting the same login details Supabase would.
-- =============================================================================
-- It picks automatically:
--   * a MEMBER (non-staff account) who has loan payments
--   * a STAFF account (manager/bod/bookkeeper/treasurer/cashier)
--   * an OUTSIDER (a logged-in id that matches no account)
-- then counts what each can see in the 3 tables and the statement view.
-- Every line of the result should say PASS.
-- =============================================================================

DROP TABLE IF EXISTS rls_test_result;
CREATE TEMP TABLE rls_test_result (
    n        int,
    who      text,
    check_   text,
    expected text,
    actual   text,
    result   text
);
GRANT ALL ON rls_test_result TO authenticated;

DO $test$
DECLARE
    v_staff_roles text[] := ARRAY['manager', 'bod', 'bookkeeper', 'treasurer', 'cashier'];
    m   record;   -- member
    s   record;   -- staff
    v_tables text[] := ARRAY['loan_payments', 'loan_payment_ledger', 'loan_payments_legacy'];
    v_t      text;
    v_total  bigint;
    v_own    bigint;
    v_seen   bigint;
    v_n      int := 0;
    v_own_soa  bigint;
    v_total_soa bigint;
BEGIN
    -- Pick a member who has payments (prefer one with new-system payments)
    SELECT ma.auth_user_id, ma.user_id, ma.email, ma.role INTO m
    FROM public.member_account ma
    WHERE ma.auth_user_id IS NOT NULL
      AND lower(coalesce(ma.role, '')) <> ALL (v_staff_roles)
      AND EXISTS (SELECT 1 FROM public.loans l
                  WHERE l.member_id = ma.user_id
                    AND (EXISTS (SELECT 1 FROM public.loan_payments p WHERE p.loan_id = l.control_number)
                      OR EXISTS (SELECT 1 FROM public.loan_payments_legacy p WHERE p.loan_id = l.control_number)))
    ORDER BY (SELECT count(*) FROM public.loan_payments p
              JOIN public.loans l ON l.control_number = p.loan_id
              WHERE l.member_id = ma.user_id) DESC
    LIMIT 1;

    SELECT ma.auth_user_id, ma.user_id, ma.email, ma.role INTO s
    FROM public.member_account ma
    WHERE ma.auth_user_id IS NOT NULL
      AND lower(coalesce(ma.role, '')) = ANY (v_staff_roles)
    LIMIT 1;

    IF m.auth_user_id IS NULL OR s.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Could not find a member with payments and a staff account to test with.';
    END IF;

    FOREACH v_t IN ARRAY v_tables LOOP
        -- Expected numbers, counted as the database owner (no RLS)
        EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_total;
        EXECUTE format(
            'SELECT count(*) FROM public.%I p JOIN public.loans l ON l.control_number = p.loan_id
             WHERE l.member_id = $1 OR lower(coalesce(l.user_email, '''')) = lower($2)', v_t)
        INTO v_own USING m.user_id, m.email;

        -- As the MEMBER
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', m.auth_user_id, 'email', m.email, 'role', 'authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', m.auth_user_id::text, true);
        PERFORM set_config('request.jwt.claim.email', coalesce(m.email, ''), true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_seen;
        EXECUTE 'RESET ROLE';
        v_n := v_n + 1;
        INSERT INTO rls_test_result VALUES (v_n, 'Member', v_t || ': sees only own rows',
            v_own || ' of ' || v_total, v_seen::text,
            CASE WHEN v_seen = v_own THEN 'PASS' ELSE 'FAIL' END);

        -- As STAFF
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', s.auth_user_id, 'email', s.email, 'role', 'authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', s.auth_user_id::text, true);
        PERFORM set_config('request.jwt.claim.email', coalesce(s.email, ''), true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_seen;
        EXECUTE 'RESET ROLE';
        v_n := v_n + 1;
        INSERT INTO rls_test_result VALUES (v_n, 'Staff (' || s.role || ')', v_t || ': sees all rows',
            v_total::text, v_seen::text,
            CASE WHEN v_seen = v_total THEN 'PASS' ELSE 'FAIL' END);

        -- As an OUTSIDER (logged in, but no account)
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', gen_random_uuid(), 'email', 'nobody@example.invalid', 'role', 'authenticated')::text, true);
        PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
        PERFORM set_config('request.jwt.claim.email', 'nobody@example.invalid', true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_seen;
        EXECUTE 'RESET ROLE';
        v_n := v_n + 1;
        INSERT INTO rls_test_result VALUES (v_n, 'Outsider', v_t || ': sees nothing',
            '0', v_seen::text,
            CASE WHEN v_seen = 0 THEN 'PASS' ELSE 'FAIL' END);
    END LOOP;

    -- Statement of account view (member screen) still works for the member
    SELECT count(*) INTO v_total_soa FROM public.member_statement_of_account;
    SELECT count(*) INTO v_own_soa FROM public.member_statement_of_account WHERE member_id = m.user_id;

    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', m.auth_user_id, 'email', m.email, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', m.auth_user_id::text, true);
    PERFORM set_config('request.jwt.claim.email', coalesce(m.email, ''), true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_seen FROM public.member_statement_of_account;
    EXECUTE 'RESET ROLE';
    v_n := v_n + 1;
    INSERT INTO rls_test_result VALUES (v_n, 'Member', 'statement of account: own rows only',
        v_own_soa || ' of ' || v_total_soa, v_seen::text,
        CASE WHEN v_seen = v_own_soa AND v_own_soa > 0 THEN 'PASS' ELSE 'FAIL' END);
END
$test$;

SELECT n, who, check_ AS "check", expected, actual, result
FROM rls_test_result
ORDER BY n;
