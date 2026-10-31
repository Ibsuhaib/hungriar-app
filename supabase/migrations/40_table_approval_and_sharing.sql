-- =============================================================================
-- 40_table_approval_and_sharing.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Stops remote QR ordering and lets everyone at a table see the table's orders.
--
-- 1. A table is "open" while guests are seated (tables.opened_at). The first
--    QR order on a closed table arrives as 'awaiting_approval' and stays out
--    of the kitchen until staff confirm someone is actually sitting there.
--    Someone ordering from a photo of the QR is caught at that step, because
--    the table is empty.
-- 2. Settling the bill closes the table again and rotates its session_id.
--    Migration 20 added that rotation inside reset_table_billing, but 22 and
--    30 recreated the function without it, so since then a group that had
--    paid could keep ordering onto the next group's table. It now lives in a
--    trigger on billing_history, so future rewrites of the billing function
--    cannot drop it again.
-- 3. Orders record their table session and an anonymous per-phone tag, so
--    every phone at the table can see the whole table's orders and running
--    total, and still tell which ones it placed itself.
-- 4. "Reset QR" invalidates every previously printed or photographed code for
--    one table (tables.qr_valid_after); the edge functions reject any token
--    issued before it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.tables add column if not exists opened_at      timestamptz;
alter table public.tables add column if not exists qr_valid_after timestamptz;
alter table public.orders add column if not exists session_id     uuid;
alter table public.orders add column if not exists device_tag     text;

alter table public.orders drop constraint if exists orders_device_tag_check;
alter table public.orders add constraint orders_device_tag_check
  check (device_tag is null or device_tag ~ '^[A-Za-z0-9]{1,32}$');

create index if not exists idx_orders_table_status on public.orders (table_id, status);

-- -----------------------------------------------------------------------------
-- 2. New status
-- -----------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'pending', 'preparing', 'served', 'completed', 'cancelled',
    'confirmed', 'ready', 'out_for_delivery', 'delivered',
    'awaiting_approval'
  ));

-- Tables already in use when this ships count as open, so families seated
-- right now are not suddenly asked for approval mid-meal.
update public.tables t
set    opened_at = now()
where  t.opened_at is null
  and  exists (
    select 1 from public.orders o
    where  o.table_id = t.id
      and  o.status not in ('cancelled', 'awaiting_approval')
  );

-- -----------------------------------------------------------------------------
-- 3. Triggers
-- -----------------------------------------------------------------------------

-- Every dine-in order is stamped with the table's current session, including
-- orders staff take on the floor, so they appear in the shared table view too.
create or replace function public.orders_fill_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.table_id is not null and new.session_id is null then
    select session_id into new.session_id from public.tables where id = new.table_id;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_fill_session on public.orders;
create trigger orders_fill_session
  before insert on public.orders
  for each row execute function public.orders_fill_session();

-- Any dine-in order that is not waiting for approval opens its table: an
-- approved QR order, or an order a waiter takes in person.
create or replace function public.orders_open_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.table_id is not null
     and coalesce(new.order_type, 'dine-in') = 'dine-in'
     and new.status not in ('awaiting_approval', 'cancelled') then
    update public.tables
    set    opened_at = now()
    where  id = new.table_id
      and  opened_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists orders_open_table on public.orders;
create trigger orders_open_table
  after insert or update of status on public.orders
  for each row execute function public.orders_open_table();

-- Settling a dine-in bill closes the table and rotates its session, so phones
-- from the group that just paid can no longer order onto it.
create or replace function public.billing_close_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.table_id is not null then
    update public.tables
    set    session_id = gen_random_uuid(),
           opened_at  = null
    where  id = new.table_id;
  end if;
  return null;
end;
$$;

drop trigger if exists billing_close_table on public.billing_history;
create trigger billing_close_table
  after insert on public.billing_history
  for each row execute function public.billing_close_table();

-- -----------------------------------------------------------------------------
-- 4. Shared table view (customer phones, no login)
-- -----------------------------------------------------------------------------
-- Returns NULL unless the caller holds the table's current session, which a
-- phone only gets by scanning a valid QR for this sitting.
create or replace function public.get_table_orders(p_table_id uuid, p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.tables where id = p_table_id and session_id = p_session_id
    ) then null
    else jsonb_build_object(
      'open', (select opened_at is not null from public.tables where id = p_table_id),
      'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',           o.id,
          'status',       o.status,
          'total_amount', o.total_amount,
          'order_time',   o.order_time,
          'device_tag',   o.device_tag,
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'menu_item_id', oi.menu_item_id,
              'item_name',    oi.item_name,
              'quantity',     oi.quantity,
              'unit_price',   oi.unit_price
            ) order by oi.item_name)
            from public.order_items oi
            where oi.order_id = o.id
              and not coalesce(oi.cancelled, false)
          ), '[]'::jsonb)
        ) order by o.order_time)
        from public.orders o
        where o.table_id = p_table_id
          and coalesce(o.order_type, 'dine-in') = 'dine-in'
          and o.status <> 'cancelled'
          and (o.session_id = p_session_id or o.session_id is null)
      ), '[]'::jsonb)
    )
  end;
$$;

grant execute on function public.get_table_orders(uuid, uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Staff actions
-- -----------------------------------------------------------------------------
create or replace function public.table_staff_check(p_table_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.tables where id = p_table_id;
  if v_restaurant is null then
    raise exception 'table not found';
  end if;
  if not (public.is_restaurant_admin(v_restaurant)
          or public.is_restaurant_station(v_restaurant)
          or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;
  return v_restaurant;
end;
$$;

revoke execute on function public.table_staff_check(uuid) from public, anon, authenticated;

-- Waiter or owner confirms guests are at the table: releases every order
-- waiting on it to the kitchen and opens the table.
create or replace function public.approve_table(p_table_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform public.table_staff_check(p_table_id);

  update public.orders
  set    status = 'pending'
  where  table_id = p_table_id
    and  status = 'awaiting_approval';
  get diagnostics v_count = row_count;

  update public.tables
  set    opened_at = coalesce(opened_at, now())
  where  id = p_table_id;

  return v_count;
end;
$$;

grant execute on function public.approve_table(uuid) to authenticated;

-- Nobody is at the table: the waiting orders are discarded.
create or replace function public.reject_table_orders(p_table_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform public.table_staff_check(p_table_id);

  update public.orders
  set    status = 'cancelled'
  where  table_id = p_table_id
    and  status = 'awaiting_approval';
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function public.reject_table_orders(uuid) to authenticated;

-- Invalidates every QR code previously issued for this table. Owner only,
-- because it also ends the current table session. Truncated to the second so
-- the new code generated right afterwards (stamped in whole seconds) is not
-- itself rejected.
create or replace function public.reset_table_qr(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.tables where id = p_table_id;
  if v_restaurant is null then
    raise exception 'table not found';
  end if;
  if not (public.is_restaurant_admin(v_restaurant) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  update public.tables
  set    qr_valid_after = date_trunc('second', now()),
         session_id     = gen_random_uuid(),
         opened_at      = null
  where  id = p_table_id;

  update public.orders
  set    status = 'cancelled'
  where  table_id = p_table_id
    and  status = 'awaiting_approval';
end;
$$;

grant execute on function public.reset_table_qr(uuid) to authenticated;
