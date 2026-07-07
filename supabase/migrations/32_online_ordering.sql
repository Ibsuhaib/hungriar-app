-- =============================================================================
-- 32_online_ordering.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run — all statements use IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS.
-- =============================================================================
-- hungriOrder integration: adds online delivery/takeaway ordering on top of
-- the existing dine-in POS. STRICTLY ADDITIVE for existing behaviour:
--   • No column or table is dropped or renamed.
--   • Every new column has a default that keeps existing rows working.
--   • Existing dine-in orders keep order_type = 'dine-in' and behave
--     exactly as before.
--   • The only relaxed constraints are NOT NULL on orders.table_id and
--     billing_history.table_id (online orders have no physical table);
--     every existing write path still supplies a table_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. restaurants — online storefront fields
--    (slug, address, phone already exist and are reused as-is)
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists cover_image_url     text,
  add column if not exists description         text,
  add column if not exists cuisine_tags        text[] not null default '{}',
  add column if not exists delivery_enabled    boolean not null default false,
  add column if not exists delivery_radius_km  integer not null default 5,
  add column if not exists min_order_amount    numeric(10,2) not null default 0,
  add column if not exists delivery_fee        numeric(10,2) not null default 0,
  add column if not exists opening_hours       jsonb not null default '{}'::jsonb,
  add column if not exists subscription_tier   text not null default 'trial',
  add column if not exists subscription_expiry timestamptz default (now() + interval '30 days'),
  add column if not exists is_active           boolean not null default true,
  add column if not exists has_hungriar        boolean not null default true;

-- subscription_tier sanity check (new column → safe to constrain)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_subscription_tier_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_subscription_tier_check
      check (subscription_tier in ('trial', 'starter', 'growth', 'pro'));
  end if;
end $$;

-- Extend the existing protection trigger so restaurant admins cannot edit
-- their own online-ordering subscription fields (same pattern as the POS
-- subscription fields it already protects). Purely additive: every field it
-- protected before is still protected.
create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    new.subscription_status := old.subscription_status;
    new.trial_ends_at := old.trial_ends_at;
    new.paid_until_at := old.paid_until_at;
    new.super_admin_notes := old.super_admin_notes;
    new.slug := old.slug;
    -- online ordering subscription (hungriOrder) — super admin only
    new.subscription_tier := old.subscription_tier;
    new.subscription_expiry := old.subscription_expiry;
    new.is_active := old.is_active;
    new.has_hungriar := old.has_hungriar;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. menu_items — veg/non-veg badge for the online storefront (nullable:
--    existing items simply don't show a badge until the admin sets it)
-- -----------------------------------------------------------------------------
alter table public.menu_items
  add column if not exists is_veg boolean;

-- -----------------------------------------------------------------------------
-- 3. orders — online order fields
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists order_type       text not null default 'dine-in',
  add column if not exists delivery_address jsonb,
  add column if not exists customer_phone   text,
  add column if not exists customer_name    text,
  add column if not exists customer_id      uuid,
  add column if not exists notes            text,
  add column if not exists delivery_fee     numeric(10,2) not null default 0,
  add column if not exists payment_method   text not null default 'cash';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_order_type_check'
  ) then
    alter table public.orders
      add constraint orders_order_type_check
      check (order_type in ('dine-in', 'delivery', 'takeaway'));
  end if;
end $$;

-- Delivery orders have no physical table. Existing dine-in write paths
-- (place-order, admin_place_order, staff_place_order) always supply table_id,
-- so relaxing NOT NULL changes nothing for them.
alter table public.orders alter column table_id drop not null;

-- Extend the status vocabulary with the online-order lifecycle.
-- All existing statuses remain valid — same drop/re-add pattern as
-- migration 06 used when it added 'cancelled'.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'pending', 'preparing', 'served', 'completed', 'cancelled',   -- existing
    'confirmed', 'ready', 'out_for_delivery', 'delivered'         -- online flow
  ));

create index if not exists idx_orders_order_type on public.orders (restaurant_id, order_type);

-- -----------------------------------------------------------------------------
-- 4. billing_history — allow archiving online orders (no table) and keep the
--    order type + customer name for readable history rows
-- -----------------------------------------------------------------------------
alter table public.billing_history alter column table_id drop not null;

alter table public.billing_history
  add column if not exists order_type    text not null default 'dine-in',
  add column if not exists customer_name text,
  add column if not exists delivery_fee  numeric(10,2) not null default 0;

-- -----------------------------------------------------------------------------
-- 5. customers — online storefront customer profiles (phone-OTP accounts).
--    id mirrors auth.users.id. Guest checkout stores snapshots on the order
--    and never creates a row here.
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key references auth.users (id) on delete cascade,
  phone      text unique,
  name       text,
  email      text,
  addresses  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists customers_select_own on public.customers;
