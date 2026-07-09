-- =============================================================================
-- 34_delivery_role_online_visibility.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- 1. "Delivery boy" station role (Settings → Stations) with its own panel.
-- 2. Per-item online visibility: menu_items.online_available lets restaurants
--    hide dishes from the hungriOrder storefront while still selling them
--    in-house.
-- 3. Restaurant coordinates for nearest-first discovery on the storefront.
-- 4. Restore the station leg of orders_select that migration 32's rewrite
--    dropped (stations kept working via the public dine-in leg, but delivery
--    stations must read online orders explicitly).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Delivery station role
-- -----------------------------------------------------------------------------
alter table public.user_roles
  drop constraint if exists user_roles_role_check;
alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('admin', 'super_admin', 'chef', 'staff', 'delivery'));

alter table public.restaurant_stations
  drop constraint if exists restaurant_stations_role_check;
alter table public.restaurant_stations
  add constraint restaurant_stations_role_check
  check (role in ('chef', 'staff', 'delivery'));

-- -----------------------------------------------------------------------------
-- 2. Per-item online visibility (default true → nothing changes until a
--    restaurant hides an item)
-- -----------------------------------------------------------------------------
alter table public.menu_items
  add column if not exists online_available boolean not null default true;

-- -----------------------------------------------------------------------------
-- 3. Restaurant coordinates (set from Settings → Online Ordering)
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- -----------------------------------------------------------------------------
-- 4. orders_select — same shape as migration 32 (dine-in only for the public
--    leg, customers read their own orders) PLUS the station leg from
--    migration 25 so chef/staff/delivery stations read their restaurant's
--    orders directly, including online ones.
-- -----------------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to anon, authenticated
  using (
    (public.restaurant_is_visible(restaurant_id) and order_type = 'dine-in')
    or customer_id = auth.uid()
    or public.is_restaurant_admin(restaurant_id)
    or public.is_restaurant_station(restaurant_id)
    or public.is_super_admin()
  );
