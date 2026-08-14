-- =============================================================================
-- Add RLS policies for tables flagged by Supabase's rls_enabled_no_policy
-- linter. RLS is ON everywhere in this DB but seven tables had zero policies,
-- meaning PostgREST silently returned empty rows for every authenticated
-- request. That produced two problems:
--   • Member/BOD/Manager dashboards that read loan_schedules or
--     Savings_Transactions were quietly returning nothing.
--   • The linter flagged the tables as unintentional deny-all, hiding real
--     "should be locked down" tables in the same list.
--
-- This file makes intent explicit per table. Idempotent — safe to re-run.
-- Run in Supabase SQL editor.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. loan_schedules — read-only for any authenticated user.
--    Writes come from loan-lifecycle triggers running under postgres role
--    (which bypasses RLS), so no INSERT/UPDATE policy is needed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_schedules_read_authenticated ON public.loan_schedules;
CREATE POLICY loan_schedules_read_authenticated
ON public.loan_schedules
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.loan_schedules TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Savings_Transactions — legacy CamelCase table read by Member Dashboard.
--    Members read only their own row (scoped by membership_number_id). Staff
--    accounts read everything so the Cashier savings screens still work.
--
--    NOTE: the member scoping assumes member_account.membership_id ==
--    Savings_Transactions.membership_number_id. Verified against the current
--    Member_Dashboard.jsx query on line 392.
-- ---------------------------------------------------------------------------
ALTER TABLE public."Savings_Transactions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS savings_transactions_read_own_or_staff
    ON public."Savings_Transactions";
CREATE POLICY savings_transactions_read_own_or_staff
ON public."Savings_Transactions"
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.member_account ma
        WHERE (ma.auth_user_id = auth.uid() OR ma.user_id = auth.uid())
          AND (
              ma.membership_id = public."Savings_Transactions".membership_number_id
              OR lower(coalesce(ma.role, '')) IN
                 ('cashier', 'bookkeeper', 'manager', 'treasurer', 'bod', 'secretary')
          )
    )
);

GRANT SELECT ON public."Savings_Transactions" TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. disbursement_confirmations — Treasurer/Cashier read + write.
--    Client screens hit this via the FastAPI backend which uses the service
--    role and bypasses RLS entirely; policies here are the defense-in-depth
--    layer in case anyone flips a screen to talk to Supabase directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.disbursement_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS disbursement_confirmations_staff_all
    ON public.disbursement_confirmations;
CREATE POLICY disbursement_confirmations_staff_all
ON public.disbursement_confirmations
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.member_account ma
        WHERE (ma.auth_user_id = auth.uid() OR ma.user_id = auth.uid())
          AND lower(coalesce(ma.role, '')) IN
              ('treasurer', 'cashier', 'bookkeeper', 'manager', 'bod')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.member_account ma
        WHERE (ma.auth_user_id = auth.uid() OR ma.user_id = auth.uid())
          AND lower(coalesce(ma.role, '')) IN
              ('treasurer', 'cashier', 'bookkeeper', 'manager', 'bod')
    )
);

-- ---------------------------------------------------------------------------
-- 4. loan_email_log — backend-only. Only the FastAPI Resend notifier writes
--    here (service role, bypasses RLS). No client should see raw email
--    payloads. Add an explicit deny-all policy so intent is documented and
--    the linter treats it as covered.
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_email_log_deny_all ON public.loan_email_log;
CREATE POLICY loan_email_log_deny_all
ON public.loan_email_log
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.loan_email_log FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. salary_schedule — payroll release calendar. Any authenticated staff or
--    member may read (used for loan amortization "next payday" hints).
--    Writes are BOD-only via the policy editor (future scope) — for now
--    deny client writes and let the backend service role manage.
-- ---------------------------------------------------------------------------
ALTER TABLE public.salary_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_schedule_read_authenticated ON public.salary_schedule;
CREATE POLICY salary_schedule_read_authenticated
ON public.salary_schedule
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.salary_schedule TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. member_import_stage — one-off staging table for the legacy member
--    import. Not used at runtime. Explicit deny + revoke grants.
--
--    ACTION FOR OPS: once the reconstruction is finished, run
--        DROP TABLE public.member_import_stage;
--    to remove the table entirely.
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_import_stage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_import_stage_deny_all ON public.member_import_stage;
CREATE POLICY member_import_stage_deny_all
ON public.member_import_stage
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.member_import_stage FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. loans_member_id_backup_20260730 — snapshot from the July 2026 loan
--    reconstruction migration. Kept for rollback safety, never queried by
--    the app. Same deny-all + revoke treatment.
--
--    ACTION FOR OPS: once you're confident the reconstruction is stable,
--    drop the backup table:
--        DROP TABLE public.loans_member_id_backup_20260730;
-- ---------------------------------------------------------------------------
ALTER TABLE public.loans_member_id_backup_20260730 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loans_member_id_backup_deny_all
    ON public.loans_member_id_backup_20260730;
CREATE POLICY loans_member_id_backup_deny_all
ON public.loans_member_id_backup_20260730
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.loans_member_id_backup_20260730 FROM anon, authenticated;

COMMIT;
