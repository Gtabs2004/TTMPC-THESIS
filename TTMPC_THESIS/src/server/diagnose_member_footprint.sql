-- ============================================================================
-- DIAGNOSE: find every table holding data for ALL 11 test accounts at once.
-- Read-only. Does not delete anything. Returns a result set (Results grid).
-- Mirrors purge_test_accounts.sql's full coverage: member_id/auth_user_id/
-- member_account_id columns, membership_id/membership_number_id (type-aware),
-- loan_id (text, holding loans.control_number), loan_control_number
-- (loan_collateral), and koica_loans/member_applications by email.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.diagnose_footprint(v_target_auth_id UUID, v_target_email TEXT)
RETURNS TABLE(table_name TEXT, matched_column TEXT, column_type TEXT, row_count BIGINT) AS $$
DECLARE
  v_member_id UUID;
  v_member_account_id UUID;
  v_membership_id TEXT;
  rec RECORD;
  v_sql TEXT;
  v_count BIGINT;
BEGIN
  SELECT id INTO v_member_id FROM public.member WHERE auth_user_id = v_target_auth_id;
  SELECT user_id INTO v_member_account_id FROM public.member_account WHERE auth_user_id = v_target_auth_id;
  SELECT membership_id INTO v_membership_id FROM public.member WHERE auth_user_id = v_target_auth_id;

  IF v_membership_id IS NULL THEN
    SELECT membership_id INTO v_membership_id FROM public.member_account WHERE auth_user_id = v_target_auth_id;
  END IF;

  -- member.auth_user_id can be unlinked even when a real member row exists
  -- (verified live: dondonquixote7@gmail.com / TTMPC-298) — fall back to
  -- resolving member.id by the membership_id already found via member_account.
  IF v_member_id IS NULL AND v_membership_id IS NOT NULL THEN
    SELECT id INTO v_member_id FROM public.member WHERE membership_id = v_membership_id;
  END IF;

  RETURN QUERY SELECT '__TARGET__'::TEXT, format('member_id=%s member_account_id=%s membership_id=%s',
    v_member_id, v_member_account_id, v_membership_id)::TEXT, ''::TEXT, 0::BIGINT;

  FOR rec IN
    SELECT c.table_name AS tname, c.column_name AS cname, c.data_type AS ctype
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN (
        'member_id', 'auth_user_id', 'member_account_id',
        'membership_id', 'membership_number_id'
      )
    ORDER BY c.table_name, c.column_name
  LOOP
    v_count := NULL;

    IF rec.cname = 'member_id' AND rec.ctype = 'uuid' AND v_member_id IS NOT NULL THEN
      v_sql := format('SELECT count(*) FROM public.%I WHERE %I = %L', rec.tname, rec.cname, v_member_id);
    ELSIF rec.cname = 'auth_user_id' AND rec.ctype = 'uuid' AND v_target_auth_id IS NOT NULL THEN
      v_sql := format('SELECT count(*) FROM public.%I WHERE %I = %L', rec.tname, rec.cname, v_target_auth_id);
    ELSIF rec.cname = 'member_account_id' AND rec.ctype = 'uuid' AND v_member_account_id IS NOT NULL THEN
      v_sql := format('SELECT count(*) FROM public.%I WHERE %I = %L', rec.tname, rec.cname, v_member_account_id);
    ELSIF rec.cname IN ('membership_id', 'membership_number_id') THEN
      IF rec.ctype = 'uuid' AND v_member_id IS NOT NULL THEN
        v_sql := format('SELECT count(*) FROM public.%I WHERE %I = %L', rec.tname, rec.cname, v_member_id);
      ELSIF rec.ctype IN ('text', 'character varying') AND v_membership_id IS NOT NULL THEN
        v_sql := format('SELECT count(*) FROM public.%I WHERE %I = %L', rec.tname, rec.cname, v_membership_id);
      ELSE
        CONTINUE;
      END IF;
    ELSE
      CONTINUE;
    END IF;

    EXECUTE v_sql INTO v_count;
    IF v_count > 0 THEN
      table_name := rec.tname; matched_column := rec.cname; column_type := rec.ctype; row_count := v_count;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- loan_id-keyed tables: loans has no uuid id, PK is control_number
  -- (varchar), and every child loan_id column is text holding that value.
  IF v_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema='public' AND it.table_name='loans') THEN
    FOR rec IN
      SELECT c.table_name AS tname
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'loan_id'
    LOOP
      v_sql := format(
        'SELECT count(*) FROM public.%I WHERE loan_id IN (SELECT control_number FROM public.loans WHERE member_id = %L)',
        rec.tname, v_member_id
      );
      EXECUTE v_sql INTO v_count;
      IF v_count > 0 THEN
        table_name := rec.tname; matched_column := 'loan_id'; column_type := 'text'; row_count := v_count;
        RETURN NEXT;
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema='public' AND it.table_name='loan_collateral') THEN
      EXECUTE format(
        'SELECT count(*) FROM public.loan_collateral WHERE loan_control_number IN (SELECT control_number FROM public.loans WHERE member_id = %L)',
        v_member_id
      ) INTO v_count;
      IF v_count > 0 THEN
        table_name := 'loan_collateral'; matched_column := 'loan_control_number'; column_type := 'text'; row_count := v_count;
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  IF v_target_email IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema='public' AND it.table_name='koica_loans') THEN
    EXECUTE format('SELECT count(*) FROM public.koica_loans WHERE lower(user_email) = lower(%L)', v_target_email) INTO v_count;
    IF v_count > 0 THEN
      table_name := 'koica_loans'; matched_column := 'user_email'; column_type := 'text'; row_count := v_count;
      RETURN NEXT;
    END IF;
  END IF;

  IF v_target_email IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema='public' AND it.table_name='member_applications') THEN
    EXECUTE format('SELECT count(*) FROM public.member_applications WHERE lower(email) = lower(%L)', v_target_email) INTO v_count;
    IF v_count > 0 THEN
      table_name := 'member_applications'; matched_column := 'email'; column_type := 'text'; row_count := v_count;
      RETURN NEXT;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run across all 11 target accounts in one query, labeled by email.
