-- =============================================================================
-- 18_phone_restaurant_links.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Replaces owner_phone_numbers (which linked phone → auth user) with
-- phone_restaurant_links (phone → restaurant directly).
--
-- This supports the two-layer login:
--   Layer 1: phone + Telegram OTP → see all restaurants on this phone
--   Layer 2: email + password for a specific restaurant → dashboard access
--
-- One phone can own many restaurants.
-- One restaurant has at most one owner phone.
-- =============================================================================

-- Drop old table if it exists (migration 17 created it, never used in prod)
drop table if exists public.owner_phone_numbers cascade;

-- New table: phone number → restaurant
create table if not exists public.phone_restaurant_links (
  id            uuid        primary key default gen_random_uuid(),
  phone_number  text        not null,
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- One restaurant can only be on one phone; one phone can have many restaurants
  constraint phone_restaurant_links_restaurant_unique unique (restaurant_id)
);

create index if not exists idx_phone_restaurant_links_phone
  on public.phone_restaurant_links(phone_number);

alter table public.phone_restaurant_links enable row level security;
-- Only accessed via Edge Functions with service role key — no direct user access
