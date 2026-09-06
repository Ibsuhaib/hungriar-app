-- =============================================================================
-- 37_hash_otp_codes.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- OTP codes were stored in plaintext. RLS denies all client access and only
-- the service role reads the table, so exposure needs a service-role key leak
-- or access to a database backup — but a live login code sitting in cleartext
-- is avoidable, and backups travel further than the database does.
--
-- Codes are now stored as sha256(phone_number || ':' || code). Binding the
-- phone number into the digest means a single rainbow table cannot be built
-- for all 1e6 six-digit codes across every row at once.
--
-- `code` is made nullable rather than dropped so OTPs already in flight when
-- this deploys still verify. Drop it once the 5-minute expiry window has
-- passed:  alter table public.otp_codes drop column code;
-- =============================================================================

alter table public.otp_codes
  add column if not exists code_hash text;

alter table public.otp_codes
  alter column code drop not null;

create index if not exists idx_otp_codes_lookup
  on public.otp_codes (phone_number, code_hash);
