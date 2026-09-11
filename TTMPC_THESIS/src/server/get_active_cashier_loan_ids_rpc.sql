-- RPC: get_active_cashier_loan_ids
-- Speeds up GET /api/cashier/loan-payments/loans (main.py ~line 1268), which was
-- pulling the ENTIRE loans/loan_schedules/loan_payments/loan_payments_legacy
-- tables into Python on every request just to figure out which loans are
-- still collectible (10+ second loads once loan_schedules crossed 6,000+ rows).
--
-- This does the "active" filter directly in Postgres, using the existing
-- indexes: "active" = has at least one loan_schedules row with
-- schedule_status IN (Unpaid/Pending/Overdue).
--
-- NOTE (2026-09-11): this used to also dedupe to "only the latest loan per
-- (member_id, loan_type)", mirroring an older in-Python renewal dedup. That
-- logic silently hid any older, still-unpaid loan of the same type whenever
-- a member had more than one concurrent loan of that type (renewal chains
-- that were never cleanly closed out, or legitimate stacked loans) — a real
-- outstanding balance would vanish from the Cashier's list. Dedup was
-- dropped: every loan with a genuinely outstanding schedule is now returned,
-- regardless of how many the member has open of that type. A loan that was
-- properly superseded by a renewal has all its schedules marked Paid by
-- that renewal, so it naturally drops out of the EXISTS check below without
-- needing an explicit dedup step.
--
-- It intentionally does NOT reimplement penalty/grace/missed-count logic;
-- that business logic stays in Python (main.py), now running over a much
-- smaller, pre-filtered row set instead of full-table scans.
--
-- Returns: one row per active loan control_number, e.g.
--   [{ "control_number": "TTMPC-CN-000123" }, ...]

CREATE OR REPLACE FUNCTION public.get_active_cashier_loan_ids()
RETURNS TABLE (control_number varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Loans not rejected/cancelled that have at least one schedule row still
  -- outstanding. Mirrors the loan_schedules.schedule_status IN (...) filter
  -- that used to run in main.py, using the idx_loan_schedules_status /
  -- idx_loan_schedules_loan_id indexes. No per-member/type dedup — see note
  -- above.
  SELECT DISTINCT l.control_number
  FROM public.loans l
  WHERE lower(coalesce(l.loan_status, '')) NOT IN ('rejected', 'cancelled')
    AND EXISTS (
      SELECT 1
      FROM public.loan_schedules ls
      WHERE ls.loan_id = l.control_number
        AND lower(coalesce(ls.schedule_status, '')) IN ('unpaid', 'pending', 'overdue')
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_active_cashier_loan_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_cashier_loan_ids() TO service_role;
