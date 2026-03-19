-- CBU cashier support patch
-- Run in Supabase SQL editor.

BEGIN;

ALTER TABLE public.capital_build_up
  ADD COLUMN IF NOT EXISTS cbu_deposit_id text;

CREATE UNIQUE INDEX IF NOT EXISTS capital_build_up_cbu_deposit_id_uk
  ON public.capital_build_up (cbu_deposit_id)
  WHERE cbu_deposit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_cbu_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF to_regclass('public.member_account') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_account ma
    WHERE ma.user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager', 'cashier', 'treasurer') THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.member_accounts') IS NOT NULL THEN
    SELECT lower(btrim(coalesce(ma.role, '')))
    INTO v_role
    FROM public.member_accounts ma
    WHERE ma.user_id = auth.uid()
       OR lower(coalesce(ma.email, '')) = lower(coalesce(auth.email(), ''))
    LIMIT 1;

    IF v_role IN ('bod', 'manager', 'cashier', 'treasurer') THEN
      RETURN true;
    END IF;
  END IF;

  v_role := lower(btrim(coalesce(
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )));

  RETURN v_role IN ('bod', 'manager', 'cashier', 'treasurer');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_cbu_deposit_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_number integer;
BEGIN
  IF NEW.cbu_deposit_id IS NULL OR btrim(NEW.cbu_deposit_id) = '' THEN
    SELECT coalesce(count(*), 0) + 1 INTO next_number FROM public.capital_build_up;
    NEW.cbu_deposit_id := 'CBUD_' || lpad(next_number::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_cbu_deposit_id ON public.capital_build_up;
CREATE TRIGGER trg_set_cbu_deposit_id
BEFORE INSERT ON public.capital_build_up
FOR EACH ROW
EXECUTE FUNCTION public.set_cbu_deposit_id();

COMMIT;
