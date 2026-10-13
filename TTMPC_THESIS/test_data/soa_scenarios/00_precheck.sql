-- SOA test scenarios -- STEP 0: read-only pre-check (LIVE database).
-- Changes nothing. Run each query in the Supabase SQL Editor and review the
-- output before running 01_seed.sql. 01_seed.sql repeats the critical checks
-- and aborts on its own, but this is where you SEE what is on the accounts.

-- 0.1  Email -> login -> member mapping. Expect exactly one row per email,
--      member_status 'active', and a non-null auth_user_id (needed to log in).
SELECT ma.email,
       ma.auth_user_id,
       ma.user_id            AS member_uuid,      -- = member.id = loans.member_id
       m.membership_id,                          -- TTMPC-xxx (text key, NOT loans.member_id)
       m.first_name, m.last_name,
       coalesce(m.member_status, 'active') AS member_status,
       ma.role
FROM public.member_account ma
JOIN public.member m ON m.id = ma.user_id
WHERE lower(ma.email) IN ('lynxridao@gmail.com',
                          'erdenjhed.teope@wvsu.edu.ph',
                          'serevee7@gmail.com')
ORDER BY ma.email;

-- 0.2  Existing loans on these members. ANY Consolidated row for accounts 1/2,
--      or Emergency row for account 3, that is not fully paid / cancelled is a
--      conflict -- 01_seed.sql will refuse to run. Decide what to do with it first.
SELECT ma.email, l.control_number, lt.code, l.loan_status, l.principal_amount,
       l.term, l.disbursal_date,
       (SELECT count(*) FROM public.loan_payments p
         WHERE p.loan_id = l.control_number)                      AS payments,
       (SELECT count(*) FROM public.loan_payments_legacy x
         WHERE x.loan_id = l.control_number)                      AS legacy_rows,
       (SELECT count(*) FROM public.loan_schedules s
         WHERE s.loan_id = l.control_number)                      AS schedules
FROM public.member_account ma
JOIN public.loans l       ON l.member_id = ma.user_id
JOIN public.loan_types lt ON lt.id = l.loan_type_id
WHERE lower(ma.email) IN ('lynxridao@gmail.com',
                          'erdenjhed.teope@wvsu.edu.ph',
                          'serevee7@gmail.com')
ORDER BY ma.email, l.disbursal_date NULLS LAST;

-- 0.3  Loan type rows the seed resolves by code. Expect CONSOLIDATED and EMERGENCY.
SELECT id, code, name, interest_rate FROM public.loan_types
WHERE upper(code) IN ('CONSOLIDATED', 'EMERGENCY');

-- 0.4  Triggers that will fire on the seed's inserts. Reviewed in README:
--      CBU sync fires only on a transition INTO 'released' (not on INSERT), the
--      receipt + ledger triggers only on UPDATE OF confirmation_status.
SELECT c.relname AS table_name, t.tgname, t.tgenabled
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname IN ('loans', 'loan_payments', 'loan_schedules')
  AND NOT t.tgisinternal
ORDER BY 1, 2;

-- 0.5  Already seeded? Expect 0.
SELECT count(*) AS existing_test_loans
FROM public.loans WHERE control_number LIKE 'TESTSOA-%';
