-- =============================================================================
-- 36_fix_order_items_rls.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Migration 32 narrowed the public leg of orders_select to dine-in so online
-- orders stopped exposing customer name / phone / address to anonymous users.
-- order_items_select was never updated to match, so the LINE ITEMS of online
-- orders stayed readable with the public anon key even though the parent order
-- row was hidden.
--
-- This mirrors every leg of orders_select (as it stands after migration 34)
-- onto order_items. The station leg is important: chef / staff / delivery
-- panels currently read online order items THROUGH the leak, so closing it
-- without adding is_restaurant_station() would blank out the Delivery Panel.
-- =============================================================================

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (
          -- QR dine-in customers poll their order without signing in
          (public.restaurant_is_visible(o.restaurant_id) and o.order_type = 'dine-in')
          -- hungriOrder signed-in customers reading their own order history
          or o.customer_id = auth.uid()
          or public.is_restaurant_admin(o.restaurant_id)
          -- chef / staff / delivery station accounts
          or public.is_restaurant_station(o.restaurant_id)
          or public.is_super_admin()
        )
    )
  );
