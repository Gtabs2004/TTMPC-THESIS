-- Confirm via pg_catalog (not information_schema, in case of a caching
-- layer difference) that application_type genuinely exists as a real
-- column on the real public.loans table right now.
select a.attname, a.attnum, t.typname
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_type t on t.oid = a.atttypid
where n.nspname = 'public' and c.relname = 'loans'
  and a.attname = 'application_type' and a.attnum > 0 and not a.attisdropped;

-- Is 'loans' actually a table, or has it been replaced by a view at some point?
select c.relkind, n.nspname, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'loans' and n.nspname = 'public';
-- relkind: 'r' = ordinary table, 'v' = view, 'm' = materialized view
