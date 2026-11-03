-- =============================================================================
-- 39_station_settle_online_order.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Lets a delivery station settle the online order it just delivered, so the
-- bill closes at the moment the rider confirms delivery instead of waiting for
-- an admin to notice it in Billing.
--
-- Why this was needed: settlement only ever appeared in the Billing screen for
-- orders already marked 'delivered', and nothing marks an order delivered
-- automatically. An order dispatched and handed over sat at
-- 'out_for_delivery' — invisible to Billing, with the money unrecorded —
-- until somebody remembered to open the Delivery Panel and press the button.
--
-- Two changes:
--
-- 1. The caller may now also be a station of that restaurant. The rider is the
--    person who actually collected the cash, so they are the right one to
--    confirm what was paid.
--
-- 2. security invoker → security definer. Settling updates the restaurant's
--    bill counter, inserts into billing_history and deletes the order; under
--    invoker rights a station would need broad write access to all three
--    tables. Definer keeps those permissions out of station accounts and
--    relies on the explicit check below instead — the same pattern close_day()
--    and admin_place_order() already use.
--
-- The body is otherwise identical to migration 32.
-- =============================================================================

create or replace function public.settle_online_order(
  p_order_id       uuid,
  p_payment_method text    default 'cash',
  p_discount       numeric default 0,
  p_round_off      numeric default 0,
  p_package_charge numeric default 0
)
returns table(billing_id uuid, bill_number int)
language plpgsql
security definer
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

  if not (
    public.is_restaurant_admin(v_order.restaurant_id)
    or public.is_restaurant_station(v_order.restaurant_id)
    or public.is_super_admin()
  ) then
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
