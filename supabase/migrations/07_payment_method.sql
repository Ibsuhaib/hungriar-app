-- =============================================================================
-- 07_payment_method.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run — all statements use CREATE OR REPLACE / IF NOT EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add payment_method column to billing_history
-- -----------------------------------------------------------------------------
alter table public.billing_history
  add column if not exists payment_method text;

-- -----------------------------------------------------------------------------
-- 2. Update reset_table_billing to accept and store payment_method.
--    Also filters out cancelled order_items from the snapshot so they don't
--    appear in history.
-- -----------------------------------------------------------------------------
create or replace function public.reset_table_billing(
  p_restaurant_id  uuid,
  p_table_id       uuid,
  p_payment_method text default 'cash'
)
returns uuid language plpgsql security invoker set search_path = public
as $func$
declare
  v_total       numeric(10,2);
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

  insert into public.billing_history (restaurant_id, table_id, total_amount, orders_json, payment_method)
  values (p_restaurant_id, p_table_id, v_total, v_orders_json, p_payment_method)
  returning id into v_billing_id;

  delete from public.orders
  where restaurant_id = p_restaurant_id
    and table_id      = p_table_id
    and status        = 'completed';

  return v_billing_id;
end;
$func$;
