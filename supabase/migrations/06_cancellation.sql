-- =============================================================================
-- 06_cancellation.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run — all statements use CREATE OR REPLACE / IF NOT EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add 'cancelled' to the orders status constraint
-- -----------------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'preparing', 'served', 'completed', 'cancelled'));

-- -----------------------------------------------------------------------------
-- 2. Per-item cancelled flag on order_items
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists cancelled boolean not null default false;

-- -----------------------------------------------------------------------------
-- 3. UPDATE RLS policy for order_items so restaurant admins can cancel items
--    (order_items previously only had SELECT — no UPDATE policy existed)
-- -----------------------------------------------------------------------------
drop policy if exists order_items_update on public.order_items;
create policy order_items_update on public.order_items
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (public.is_restaurant_admin(o.restaurant_id) or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (public.is_restaurant_admin(o.restaurant_id) or public.is_super_admin())
    )
  );

-- -----------------------------------------------------------------------------
-- 4. RPC: cancel a single order item and recalculate the order total
--    security definer: runs as function owner (bypasses RLS); the manual
--    is_restaurant_admin check inside ensures only admins can call it.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id      uuid;
  v_restaurant_id uuid;
  v_tax_pct       numeric;
  v_new_total     numeric;
  v_all_cancelled boolean;
begin
  select oi.order_id, o.restaurant_id
  into   v_order_id, v_restaurant_id
  from   public.order_items oi
  join   public.orders o on o.id = oi.order_id
  where  oi.id = p_item_id;

  if v_order_id is null then
    raise exception 'item not found';
  end if;

  if not (public.is_restaurant_admin(v_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  -- Mark the item cancelled
  update public.order_items set cancelled = true where id = p_item_id;

  -- Re-compute order total including tax
  select coalesce(r.tax_percentage, 0)
  into   v_tax_pct
  from   public.restaurants r
  where  r.id = v_restaurant_id;

  select round(coalesce(sum(quantity * unit_price), 0) * (1 + v_tax_pct / 100) * 100) / 100
  into   v_new_total
  from   public.order_items
  where  order_id = v_order_id and not cancelled;

  -- If every item is now cancelled, mark the whole order cancelled too
  select not exists (
    select 1 from public.order_items
    where order_id = v_order_id and not cancelled
  ) into v_all_cancelled;

  update public.orders
  set    total_amount = v_new_total,
         status       = case when v_all_cancelled then 'cancelled' else status end
  where  id = v_order_id;
end;
$$;

grant execute on function public.cancel_order_item(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: cancel an entire order at once
-- -----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  select restaurant_id into v_restaurant_id
  from   public.orders where id = p_order_id;

  if v_restaurant_id is null then
    raise exception 'order not found';
  end if;

  if not (public.is_restaurant_admin(v_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  update public.order_items
  set    cancelled = true
  where  order_id = p_order_id and not cancelled;

  update public.orders
  set    status = 'cancelled', total_amount = 0
  where  id = p_order_id;
end;
$$;

grant execute on function public.cancel_order(uuid) to authenticated;
