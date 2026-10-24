-- Time deposit for TTMPC-302 Ramon S. Villanueva: P200,000, 12-month (365-day)
-- term. Chosen as a deliberate contrast on his account -- he's the "high risk,
-- >P500k Consolidated loan, BOD route" member (DEMO_ACCOUNT_PLAN.md), so a solid
-- time deposit alongside that gives a realistic, slightly more nuanced financial
-- picture rather than a flat "risky member" stereotype.
--
-- Funded directly (not debited from his small savings balance, per the decision
-- to treat TD funding as a separate capital source, matching how the real
-- Cashier TD screen lets a member fund a TD from cash/other sources, not only
-- from their own savings_accounts balance).
--
-- Rate bracket: TD_12M, 365 days, P200,000-P499,999.99 -> 2.5% annual
-- (from deposit_interest_policy_tiers, time_deposit_01_schema.sql lines 33-36).
-- Interest = principal * rate * (term_days/365) = 200000 * 0.025 * 1 = 5000.00
-- Maturity value = 205000.00
--
-- Placed 2026-04-24 (6 months before today, 2026-10-24) so it's mid-cycle --
-- neither brand new nor close to maturity, a realistic "has an open TD" state
-- for the Bookkeeper/Cashier screens to show without a pending maturity action.

begin;
set local session_replication_role = 'replica';

insert into public.time_deposits (
  certificate_number, member_id, cycle_number, placement_date, maturity_date,
  principal, term_days, annual_rate, rate_bracket_min, rate_bracket_max,
  rate_bracket_label, expected_interest, expected_maturity_value, status,
  funding_source, funding_reference
) values (
  'TD-TTMPC-302-001', 'c6372942-1d99-4733-8884-5c95c3c7ee99', 1,
  date '2026-04-24', date '2027-04-24',
  200000.00, 365, 0.025, 200000.00, 499999.99,
  'PHP 200,000.00-PHP 499,999.99', 5000.00, 205000.00, 'locked',
  'cash', 'TD-FUND-TTMPC-302-001'
);

insert into public.time_deposit_ledger (
  time_deposit_id, entry_type, amount, reference, idempotency_key, posted_at
)
select id, 'placement', 200000.00, 'TD-FUND-TTMPC-302-001', 'TD-TTMPC-302-001-PLACEMENT', '2026-04-24'::timestamptz
from public.time_deposits where certificate_number = 'TD-TTMPC-302-001';

insert into public.time_deposit_status_history (
  time_deposit_id, old_status, new_status, reason, changed_at
)
select id, null, 'locked', 'Initial placement', '2026-04-24'::timestamptz
from public.time_deposits where certificate_number = 'TD-TTMPC-302-001';

commit;

-- Verify:
select certificate_number, principal, annual_rate, maturity_date, status,
  expected_interest, expected_maturity_value
from public.time_deposits where certificate_number = 'TD-TTMPC-302-001';
