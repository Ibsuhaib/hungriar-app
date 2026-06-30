-- =============================================================================
-- 23_bill_item_edit.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Lets restaurant admins fix up a bill before settling it: change an item's
-- quantity, or add an item the waiter forgot to ring in. Deleting an item
-- reuses the existing cancel_order_item() RPC from 06_cancellation.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: change an order item's quantity and recompute the order total
--    (same tax recompute logic as cancel_order_item)
-- -----------------------------------------------------------------------------
create or replace function public.update_order_item_quantity(
  p_item_id  uuid,
  p_quantity int
)
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
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 50 then
    raise exception 'quantity must be between 1 and 50';
  end if;

  select oi.order_id, o.restaurant_id
  into   v_order_id, v_restaurant_id
  from   public.order_items oi
  join   public.orders o on o.id = oi.order_id
  where  oi.id = p_item_id and not oi.cancelled;

  if v_order_id is null then
    raise exception 'item not found';
  end if;

  if not (public.is_restaurant_admin(v_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  update public.order_items set quantity = p_quantity where id = p_item_id;

  select coalesce(r.tax_percentage, 0)
  into   v_tax_pct
  from   public.restaurants r
  where  r.id = v_restaurant_id;

  select round(coalesce(sum(quantity * unit_price), 0) * (1 + v_tax_pct / 100) * 100) / 100
  into   v_new_total
  from   public.order_items
  where  order_id = v_order_id and not cancelled;

  update public.orders set total_amount = v_new_total where id = v_order_id;
end;
$$;

grant execute on function public.update_order_item_quantity(uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. RPC: add a missed item directly onto an unsettled table's bill.
--    Creates a new 'completed' order with the single item so it's
--    immediately billable — no kitchen routing needed since the table is
--    already in the billing flow.
-- -----------------------------------------------------------------------------
create or replace function public.admin_add_billing_item(
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_menu_item_id  uuid,
  p_quantity      int  default 1,
  p_notes         text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_name     text;
  v_price    numeric;
  v_qty      int;
  v_tax_pct  numeric;
  v_total    numeric(10,2);
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  select name, price into v_name, v_price
  from   public.menu_items
  where  id = p_menu_item_id and restaurant_id = p_restaurant_id and available = true;

  if v_name is null then
    raise exception 'menu item not found or unavailable';
  end if;

  v_qty := greatest(1, least(50, coalesce(p_quantity, 1)));

  select coalesce(tax_percentage, 0) into v_tax_pct
  from public.restaurants where id = p_restaurant_id;

  v_total := round(v_price * v_qty * (1 + v_tax_pct / 100) * 100) / 100;

  insert into public.orders (restaurant_id, table_id, status, total_amount)
  values (p_restaurant_id, p_table_id, 'completed', v_total)
  returning id into v_order_id;

  insert into public.order_items
    (order_id, menu_item_id, item_name, quantity, unit_price, notes)
  values
    (v_order_id, p_menu_item_id, v_name, v_qty, v_price, coalesce(nullif(trim(p_notes), ''), ''));

  return v_order_id;
end;
$$;

grant execute on function public.admin_add_billing_item(uuid, uuid, uuid, int, text) to authenticated;
