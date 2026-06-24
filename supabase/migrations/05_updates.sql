-- =============================================================================
-- 05_updates.sql
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Chef PIN on restaurants
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists chef_pin text;

-- -----------------------------------------------------------------------------
-- 2. Notes on order_items
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists notes text;

-- -----------------------------------------------------------------------------
-- 3. Push subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, endpoint)
);

create index if not exists idx_push_subs_restaurant on public.push_subscriptions (restaurant_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_admin on public.push_subscriptions;
create policy push_subscriptions_admin on public.push_subscriptions
  for all
  using  (public.is_restaurant_admin(restaurant_id))
  with check (public.is_restaurant_admin(restaurant_id));

-- -----------------------------------------------------------------------------
-- 4. Analytics function (re-run to ensure billing_history is included)
-- -----------------------------------------------------------------------------
create or replace function public.get_restaurant_analytics(p_restaurant_id uuid)
returns json
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_result json;
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  select json_build_object(
    'total_orders', (
      (select count(*) from public.orders where restaurant_id = p_restaurant_id)
      +
      (select coalesce(sum(jsonb_array_length(orders_json)), 0) from public.billing_history where restaurant_id = p_restaurant_id)
    ),
    'total_revenue', (
      (select coalesce(sum(total_amount), 0) from public.orders
       where restaurant_id = p_restaurant_id and status = 'completed')
      +
      (select coalesce(sum(total_amount), 0) from public.billing_history
       where restaurant_id = p_restaurant_id)
    ),
    'top_items', (
      select coalesce(json_agg(t), '[]'::json) from (
        select oi.item_name as name,
               sum(oi.quantity)::int as total_quantity,
               sum(oi.quantity * oi.unit_price)::numeric(10,2) as total_revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.restaurant_id = p_restaurant_id
        group by oi.item_name
        order by total_quantity desc
        limit 5
      ) t
    ),
    'daily_orders', (
      select coalesce(json_agg(d), '[]'::json) from (
        select to_char(gs.day, 'YYYY-MM-DD') as date,
               (
                 coalesce(count(o.id), 0) +
                 coalesce((
                   select sum(jsonb_array_length(bh.orders_json))
                   from public.billing_history bh
                   where bh.restaurant_id = p_restaurant_id
                     and date_trunc('day', bh.bill_date) = gs.day
                 ), 0)
               )::int as count
        from generate_series(current_date - interval '6 days', current_date, interval '1 day') as gs(day)
        left join public.orders o
          on o.restaurant_id = p_restaurant_id
          and date_trunc('day', o.order_time) = gs.day
        group by gs.day
        order by gs.day
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_restaurant_analytics(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Allow restaurant admins to delete their own billing history
-- -----------------------------------------------------------------------------
drop policy if exists billing_history_delete on public.billing_history;
create policy billing_history_delete on public.billing_history
  for delete to authenticated
  using (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 6. Fix reset_table_billing — store full order details, not just IDs
--    Previous version stored jsonb_agg(id) (array of UUIDs); History page
--    needs total_amount and items to display correctly.
-- -----------------------------------------------------------------------------
create or replace function public.reset_table_billing(p_restaurant_id uuid, p_table_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total     numeric(10,2);
  v_orders_json jsonb;
  v_billing_id  uuid;
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  select
    coalesce(sum(o.total_amount), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',           o.id,
          'total_amount', o.total_amount,
          'order_time',   o.order_time,
          'items', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'item_name',  oi.item_name,
                'quantity',   oi.quantity,
                'unit_price', oi.unit_price
              )
            ), '[]'::jsonb)
            from public.order_items oi
            where oi.order_id = o.id
          )
        )
      ),
      '[]'::jsonb
    )
  into v_total, v_orders_json
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.table_id      = p_table_id
    and o.status        = 'completed';

  if v_total = 0 then
    return null;
  end if;

  insert into public.billing_history (restaurant_id, table_id, total_amount, orders_json)
  values (p_restaurant_id, p_table_id, v_total, v_orders_json)
  returning id into v_billing_id;

  delete from public.orders
  where restaurant_id = p_restaurant_id
    and table_id      = p_table_id
    and status        = 'completed';

  return v_billing_id;
end;
$$;
