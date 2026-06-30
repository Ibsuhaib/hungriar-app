-- =============================================================================
-- 24_bill_edit_log.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Audit trail for the bill-editing feature (23_bill_item_edit.sql) so the
-- owner can see how much money was added/removed via bill edits in their
-- daily Telegram report. Only edits made through the Billing page count —
-- kitchen-stage item cancellations (cancel_order_item, used on
-- Dashboard/Orders/Chef) are a separate concern and are not logged here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. bill_edit_log table
-- -----------------------------------------------------------------------------
create table if not exists public.bill_edit_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid references public.tables(id) on delete set null,
  item_name     text not null,
  edit_type     text not null check (edit_type in ('add', 'remove', 'quantity_change')),
  amount_delta  numeric(10,2) not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_bill_edit_log_restaurant on public.bill_edit_log (restaurant_id);
create index if not exists idx_bill_edit_log_created    on public.bill_edit_log (created_at);

alter table public.bill_edit_log enable row level security;

drop policy if exists bill_edit_log_select on public.bill_edit_log;
create policy bill_edit_log_select on public.bill_edit_log
  for select to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 2. update_order_item_quantity — now also logs the tax-inclusive amount
--    change for the day report.
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
  v_table_id      uuid;
  v_item_name     text;
  v_old_qty       int;
  v_unit_price    numeric;
  v_tax_pct       numeric;
  v_new_total     numeric;
  v_delta         numeric;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 50 then
    raise exception 'quantity must be between 1 and 50';
  end if;

  select oi.order_id, o.restaurant_id, o.table_id, oi.item_name, oi.quantity, oi.unit_price
  into   v_order_id, v_restaurant_id, v_table_id, v_item_name, v_old_qty, v_unit_price
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

  v_delta := round((p_quantity - v_old_qty) * v_unit_price * (1 + v_tax_pct / 100) * 100) / 100;
  if v_delta <> 0 then
    insert into public.bill_edit_log (restaurant_id, table_id, item_name, edit_type, amount_delta)
    values (v_restaurant_id, v_table_id, v_item_name, 'quantity_change', v_delta);
  end if;
end;
$$;

grant execute on function public.update_order_item_quantity(uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. admin_add_billing_item — now also logs the added amount.
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

  insert into public.bill_edit_log (restaurant_id, table_id, item_name, edit_type, amount_delta)
  values (p_restaurant_id, p_table_id, v_name, 'add', v_total);

  return v_order_id;
end;
$$;

grant execute on function public.admin_add_billing_item(uuid, uuid, uuid, int, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. billing_remove_item — dedicated "delete from bill" RPC for the Billing
--    page. Same cancel logic as cancel_order_item (06_cancellation.sql) but
--    logs the removed amount. cancel_order_item itself is left untouched
--    since it's also used for kitchen-stage cancellations on
--    Dashboard/Orders/Chef, which should not count as a "bill edit".
-- -----------------------------------------------------------------------------
create or replace function public.billing_remove_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id      uuid;
  v_restaurant_id uuid;
  v_table_id      uuid;
  v_item_name     text;
  v_qty           int;
  v_unit_price    numeric;
  v_tax_pct       numeric;
  v_new_total     numeric;
  v_all_cancelled boolean;
  v_delta         numeric;
begin
  select oi.order_id, o.restaurant_id, o.table_id, oi.item_name, oi.quantity, oi.unit_price
  into   v_order_id, v_restaurant_id, v_table_id, v_item_name, v_qty, v_unit_price
  from   public.order_items oi
  join   public.orders o on o.id = oi.order_id
  where  oi.id = p_item_id and not oi.cancelled;

  if v_order_id is null then
    raise exception 'item not found';
  end if;

  if not (public.is_restaurant_admin(v_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  update public.order_items set cancelled = true where id = p_item_id;

  select coalesce(r.tax_percentage, 0)
  into   v_tax_pct
  from   public.restaurants r
  where  r.id = v_restaurant_id;

  select round(coalesce(sum(quantity * unit_price), 0) * (1 + v_tax_pct / 100) * 100) / 100
  into   v_new_total
  from   public.order_items
  where  order_id = v_order_id and not cancelled;

  select not exists (
    select 1 from public.order_items
    where order_id = v_order_id and not cancelled
  ) into v_all_cancelled;

  update public.orders
  set    total_amount = v_new_total,
         status       = case when v_all_cancelled then 'cancelled' else status end
  where  id = v_order_id;

  v_delta := -round(v_qty * v_unit_price * (1 + v_tax_pct / 100) * 100) / 100;
  insert into public.bill_edit_log (restaurant_id, table_id, item_name, edit_type, amount_delta)
  values (v_restaurant_id, v_table_id, v_item_name, 'remove', v_delta);
end;
$$;

grant execute on function public.billing_remove_item(uuid) to authenticated;
