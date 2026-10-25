-- Forces PostgREST (what Supabase-js's .select() talks to) to reload its
-- cached table schema. If application_type was added to public.loans after
-- PostgREST last cached the schema, it would be silently dropped from
-- every REST response (not erroring, just absent) -- exactly what we're
-- seeing: application_type missing entirely from the fetched loan object
-- in Loan-Approval.jsx, despite being present and correct via direct SQL.
notify pgrst, 'reload schema';
