-- Does authenticated/anon actually have SELECT on loans.application_type?
select grantee, table_name, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'loans'
  and column_name = 'application_type';

-- Any column-level RLS/security-barrier views wrapping loans?
select schemaname, viewname from pg_views
where schemaname = 'public' and viewname ilike '%loan%';

-- Row Level Security policies on loans -- any column-specific predicates?
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'loans';
