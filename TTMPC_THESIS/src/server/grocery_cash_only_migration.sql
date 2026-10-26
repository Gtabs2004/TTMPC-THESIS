BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_cash_only_grocery_transactions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."Status" <> 'Completed' OR NEW.balance_due <> 0 THEN
      RAISE EXCEPTION 'Only cash-paid grocery transactions with zero balance due are supported'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."Status" = 'Completed' THEN
    IF NEW.balance_due <> 0 THEN
      RAISE EXCEPTION 'Cash grocery transactions must have a zero balance due'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."Status" IS DISTINCT FROM OLD."Status"
     OR NEW.balance_due IS DISTINCT FROM OLD.balance_due THEN
    RAISE EXCEPTION 'Only cash-paid grocery transactions are supported'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grocery_transactions_cash_only
  ON public."GROCERY_TRANSACTIONS";
CREATE TRIGGER grocery_transactions_cash_only
  BEFORE INSERT OR UPDATE ON public."GROCERY_TRANSACTIONS"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_cash_only_grocery_transactions();

CREATE OR REPLACE VIEW public.member_grocery_totals
WITH (security_invoker = true) AS
SELECT
  membership_number_id,
  SUM("GroceryAmount") AS total_grocery_amount,
  COUNT(*) AS transaction_count,
  MAX("TransactionDate") AS last_transaction_at
FROM public."GROCERY_TRANSACTIONS"
WHERE "Status" = 'Completed'
  AND membership_number_id IS NOT NULL
GROUP BY membership_number_id;

DROP POLICY IF EXISTS grocery_tx_authenticated_read
  ON public."GROCERY_TRANSACTIONS";
CREATE POLICY grocery_tx_authenticated_read
  ON public."GROCERY_TRANSACTIONS"
  FOR SELECT
  TO authenticated
  USING ("Status" = 'Completed');

COMMIT;
