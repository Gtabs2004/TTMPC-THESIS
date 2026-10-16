-- Time Deposit — dashboard aggregates.
-- The view deliberately excludes closed certificates and expected interest
-- from deposit totals. A savings debit already removes transferred principal.

BEGIN;

CREATE OR REPLACE VIEW public.v_time_deposit_kpis AS
WITH regular AS (
    SELECT
        count(*)::integer AS regular_account_count,
        coalesce(sum(balance), 0)::numeric(14,2) AS regular_balance
    FROM public.savings_accounts
    WHERE account_kind = 'member'
      AND status = 'active'
), td AS (
    SELECT
        count(*)::integer AS total_time_deposit_accounts,
        count(*) FILTER (WHERE status = 'locked')::integer AS locked_td_count,
        coalesce(sum(principal) FILTER (WHERE status IN ('locked', 'matured')), 0)::numeric(14,2)
            AS locked_td_principal,
        count(*) FILTER (WHERE status = 'matured')::integer AS matured_awaiting_settlement_count
    FROM public.time_deposits
)
SELECT
    regular.regular_account_count,
    regular.regular_balance,
    td.locked_td_count,
    td.locked_td_principal,
    td.matured_awaiting_settlement_count,
    (regular.regular_balance + td.locked_td_principal)::numeric(14,2)
        AS total_cooperative_deposits,
    td.total_time_deposit_accounts
FROM regular CROSS JOIN td;

REVOKE ALL ON public.v_time_deposit_kpis FROM anon, authenticated;
GRANT SELECT ON public.v_time_deposit_kpis TO service_role;

COMMIT;