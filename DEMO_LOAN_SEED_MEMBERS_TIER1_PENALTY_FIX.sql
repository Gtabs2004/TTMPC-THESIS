-- Fix for TTMPC-307 Edwin R. Bermejo's penalty scenario (CL-20260410-9307).
-- DEMO_LOAN_SEED_MEMBERS_TIER1.sql set loan_schedules.penalty = 4796.80 directly,
-- but the app's actual source of truth for a collectible penalty is the
-- loan_penalties table (see accrue_loan_penalties() / _unpaid_penalty_total() in
-- main.py, which sums unpaid loan_penalties rows -- NOT loan_schedules.penalty).
-- Without matching loan_penalties rows, the Bookkeeper/Cashier screens would show
-- this loan as having no penalty to collect, despite the column value.
--
-- Per main.py's own comment: "One charge for the 3rd missed month as soon as its
-- due date passes, then one additional charge per completed month after that."
-- Grace period/schedule in the seed: released 2026-04-10, first due 2026-05-25,
-- "5 months unpaid" = due dates May, Jun, Jul, Aug, Sep 25 all missed. Penalty
-- charges fire starting the 3rd missed due date (Jul 25) through the most recent
-- completed month (Sep 25) = 3 charges, not 5. Base = one installment
-- (4996.67, per compute_loan_penalty's "min(installment_amount, remaining_balance)"
-- for a non-Bonus loan), rate 2% (Consolidated/Emergency penalty rate).
--   4996.67 * 0.02 = 99.9334 -> rounds to 99.93 per missed month charge.
-- The seed's lump "4796.80" figure (used only as the loan_schedules.penalty
-- display column) does not match this per-charge model; this fix replaces that
-- single number with the three real loan_penalties rows the app actually reads,
-- and corrects loan_schedules.penalty to the sum of those charges for consistency.

begin;
set local session_replication_role = 'replica';

insert into public.loan_penalties (
  loan_id, schedule_id, period_due_date, installment_no, amount,
  basis_balance, rate_percent, is_paid
)
select
  'CL-20260410-9307',
  (select id from public.loan_schedules where loan_id = 'CL-20260410-9307' and installment_no = 1),
  d, 1, 99.93, 4996.67, 2.00, false
from (values (date '2026-07-25'), (date '2026-08-25'), (date '2026-09-25')) as t(d);

update public.loan_schedules
set penalty = 99.93 * 3
where loan_id = 'CL-20260410-9307' and installment_no = 1;

commit;

-- Verify:
select period_due_date, amount, is_paid from public.loan_penalties
where loan_id = 'CL-20260410-9307' order by period_due_date;
-- Expect 3 rows, 99.93 each, is_paid = false.
