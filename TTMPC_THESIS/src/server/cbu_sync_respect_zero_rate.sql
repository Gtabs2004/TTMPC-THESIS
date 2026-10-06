-- CBU retention credit on loan release: credit exactly what was deducted.
--
-- Replaces the function from cbu_sync_from_loan_disbursement_include_emergency.sql.
-- The old version used NULLIF(cbu_deduction, 0) and NULLIF(rate, 0) with a 0.02
-- fallback, so a loan type whose CBU rate is 0% (Bonus) still got a 2% credit
-- that was never deducted from the member's proceeds. Now:
--   * loans.cbu_deduction (saved at application, trg_snapshot_loan_fees) wins,
--     including 0;
--   * otherwise (older loans) the loan_fee_policies rate is used, with no 2%
--     fallback.
-- Safe to re-run.

create or replace function public.sync_cbu_from_loan_disbursement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_new_status text;
    v_old_status text;
    v_loan_type_code text;
    v_principal numeric;
    v_cbu_credit numeric;
    v_existing_balance numeric := 0;
    v_transaction_date timestamptz;
begin
    v_new_status := lower(btrim(coalesce(NEW.loan_status, '')));
    v_old_status := lower(btrim(coalesce(OLD.loan_status, '')));

    if v_new_status <> 'released' then
        return NEW;
    end if;

    if TG_OP = 'UPDATE' and v_old_status = 'released' then
        return NEW;
    end if;

    if exists (
        select 1 from public.capital_build_up where source_loan_id = NEW.control_number
    ) then
        return NEW;
    end if;

    if NEW.member_id is null then
        return NEW;
    end if;

    select upper(btrim(coalesce(lt.code, '')))
    into v_loan_type_code
    from public.loan_types lt
    where lt.id = NEW.loan_type_id
    limit 1;

    v_principal := coalesce(NEW.principal_amount, NEW.loan_amount, 0);
    if v_principal <= 0 then
        return NEW;
    end if;

    v_cbu_credit := coalesce(
        NEW.cbu_deduction,
        round(v_principal * public.get_cbu_rate_for_loan_type(v_loan_type_code), 2)
    );

    if v_cbu_credit <= 0 then
        return NEW;
    end if;

    select coalesce(ending_share_capital, 0)
    into v_existing_balance
    from public.capital_build_up
    where member_id = NEW.member_id
    order by transaction_date desc nulls last, id desc
    limit 1;

    if v_existing_balance is null then
        v_existing_balance := 0;
    end if;

    v_transaction_date := coalesce(NEW.disbursal_date, now());

    insert into public.capital_build_up (
        member_id,
        transaction_date,
        starting_share_capital,
        capital_added,
        deposit_account,
        ending_share_capital,
        source_loan_id
    ) values (
        NEW.member_id,
        v_transaction_date,
        v_existing_balance,
        v_cbu_credit,
        'LOAN_CBU_RETENTION',
        v_existing_balance + v_cbu_credit,
        NEW.control_number
    )
    on conflict (source_loan_id) do nothing;

    return NEW;
end;
$function$;