WITH targets(auth_id, email) AS (
  VALUES
    ('632a2d7b-bf43-48c8-b71c-1f4d121158ed'::uuid, 'bulotaoloashleynicole@gmail.com'),
    ('9d6ec1a6-ddcf-41d3-b4d9-e96bc6994b9e'::uuid, 'dondonquixote7@gmail.com'),
    ('b3ab3448-0c45-4c9c-9024-c0ba96b793c3'::uuid, 'ejhedteope@gmail.com'),
    ('be1e5f88-04d7-45a8-aa45-d92d13f6f0c3'::uuid, 'erdenjhed.teope@wvsu.edu.ph'),
    ('3f38c77f-e867-415a-b35a-b9f226bf6d1a'::uuid, 'gtabs2004@gmail.com'),
    ('50a8c0f5-6253-46f5-8bd2-99f6682b3bb1'::uuid, 'jibozai2004@gmail.com'),
    ('cde1a326-7edd-4fb2-a958-8562054c7cc3'::uuid, 'kirigayalynx@gmail.com'),
    ('3592a9eb-ea5e-45e7-8fa4-c03dd9e7d368'::uuid, 'lynxridao@gmail.com'),
    ('0f068353-dc68-4def-9067-c81de277a93f'::uuid, 'nashervine.siaton@wvsu.edu.ph'),
    ('e6570ddf-9338-48ee-8045-af19f410c165'::uuid, 'nashervinesiaton@gmail.com'),
    ('ee051661-17ee-43f4-a1ee-abe9a091cded'::uuid, 'sereevee7@gmail.com')
)
SELECT t.email AS account, f.*
FROM targets t
CROSS JOIN LATERAL pg_temp.diagnose_footprint(t.auth_id, t.email) f
ORDER BY t.email, f.table_name;