create policy customers_select_own on public.customers
  for select to authenticated
  using (id = auth.uid());

drop policy if exists customers_insert_own on public.customers;
create policy customers_insert_own on public.customers
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists customers_update_own on public.customers;
create policy customers_update_own on public.customers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. subscriptions — online-ordering billing records (super admin only)
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  plan          text not null,
  amount        numeric(10,2) not null default 0 check (amount >= 0),
  start_date    date,
  end_date      date,
  status        text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_subscriptions_restaurant on public.subscriptions (restaurant_id);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_super_admin on public.subscriptions;
create policy subscriptions_super_admin on public.subscriptions
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 7. orders SELECT policy — protect customer PII.
--    The previous policy exposed all orders of a visible restaurant to anon
--    (safe when orders only contained table/kitchen data — that is how the QR
--    OrderStatus page polls without auth). Online orders now carry a phone
--    number and address, so the anonymous leg is limited to dine-in orders.
--    Dine-in behaviour is IDENTICAL to before (every existing order is
--    dine-in); online orders are readable only by their customer, the
--    restaurant's admins, or via the get_order_tracking() RPC below.
-- -----------------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to anon, authenticated
  using (
    (public.restaurant_is_visible(restaurant_id) and order_type = 'dine-in')
    or customer_id = auth.uid()
    or public.is_restaurant_admin(restaurant_id)
    or public.is_super_admin()
  );

-- -----------------------------------------------------------------------------
-- 8. get_order_tracking — public tracking by (unguessable) order UUID for the
--    online storefront. Returns only what the tracking page needs.
-- -----------------------------------------------------------------------------
create or replace function public.get_order_tracking(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'order_type', o.order_type,
    'created_at', o.created_at,
    'subtotal', round((o.total_amount - coalesce(o.delivery_fee, 0)) * 100) / 100,
    'tax', round(
      (
        (o.total_amount - coalesce(o.delivery_fee, 0))
        - (o.total_amount - coalesce(o.delivery_fee, 0)) / (1 + coalesce(r.tax_percentage, 0) / 100)
      ) * 100
    ) / 100,
    'discount', 0,
    'delivery_fee', coalesce(o.delivery_fee, 0),
    'total', o.total_amount,
    'payment_method', o.payment_method,
    'delivery_address', o.delivery_address,
    'notes', o.notes,
    'customer_name', o.customer_name,
    'restaurant', jsonb_build_object(
      'name', r.name, 'phone', r.phone, 'slug', r.slug, 'logo_url', r.logo_url
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', oi.item_name,
        'quantity', oi.quantity,
        'price', oi.unit_price,
        'line_total', round(oi.quantity * oi.unit_price * 100) / 100
      ) order by oi.item_name), '[]'::jsonb)
      from public.order_items oi
      where oi.order_id = o.id
        and not coalesce(oi.cancelled, false)
    )
  )
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.id = p_order_id
    and o.order_type in ('delivery', 'takeaway');
$$;

