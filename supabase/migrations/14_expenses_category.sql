-- =============================================================================
-- 14_expenses_category.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds a 'category' column to expenses to separate real business expenses
-- from cash-collection entries recorded via the Analytics page.
--
-- category = 'expense'    → vegetables, wages, utilities, etc. (default)
-- category = 'collection' → cash/UPI physically removed from register
-- =============================================================================

alter table public.expenses
  add column if not exists category text not null default 'expense';

-- Add constraint only if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_category_check'
  ) then
    alter table public.expenses
      add constraint expenses_category_check
      check (category in ('expense', 'collection'));
  end if;
end;
$$;

create index if not exists idx_expenses_category on public.expenses(category);
