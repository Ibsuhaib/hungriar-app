-- 35: Digitally signed subscription agreements
--
-- Stores an immutable record of each agreement signing: the exact text the
-- admin saw, their typed name, their drawn signature (PNG data URL), and the
-- timestamp. Complements restaurant_admins.agreement_accepted_at (which keeps
-- gating access) — this table is the evidence copy.
--
-- Immutability: only SELECT and INSERT policies exist. No UPDATE/DELETE for
-- any client role, so a signed record can never be altered from the apps.

create table if not exists public.signed_agreements (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  agreement_version   text not null,
  agreement_text      text not null,
  signer_name         text not null,
  signature_data_url  text not null,
  signed_at           timestamptz not null default now()
);

create index if not exists signed_agreements_restaurant_idx
  on public.signed_agreements (restaurant_id, signed_at desc);

alter table public.signed_agreements enable row level security;

-- The restaurant's own admins can read their agreement records; super admin reads all.
drop policy if exists "signed_agreements_select" on public.signed_agreements;
create policy "signed_agreements_select" on public.signed_agreements
  for select
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- Only a restaurant admin can insert, only for their own restaurant, and only
-- as themselves — the signer identity can't be spoofed.
drop policy if exists "signed_agreements_insert" on public.signed_agreements;
create policy "signed_agreements_insert" on public.signed_agreements
  for insert
  with check (public.is_restaurant_admin(restaurant_id) and user_id = auth.uid());
