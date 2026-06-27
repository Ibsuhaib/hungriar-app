-- =============================================================================
-- 19_security_rls.sql
-- Adds explicit deny-all RLS policies for sensitive tables that are only
-- accessed via Edge Functions (service role bypasses RLS).
-- Safe to re-run.
-- =============================================================================

-- telegram_accounts: only Edge Functions (service role) may read/write
alter table public.telegram_accounts enable row level security;
drop policy if exists telegram_accounts_deny_all on public.telegram_accounts;
create policy telegram_accounts_deny_all on public.telegram_accounts
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- otp_codes: only Edge Functions (service role) may read/write
alter table public.otp_codes enable row level security;
drop policy if exists otp_codes_deny_all on public.otp_codes;
create policy otp_codes_deny_all on public.otp_codes
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- phone_restaurant_links: only Edge Functions (service role) may read/write
alter table public.phone_restaurant_links enable row level security;
drop policy if exists phone_restaurant_links_deny_all on public.phone_restaurant_links;
create policy phone_restaurant_links_deny_all on public.phone_restaurant_links
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);

-- owner_phone_numbers (may still exist from migration 17 before 18 drops it)
-- Add deny-all defensively in case it exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'owner_phone_numbers') then
    execute 'alter table public.owner_phone_numbers enable row level security';
    execute 'drop policy if exists owner_phone_numbers_deny_all on public.owner_phone_numbers';
    execute $p$create policy owner_phone_numbers_deny_all on public.owner_phone_numbers
      as restrictive for all to authenticated using (false) with check (false)$p$;
  end if;
end $$;
