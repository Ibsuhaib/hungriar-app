-- =============================================================================
-- Goana AR - 02_rls.sql
-- Row Level Security policies
-- =============================================================================

alter table public.restaurants enable row level security;
alter table public.user_roles enable row level security;
alter table public.restaurant_admins enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.billing_history enable row level security;
alter table public.rate_limits enable row level security;
alter table public.admin_sessions enable row level security;

-- -----------------------------------------------------------------------------
-- restaurants
-- Public can read restaurants that are not deactivated. Restaurant admins and
-- super admins can always read/manage their own restaurant. The
-- protect_subscription_fields trigger (01_schema.sql) prevents non super
-- admins from changing billing related columns even though they share the
-- same UPDATE policy.
-- -----------------------------------------------------------------------------
drop policy if exists restaurants_select on public.restaurants;
create policy restaurants_select on public.restaurants
  for select to anon, authenticated
  using (
    subscription_status <> 'inactive'
    or public.is_restaurant_admin(id)
    or public.is_super_admin()
  );

drop policy if exists restaurants_insert on public.restaurants;
create policy restaurants_insert on public.restaurants
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists restaurants_update on public.restaurants;
create policy restaurants_update on public.restaurants
  for update to authenticated
  using (public.is_restaurant_admin(id) or public.is_super_admin())
  with check (public.is_restaurant_admin(id) or public.is_super_admin());

drop policy if exists restaurants_delete on public.restaurants;
create policy restaurants_delete on public.restaurants
  for delete to authenticated
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- user_roles
-- -----------------------------------------------------------------------------
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- restaurant_admins
-- -----------------------------------------------------------------------------
drop policy if exists restaurant_admins_select on public.restaurant_admins;
create policy restaurant_admins_select on public.restaurant_admins
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_restaurant_admin(restaurant_id)
    or public.is_super_admin()
  );

drop policy if exists restaurant_admins_insert on public.restaurant_admins;
create policy restaurant_admins_insert on public.restaurant_admins
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists restaurant_admins_update on public.restaurant_admins;
create policy restaurant_admins_update on public.restaurant_admins
  for update to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

drop policy if exists restaurant_admins_delete on public.restaurant_admins;
create policy restaurant_admins_delete on public.restaurant_admins
  for delete to authenticated
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- subscription_payments
-- -----------------------------------------------------------------------------
drop policy if exists subscription_payments_select on public.subscription_payments;
create policy subscription_payments_select on public.subscription_payments
  for select to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists subscription_payments_insert on public.subscription_payments;
create policy subscription_payments_insert on public.subscription_payments
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists subscription_payments_update on public.subscription_payments;
create policy subscription_payments_update on public.subscription_payments
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists subscription_payments_delete on public.subscription_payments;
create policy subscription_payments_delete on public.subscription_payments
  for delete to authenticated
  using (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated
  using (
    public.restaurant_is_visible(restaurant_id)
    or public.is_restaurant_admin(restaurant_id)
    or public.is_super_admin()
  );

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
  for update to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
  for delete to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- menu_items
-- -----------------------------------------------------------------------------
drop policy if exists menu_items_select on public.menu_items;
create policy menu_items_select on public.menu_items
  for select to anon, authenticated
  using (
    public.restaurant_is_visible(restaurant_id)
    or public.is_restaurant_admin(restaurant_id)
    or public.is_super_admin()
  );

drop policy if exists menu_items_insert on public.menu_items;
create policy menu_items_insert on public.menu_items
  for insert to authenticated
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists menu_items_update on public.menu_items;
create policy menu_items_update on public.menu_items
  for update to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists menu_items_delete on public.menu_items;
create policy menu_items_delete on public.menu_items
  for delete to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- tables (not publicly readable - QR validation goes through the
-- validate-table-token edge function which uses the service role key)
-- -----------------------------------------------------------------------------
drop policy if exists tables_select on public.tables;
create policy tables_select on public.tables
  for select to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists tables_insert on public.tables;
create policy tables_insert on public.tables
  for insert to authenticated
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists tables_update on public.tables;
create policy tables_update on public.tables
  for update to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists tables_delete on public.tables;
create policy tables_delete on public.tables
  for delete to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- orders
-- Public select is allowed (order ids are random UUIDs handed only to the
-- customer who placed the order) so the OrderStatus page can poll/subscribe
-- without authentication. All inserts go through the place-order edge
-- function using the service role key (no insert policy for anon/authenticated).
-- -----------------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to anon, authenticated
  using (
    public.restaurant_is_visible(restaurant_id)
    or public.is_restaurant_admin(restaurant_id)
    or public.is_super_admin()
  );

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders
  for delete to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          public.restaurant_is_visible(o.restaurant_id)
          or public.is_restaurant_admin(o.restaurant_id)
          or public.is_super_admin()
        )
    )
  );

-- -----------------------------------------------------------------------------
-- billing_history
-- -----------------------------------------------------------------------------
drop policy if exists billing_history_select on public.billing_history;
create policy billing_history_select on public.billing_history
  for select to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

drop policy if exists billing_history_insert on public.billing_history;
create policy billing_history_insert on public.billing_history
  for insert to authenticated
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- rate_limits / admin_sessions
-- No direct client policies - only accessed via the security definer
-- functions check_rate_limit / cleanup_rate_limits / upsert_admin_session /
-- validate_admin_session, or the service role from edge functions.
-- -----------------------------------------------------------------------------
