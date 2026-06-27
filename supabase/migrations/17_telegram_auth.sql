-- =============================================================================
-- 17_telegram_auth.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds tables for Telegram OTP login:
--   owner_phone_numbers — links auth.users.id to a phone number
--   telegram_accounts   — links phone number to Telegram chat_id
--   otp_codes           — short-lived 6-digit OTP with 5-minute expiry
-- =============================================================================

-- Owner phone numbers
create table if not exists public.owner_phone_numbers (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  phone_number text unique not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_owner_phone_numbers_phone
  on public.owner_phone_numbers(phone_number);

alter table public.owner_phone_numbers enable row level security;

drop policy if exists owner_phone_numbers_self on public.owner_phone_numbers;
create policy owner_phone_numbers_self on public.owner_phone_numbers
  for select to authenticated
  using (user_id = auth.uid());

-- Telegram account links (phone → chat_id)
create table if not exists public.telegram_accounts (
  phone_number text primary key,
  chat_id      bigint unique not null,
  linked_at    timestamptz not null default now()
);

alter table public.telegram_accounts enable row level security;
-- Only accessible via Edge Functions with service role key — no direct user access

-- OTP codes
create table if not exists public.otp_codes (
  id           uuid primary key default gen_random_uuid(),
  phone_number text not null,
  code         text not null,
  expires_at   timestamptz not null,
  used         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists idx_otp_codes_phone
  on public.otp_codes(phone_number, created_at desc);

alter table public.otp_codes enable row level security;
-- Only accessible via Edge Functions with service role key — no direct user access

-- =============================================================================
-- HOW TO LINK AN EXISTING OWNER ACCOUNT TO A PHONE NUMBER:
--
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Find the owner's user row, copy their UUID
-- 3. Run: insert into public.owner_phone_numbers (user_id, phone_number)
--          values ('<uuid>', '<phone>');
--
-- Example:
--   insert into public.owner_phone_numbers (user_id, phone_number)
--   values ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '9876543210');
-- =============================================================================
