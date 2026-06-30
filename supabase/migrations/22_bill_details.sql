-- =============================================================================
-- 22_bill_details.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds restaurant business details (address, phone, GSTIN, FSSAI license) for
-- printed bills, plus a per-restaurant daily bill number sequence that resets
-- when the day is closed (close_day RPC).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Business detail fields + daily bill counter on restaurants
-- -----------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists address            text,
  add column if not exists phone              text,
  add column if not exists gstin              text,
  add column if not exists fssai_license_no   text,
  add column if not exists daily_bill_counter int not null default 0;

-- -----------------------------------------------------------------------------
-- 2. Bill number column on billing_history — assigned atomically at settle time
-- -----------------------------------------------------------------------------
alter table public.billing_history
  add column if not exists bill_number int;

-- -----------------------------------------------------------------------------
-- 3. reset_table_billing — now also reserves + returns the next bill number
--    Return type changes from `uuid` to `table(billing_id uuid, bill_number int)`,
--    so the old function must be dropped before recreating.
-- -----------------------------------------------------------------------------
drop function if exists public.reset_table_billing(uuid, uuid, text, numeric, numeric);

create function public.reset_table_billing(
  p_restaurant_id  uuid,
  p_table_id       uuid,
  p_payment_method text    default 'cash',
  p_discount       numeric default 0,
  p_round_off      numeric default 0
)
returns table(billing_id uuid, bill_number int)
language plpgsql
security invoker
set search_path = public
as $func$
declare
  v_total       numeric(10,2);
  v_orders_json jsonb;
  v_billing_id  uuid;
  v_final       numeric(10,2);
  v_bill_number int;
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
              and not coalesce(oi.cancelled, false)
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
    return;
  end if;

  -- Apply discount then round-off; floor at zero
  v_final := greatest(
    round((v_total - coalesce(p_discount, 0) + coalesce(p_round_off, 0)) * 100) / 100,
    0
  );

  -- Atomically reserve the next bill number for today (resets on close_day)
  update public.restaurants
  set    daily_bill_counter = daily_bill_counter + 1
  where  id = p_restaurant_id
  returning daily_bill_counter into v_bill_number;

  insert into public.billing_history
    (restaurant_id, table_id, total_amount, orders_json, payment_method, discount_amount, round_off, bill_number)
  values
    (p_restaurant_id, p_table_id, v_final, v_orders_json, p_payment_method,
     coalesce(p_discount, 0), coalesce(p_round_off, 0), v_bill_number)
  returning id into v_billing_id;

  delete from public.orders
  where restaurant_id = p_restaurant_id
    and table_id      = p_table_id
    and status        = 'completed';

  return query select v_billing_id, v_bill_number;
end;
$func$;

grant execute on function public.reset_table_billing(uuid, uuid, text, numeric, numeric)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 4. close_day — also resets the daily bill number sequence for the next
--    business day.
-- -----------------------------------------------------------------------------
create or replace function public.close_day(
  p_restaurant_id  uuid,
  p_close_date     date,
  p_total_collected numeric default 0,
  p_total_expenses  numeric default 0,
  p_net_total       numeric default 0,
  p_summary_json    jsonb   default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  -- Cancel every order that is still active (pending / preparing / served)
  update public.orders
  set    status = 'cancelled'
  where  restaurant_id = p_restaurant_id
    and  status in ('pending', 'preparing', 'served');

  -- Save (or overwrite) the day-close record
  insert into public.day_closes
    (restaurant_id, close_date, total_collected, total_expenses, net_total, summary_json)
  values
    (p_restaurant_id, p_close_date, p_total_collected, p_total_expenses, p_net_total, p_summary_json)
  on conflict (restaurant_id, close_date) do update
    set total_collected = excluded.total_collected,
        total_expenses  = excluded.total_expenses,
        net_total       = excluded.net_total,
        summary_json    = excluded.summary_json,
        closed_at       = now();

  -- Reset the daily bill number sequence for the next business day
  update public.restaurants
  set    daily_bill_counter = 0
  where  id = p_restaurant_id;
end;
$$;

grant execute on function public.close_day(uuid, date, numeric, numeric, numeric, jsonb)
  to authenticated;
