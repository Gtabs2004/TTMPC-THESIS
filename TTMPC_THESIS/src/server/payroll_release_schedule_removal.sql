-- Payroll delay feature removal.
--
-- The payroll delay feature (Treasurer salary-release logbook, grace-period
-- late-payment detection) was dropped. The screens and the FastAPI endpoints
-- (/api/treasurer/payroll/*) are gone; this removes the database objects that
-- payroll_release_schedule_schema.sql created.
--
-- Checked on the live database before writing this (2026-10-22):
--   * no foreign keys point at salary_schedule, and it has none of its own
--   * no other view or function references salary_schedule or its two views
--   * 180 rows, all auto-seeded by the old endpoint; exactly 1 has a logged
--     release_date (recorded by a Treasurer). That row is the only real data
--     this deletes. The archive below keeps it; skip that block if you do not
--     want a copy.
--
-- Run the whole file in the Supabase SQL editor. Safe to run more than once.

-- 1) Keep the one logged cycle (optional; delete this block to discard it).
do $$
begin
  if to_regclass('public.salary_schedule') is not null then
    execute 'create table if not exists public.salary_schedule_archive as
             select * from public.salary_schedule where release_date is not null';
  end if;
end $$;

-- 2) Views first (they read the table), then the table. Dropping the table also
--    removes its indexes, the realtime trigger and the read policy.
drop view  if exists public.salary_schedule_delay_stats_v;
drop view  if exists public.salary_schedule_logged_v;
drop table if exists public.salary_schedule;
