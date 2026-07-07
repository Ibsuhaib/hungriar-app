-- =============================================================================
-- 33_online_storage.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Storage buckets used by the hungriOrder storefront + standalone admin app
-- (cover images, menu photos, logos for online-only restaurants). Public-read;
-- writes restricted to the owning restaurant's admins: objects must live under
-- a top-level folder named after the restaurant_id.
-- The existing R2-based image flow used by the main hungriAR admin is untouched.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-images', 'menu-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('restaurant-logos', 'restaurant-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Public read hungriorder images" on storage.objects;
create policy "Public read hungriorder images"
  on storage.objects for select
  using (bucket_id in ('menu-images', 'restaurant-logos'));

drop policy if exists "Admins upload to own restaurant folder" on storage.objects;
create policy "Admins upload to own restaurant folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('menu-images', 'restaurant-logos')
    and public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins update own restaurant images" on storage.objects;
create policy "Admins update own restaurant images"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('menu-images', 'restaurant-logos')
    and public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins delete own restaurant images" on storage.objects;
create policy "Admins delete own restaurant images"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('menu-images', 'restaurant-logos')
    and public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  );
