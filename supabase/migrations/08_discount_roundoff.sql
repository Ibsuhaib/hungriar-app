-- =============================================================================
-- 08_discount_roundoff.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add adjustment columns to billing_history
-- -----------------------------------------------------------------------------
alter table public.billing_history
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists round_off       numeric(10,2) not null default 0;

-- -----------------------------------------------------------------------------
-- 2. Update reset_table_billing to accept discount and round-off,
--    store the adjusted final total and the adjustment values.
-- -----------------------------------------------------------------------------
create or replace function public.reset_table_billing(
  p_restaurant_id  uuid,
  p_table_id       uuid,
  p_payment_method text    default 'cash',
  p_discount       numeric default 0,
  p_round_off      numeric default 0
)
returns uuid language plpgsql security invoker set search_path = public
as $func$
declare
  v_total       numeric(10,2);
  v_orders_json jsonb;
  v_billing_id  uuid;
  v_final       numeric(10,2);
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

  if v_total = 0 then return null; end if;

  -- Apply discount then round-off; floor at zero
  v_final := greatest(
    round((v_total - coalesce(p_discount, 0) + coalesce(p_round_off, 0)) * 100) / 100,
    0
  );

  insert into public.billing_history
    (restaurant_id, table_id, total_amount, orders_json, payment_method, discount_amount, round_off)
  values
    (p_restaurant_id, p_table_id, v_final, v_orders_json, p_payment_method,
     coalesce(p_discount, 0), coalesce(p_round_off, 0))
  returning id into v_billing_id;

  delete from public.orders
  where restaurant_id = p_restaurant_id
    and table_id      = p_table_id
    and status        = 'completed';

  return v_billing_id;
end;
$func$;
