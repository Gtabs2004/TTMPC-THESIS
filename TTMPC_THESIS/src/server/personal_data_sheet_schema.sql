-- Personal Data Sheet schema (idempotent)
-- Includes email support and keeps attributes aligned to the requested structure.

BEGIN;

CREATE TABLE IF NOT EXISTS public.personal_data_sheet (
  personal_data_sheet_id text NOT NULL,
  membership_number_id character varying NOT NULL,
  surname text NULL,
  first_name text NULL,
  middle_name text NULL,
  date_of_birth text NULL,
  gender text NULL,
  civil_status text NULL,
  maiden_name text NULL,
  tin_number text NULL,
  citizenship text NULL,
  religion text NULL,
  height bigint NULL,
  blood_type text NULL,
  place_of_birth text NULL,
  permanent_address text NULL,
  contact_number bigint NULL,
  occupation text NULL,
  educational_attainment text NULL,
  position text NULL,
  number_of_dependents bigint NULL,
  spouse_name text NULL,
  spouse_occupation text NULL,
  spouse_date_of_birth text NULL,
  date_of_membership text NULL,
  "BOD_resolution_number" text NULL,
  number_of_shares bigint NULL,
  amount bigint NULL,
  initial_paid_up_capital bigint NULL,
  email text NULL,
  created_at timestamptz NULL DEFAULT now(),
  CONSTRAINT personal_data_sheet_pkey PRIMARY KEY (personal_data_sheet_id),
  CONSTRAINT unique_membership_number UNIQUE (membership_number_id)
) TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.personal_data_sheet
  ADD COLUMN IF NOT EXISTS permanent_address text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill missing email from member_applications using the membership ID.
UPDATE public.personal_data_sheet pds
SET email = src.email
FROM (
  SELECT DISTINCT ON (membership_id)
    membership_id,
    email,
    created_at
  FROM public.member_applications
  WHERE email IS NOT NULL
  ORDER BY membership_id, created_at DESC
) src
WHERE pds.membership_number_id = src.membership_id
  AND (pds.email IS NULL OR btrim(pds.email) = '');

COMMIT;
