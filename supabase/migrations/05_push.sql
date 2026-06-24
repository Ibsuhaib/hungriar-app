-- =============================================================================
-- Goana AR - 05_push.sql
-- Web push notification subscriptions
-- Run this in Supabase SQL Editor (safe to re-run — drops and recreates)
-- =============================================================================

drop table if exists public.push_subscriptions cascade;

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth_key      text not null,
  created_at    timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index idx_push_subs_restaurant on public.push_subscriptions (restaurant_id);

alter table public.push_subscriptions enable row level security;

create policy "admin manage own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
