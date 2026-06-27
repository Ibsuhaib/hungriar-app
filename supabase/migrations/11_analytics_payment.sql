-- =============================================================================
-- 11_analytics_payment.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Extends get_restaurant_analytics to include:
--   payment_breakdown  — total collected per payment method
--   total_discount     — sum of all discounts given
--   total_round_off    — sum of all round-offs applied
-- =============================================================================

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

    -- ── existing fields ────────────────────────────────────────────────────
    'total_orders', (
      (select count(*) from public.orders where restaurant_id = p_restaurant_id)
      +
      (select coalesce(sum(jsonb_array_length(orders_json)), 0)
         from public.billing_history where restaurant_id = p_restaurant_id)
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
               sum(oi.quantity)::int            as total_quantity,
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
        from generate_series(
               current_date - interval '6 days',
               current_date,
               interval '1 day'
             ) as gs(day)
        left join public.orders o
          on  o.restaurant_id = p_restaurant_id
          and date_trunc('day', o.order_time) = gs.day
        group by gs.day
        order by gs.day
      ) d
    ),

    -- ── new fields ─────────────────────────────────────────────────────────

    -- Per-method totals (cash, upi, card …).
    -- Rows with NULL payment_method are treated as 'cash'.
    'payment_breakdown', (
      select coalesce(json_agg(p order by p.total desc), '[]'::json)
      from (
        select
          coalesce(nullif(trim(payment_method), ''), 'cash') as payment_method,
          count(*)::int                                       as count,
          coalesce(sum(total_amount), 0)::numeric(10,2)      as total
        from public.billing_history
        where restaurant_id = p_restaurant_id
        group by coalesce(nullif(trim(payment_method), ''), 'cash')
      ) p
    ),

    -- Total discount amount given across all settled bills
    'total_discount', (
      select coalesce(sum(discount_amount), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
    ),

    -- Total round-off applied (negative = money saved for customer)
    'total_round_off', (
      select coalesce(sum(round_off), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
    ),

    -- Count of bills that had a discount applied
    'discount_count', (
      select count(*)::int
      from public.billing_history
      where restaurant_id = p_restaurant_id
        and discount_amount > 0
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_restaurant_analytics(uuid) to authenticated;
