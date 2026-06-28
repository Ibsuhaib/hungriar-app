-- =============================================================================
-- 21_restaurant_plan.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Adds a plan column to restaurants so the super admin can assign
-- Starter / Standard / AR Premium to each restaurant.
-- =============================================================================

alter table public.restaurants
  add column if not exists plan text
  check (plan in ('starter', 'standard', 'ar_premium'));

-- default NULL = unassigned (super admin must explicitly assign)
