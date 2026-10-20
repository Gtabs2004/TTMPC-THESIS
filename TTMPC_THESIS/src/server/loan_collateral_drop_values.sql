-- Remove declared/appraised monetary values from loan collateral.
-- Collateral is now just type + description + photo.
-- Apply BEFORE deploying the frontend that no longer sends declared_value
-- (declared_value is NOT NULL with no default, so old code would fail after this
-- only if the column were kept; new code omits it and needs the column gone/nullable).
-- Destructive: existing declared/appraised amounts are discarded.

alter table public.loan_collateral drop column if exists declared_value;
alter table public.loan_collateral drop column if exists appraised_value;
