-- =============================================================================
-- Goana AR - 03_storage.sql
-- Storage bucket + policies for menu images, AR models and QR codes
--
-- Folder convention inside the bucket:
--   {restaurant_id}/images/...
--   {restaurant_id}/models/...
--   {restaurant_id}/qr-codes/...
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-assets',
  'restaurant-assets',
  true,
  20971520, -- 20MB, comfortably covers compressed .glb / .usdz models
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'model/gltf-binary', 'model/vnd.usdz+zip', 'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read access (bucket is public, but make the policy explicit)
drop policy if exists "restaurant_assets_public_read" on storage.objects;
create policy "restaurant_assets_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'restaurant-assets');

-- Restaurant admins (and super admins) can upload into their own restaurant's folder
drop policy if exists "restaurant_assets_admin_insert" on storage.objects;
create policy "restaurant_assets_admin_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-assets'
  and (
    public.is_super_admin()
    or public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  )
);

-- Restaurant admins (and super admins) can replace files in their own folder
drop policy if exists "restaurant_assets_admin_update" on storage.objects;
create policy "restaurant_assets_admin_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-assets'
  and (
    public.is_super_admin()
    or public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  )
)
with check (
  bucket_id = 'restaurant-assets'
  and (
    public.is_super_admin()
    or public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  )
);

-- Restaurant admins (and super admins) can delete files in their own folder
drop policy if exists "restaurant_assets_admin_delete" on storage.objects;
create policy "restaurant_assets_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-assets'
  and (
    public.is_super_admin()
    or public.is_restaurant_admin(((storage.foldername(name))[1])::uuid)
  )
);
