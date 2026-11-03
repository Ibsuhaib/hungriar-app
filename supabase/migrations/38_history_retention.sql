-- =============================================================================
-- 38_history_retention.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Billing history was hard-coded to delete anything older than 7 days, on every
-- visit to the History page. Restaurants that wanted a longer record — or to
-- keep bills permanently for their accountant — had no way to ask for one, and
-- the deletion was irreversible.
--
-- NULL means keep forever. A number is the number of days to retain.
-- Default stays 7 so existing restaurants behave exactly as before until the
-- owner changes it in Settings.
-- =============================================================================

alter table public.restaurants
  add column if not exists history_retention_days int default 7;

alter table public.restaurants
  drop constraint if exists restaurants_history_retention_days_check;
alter table public.restaurants
  add constraint restaurants_history_retention_days_check
  check (history_retention_days is null or history_retention_days between 1 and 3650);
