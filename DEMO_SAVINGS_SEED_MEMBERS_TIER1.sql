-- Savings accounts + deposit history + withdrawal scenarios for the 11 Tier 1
-- members (TTMPC-297-307). Checked first: none of the 11 had a savings_accounts
-- row at all, so this builds from scratch.
--
-- Pattern: savings_accounts.balance is the running total; savings_ledger is the
-- posted history (deposits, confirmed withdrawals); savings_transaction_queue is
-- where a withdrawal REQUEST sits while pending_verification -- balance is only
-- reduced once the Bookkeeper confirms it (per the live app's own withdrawal flow:
-- "Deposits post at once; withdrawals wait for the Bookkeeper, and the balance
-- changes only on confirmation").
--
-- 3 of the 11 get a pending withdrawal in the queue (balance NOT yet reduced,
-- matching the real pending state): TTMPC-301 Ana, TTMPC-303 Mark, TTMPC-307 Edwin
-- -- chosen because they already have other open/active scenarios (new loan,
-- override request, penalty) so a pending withdrawal adds another live item to
-- show on their accounts without conflicting with anything already seeded.
--
-- member_uuid reference (same as DEMO_LOAN_SEED_MEMBERS_TIER1.sql):
--   TTMPC-301 7febd8cc-f62f-427b-8ec3-c2f93c698a39   TTMPC-302 c6372942-1d99-4733-8884-5c95c3c7ee99
--   TTMPC-297 4580955d-ceda-4d80-bbb2-dd51a852ea4a   TTMPC-299 207b314e-ee7c-4cc2-9c72-25d59742a90e
--   TTMPC-300 e095cc91-82ca-4963-8677-706ba16a1338   TTMPC-303 f6b22908-5ac8-4e50-9eff-f1e00b400a53
--   TTMPC-304 2c7d1119-d5fa-4414-bf3f-e23eca1930b1   TTMPC-305 a753cade-b64c-4bb8-ae0c-c35a0fa5c1f7
--   TTMPC-298 b9bc69a4-83af-4f9d-b690-8395e8aaa5c2   TTMPC-306 c50f3fd8-9a29-407b-bc7c-d3192a1f176b
--   TTMPC-307 2952fa4f-03da-4e97-a135-54e3277425ac

begin;
set local session_replication_role = 'replica';

insert into public.savings_accounts (
  account_number, account_name, member_id, account_kind, balance, status
) values
  ('SA-TTMPC-301', 'Ana L. Dela Cruz',      '7febd8cc-f62f-427b-8ec3-c2f93c698a39', 'member', 8000.00, 'active'),
  ('SA-TTMPC-302', 'Ramon S. Villanueva',   'c6372942-1d99-4733-8884-5c95c3c7ee99', 'member', 15000.00, 'active'),
  ('SA-TTMPC-297', 'Liza M. Gonzaga',       '4580955d-ceda-4d80-bbb2-dd51a852ea4a', 'member', 25000.00, 'active'),
  ('SA-TTMPC-299', 'Joel B. Castillo',      '207b314e-ee7c-4cc2-9c72-25d59742a90e', 'member', 12000.00, 'active'),
  ('SA-TTMPC-300', 'Grace D. Tolentino',    'e095cc91-82ca-4963-8677-706ba16a1338', 'member', 18000.00, 'active'),
  ('SA-TTMPC-303', 'Mark J. Salazar',       'f6b22908-5ac8-4e50-9eff-f1e00b400a53', 'member', 9500.00, 'active'),
  ('SA-TTMPC-304', 'Dennis F. Paredes',     '2c7d1119-d5fa-4414-bf3f-e23eca1930b1', 'member', 7000.00, 'active'),
  ('SA-TTMPC-305', 'Noel V. Catalan',       'a753cade-b64c-4bb8-ae0c-c35a0fa5c1f7', 'member', 10500.00, 'active'),
  ('SA-TTMPC-298', 'Shiela A. Lopez',       'b9bc69a4-83af-4f9d-b690-8395e8aaa5c2', 'member', 6500.00, 'active'),
  ('SA-TTMPC-306', 'Ricky D. Gallo',        'c50f3fd8-9a29-407b-bc7c-d3192a1f176b', 'member', 11000.00, 'active'),
  ('SA-TTMPC-307', 'Edwin R. Bermejo',      '2952fa4f-03da-4e97-a135-54e3277425ac', 'member', 4000.00, 'active');

-- Deposit history: 3 postings per account (opening + 2 deposits), running
-- balance ending at the balance set above.
insert into public.savings_ledger (
  account_number, entry_type, amount, running_balance, reference, source, posted_at
)
select v.account_number, e.entry_type, e.amount, e.running_balance, e.reference, 'cashier', e.posted_at
from (values
  ('SA-TTMPC-301', 8000.00), ('SA-TTMPC-302', 15000.00), ('SA-TTMPC-297', 25000.00),
  ('SA-TTMPC-299', 12000.00), ('SA-TTMPC-300', 18000.00), ('SA-TTMPC-303', 9500.00),
  ('SA-TTMPC-304', 7000.00), ('SA-TTMPC-305', 10500.00), ('SA-TTMPC-298', 6500.00),
  ('SA-TTMPC-306', 11000.00), ('SA-TTMPC-307', 4000.00)
) as v(account_number, final_balance)
cross join lateral (
  values
    ('credit', v.final_balance * 0.4, v.final_balance * 0.4, 'SAV-OPEN-' || v.account_number, '2026-08-25'::timestamptz),
    ('credit', v.final_balance * 0.3, v.final_balance * 0.7, 'SAV-DEP-' || v.account_number || '-2', '2026-09-25'::timestamptz),
    ('credit', v.final_balance * 0.3, v.final_balance, 'SAV-DEP-' || v.account_number || '-3', '2026-10-24'::timestamptz)
) as e(entry_type, amount, running_balance, reference, posted_at);

-- Withdrawal scenarios: 3 pending requests in the queue. Balance is NOT reduced
-- yet (matches the real "pending_verification" state before Bookkeeper confirms).
insert into public.savings_transaction_queue (
  transaction_id, savings_id, membership_number_id, member_name, account_type,
  transaction_type, amount, transaction_status, entered_by_role, requested_at,
  account_number
) values
  ('SVQ-TTMPC-301-001', 'SA-TTMPC-301', 'TTMPC-301', 'Ana L. Dela Cruz', 'member',
   'withdraw', 3000.00, 'pending_verification', 'cashier', now(), 'SA-TTMPC-301'),
  ('SVQ-TTMPC-303-001', 'SA-TTMPC-303', 'TTMPC-303', 'Mark J. Salazar', 'member',
   'withdraw', 2500.00, 'pending_verification', 'cashier', now(), 'SA-TTMPC-303'),
  ('SVQ-TTMPC-307-001', 'SA-TTMPC-307', 'TTMPC-307', 'Edwin R. Bermejo', 'member',
   'withdraw', 1500.00, 'pending_verification', 'cashier', now(), 'SA-TTMPC-307');

commit;

-- Verify:
select sa.account_number, sa.balance, count(sl.id) as ledger_rows,
  (select count(*) from public.savings_transaction_queue q where q.account_number = sa.account_number) as pending_withdrawals
from public.savings_accounts sa
left join public.savings_ledger sl on sl.account_number = sa.account_number
where sa.account_number like 'SA-TTMPC-%'
group by sa.account_number, sa.balance
order by sa.account_number;