grant execute on function public.get_order_tracking(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. create_online_order — atomic insert used by the place-online-order edge
--    function (service role). Not callable by clients.
-- -----------------------------------------------------------------------------
create or replace function public.create_online_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  insert into public.orders (
    restaurant_id, table_id, status, total_amount,
    order_type, delivery_address, customer_phone, customer_name,
    customer_id, notes, delivery_fee, payment_method
  ) values (
    (p_order->>'restaurant_id')::uuid,
    null,
    'pending',
    (p_order->>'total_amount')::numeric,
    p_order->>'order_type',
    p_order->'delivery_address',
    p_order->>'customer_phone',
    p_order->>'customer_name',
    nullif(p_order->>'customer_id', '')::uuid,
    p_order->>'notes',
    coalesce((p_order->>'delivery_fee')::numeric, 0),
    coalesce(p_order->>'payment_method', 'cash')
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, menu_item_id, item_name, quantity, unit_price, notes)
  select
    v_order_id,
    (i->>'menu_item_id')::uuid,
    i->>'item_name',
    (i->>'quantity')::int,
    (i->>'unit_price')::numeric,
    coalesce(i->>'notes', '')
  from jsonb_array_elements(p_items) as i;

  return v_order_id;
end;
$$;

revoke execute on function public.create_online_order(jsonb, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 10. admin_place_online_order — walk-in delivery/takeaway from the Take Order
--     page. Mirrors admin_place_order (incl. open-order items) but writes an
--     online order with no table.
-- -----------------------------------------------------------------------------
create or replace function public.admin_place_online_order(
  p_restaurant_id    uuid,
  p_order_type       text,
  p_items            jsonb,
  p_customer_phone   text default null,
  p_customer_name    text default null,
  p_delivery_address jsonb default null,
  p_order_id         uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_name     text;
  v_price    numeric;
  v_qty      int;
  v_notes    text;
  v_subtotal numeric(10,2) := 0;
  v_tax_pct  numeric;
  v_total    numeric(10,2);
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  if p_order_type not in ('delivery', 'takeaway') then
    raise exception 'invalid order type';
  end if;

  insert into public.orders (id, restaurant_id, table_id, status, total_amount,
                             order_type, customer_phone, customer_name, delivery_address)
  values (coalesce(p_order_id, gen_random_uuid()), p_restaurant_id, null, 'pending', 0,
          p_order_type,
          nullif(trim(coalesce(p_customer_phone, '')), ''),
          nullif(trim(coalesce(p_customer_name, '')), ''),
          p_delivery_address)
  on conflict (id) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    return p_order_id;  -- already placed earlier → no-op
  end if;

  select coalesce(tax_percentage, 0) into v_tax_pct
  from public.restaurants where id = p_restaurant_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'menu_item_id') is not null then
      select name, price into v_name, v_price
      from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid
        and restaurant_id = p_restaurant_id
        and available = true;
    else
      v_name  := nullif(trim(coalesce(v_item->>'custom_name', '')), '');
      v_price := (v_item->>'custom_price')::numeric;
      if v_price is null or v_price <= 0 then v_name := null; end if;
    end if;

    if v_name is null then continue; end if;

    v_qty   := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_notes := coalesce(nullif(trim(v_item->>'notes'), ''), '');

    insert into public.order_items
      (order_id, menu_item_id, item_name, quantity, unit_price, notes)
    values
      (v_order_id, (v_item->>'menu_item_id')::uuid, v_name, v_qty, v_price, v_notes);

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  if v_subtotal = 0 then
    delete from public.orders where id = v_order_id;
    raise exception 'No available items in order';
  end if;

  v_total := round(v_subtotal * (1 + v_tax_pct / 100) * 100) / 100;
  update public.orders set total_amount = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.admin_place_online_order(uuid, text, jsonb, text, text, jsonb, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 11. settle_online_order — Billing page settlement for a delivery/takeaway
--     order. Mirrors reset_table_billing (bill number, discount, round-off,
--     package charge, archive to billing_history, delete live order) but for
--     a single online order with no table to free.
-- -----------------------------------------------------------------------------
create or replace function public.settle_online_order(
  p_order_id       uuid,
  p_payment_method text    default 'cash',
  p_discount       numeric default 0,
  p_round_off      numeric default 0,
  p_package_charge numeric default 0
)
returns table(billing_id uuid, bill_number int)
language plpgsql
security invoker
set search_path = public
as $func$
declare
  v_order       public.orders%rowtype;
  v_orders_json jsonb;
  v_billing_id  uuid;
  v_final       numeric(10,2);
  v_bill_number int;
begin
  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null then
    raise exception 'order not found';
  end if;

  if not (public.is_restaurant_admin(v_order.restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  if v_order.order_type not in ('delivery', 'takeaway') then
    raise exception 'not an online order';
  end if;

  if v_order.status not in ('completed', 'delivered') then
    raise exception 'order is not ready to settle';
  end if;

  select jsonb_build_array(
    jsonb_build_object(
      'id',           v_order.id,
      'total_amount', v_order.total_amount,
      'order_time',   v_order.order_time,
      'order_type',   v_order.order_type,
      'customer_name',  v_order.customer_name,
      'customer_phone', v_order.customer_phone,
      'delivery_fee',   v_order.delivery_fee,
      'items', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'item_name',  oi.item_name,
            'quantity',   oi.quantity,
            'unit_price', oi.unit_price
          )
        ), '[]'::jsonb)
        from public.order_items oi
        where oi.order_id = v_order.id
          and not coalesce(oi.cancelled, false)
      )
    )
  ) into v_orders_json;

  v_final := greatest(
    round((v_order.total_amount - coalesce(p_discount, 0) + coalesce(p_round_off, 0) + coalesce(p_package_charge, 0)) * 100) / 100,
    0
  );

  update public.restaurants
  set    daily_bill_counter = daily_bill_counter + 1
  where  id = v_order.restaurant_id
  returning daily_bill_counter into v_bill_number;

  insert into public.billing_history
    (restaurant_id, table_id, total_amount, orders_json, payment_method,
     discount_amount, round_off, package_charge, bill_number,
     order_type, customer_name, delivery_fee)
  values
    (v_order.restaurant_id, null, v_final, v_orders_json, p_payment_method,
     coalesce(p_discount, 0), coalesce(p_round_off, 0), coalesce(p_package_charge, 0), v_bill_number,
     v_order.order_type, v_order.customer_name, coalesce(v_order.delivery_fee, 0))
  returning id into v_billing_id;

  delete from public.orders where id = p_order_id;

  return query select v_billing_id, v_bill_number;
end;
$func$;

grant execute on function public.settle_online_order(uuid, text, numeric, numeric, numeric)
  to authenticated;
