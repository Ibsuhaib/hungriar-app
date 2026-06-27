-- =============================================================================
-- 15_collection_periods.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds collection period tracking so admins can "reset" the payment dashboard
-- to zero without deleting any records.  Each reset inserts a row here;
-- analytics only counts data AFTER the latest reset timestamp.
-- =============================================================================

-- ── collection_resets table ───────────────────────────────────────────────────

create table if not exists public.collection_resets (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  reset_at      timestamptz not null default now()
);

create index if not exists idx_collection_resets_restaurant
  on public.collection_resets(restaurant_id, reset_at desc);

alter table public.collection_resets enable row level security;

drop policy if exists collection_resets_admin on public.collection_resets;
create policy collection_resets_admin on public.collection_resets
  for all to authenticated
  using  (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- ── Updated analytics RPC ─────────────────────────────────────────────────────
-- New optional parameter p_from timestamptz:
--   null  → all-time (legacy behaviour)
--   value → only count orders / bills / expenses / discounts AFTER that time

create or replace function public.get_restaurant_analytics(
  p_restaurant_id uuid,
  p_from          timestamptz default null
)
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

    -- total orders (live + settled), optionally filtered
    'total_orders', (
      (
        select count(*) from public.orders
        where restaurant_id = p_restaurant_id
          and (p_from is null or order_time >= p_from)
      ) + (
        select coalesce(sum(jsonb_array_length(orders_json)), 0)
        from public.billing_history
        where restaurant_id = p_restaurant_id
          and (p_from is null or bill_date >= p_from)
      )
    ),

    -- total revenue (live completed + settled), optionally filtered
    'total_revenue', (
      (
        select coalesce(sum(total_amount), 0)
        from public.orders
        where restaurant_id = p_restaurant_id
          and status = 'completed'
          and (p_from is null or order_time >= p_from)
      ) + (
        select coalesce(sum(total_amount), 0)
        from public.billing_history
        where restaurant_id = p_restaurant_id
          and (p_from is null or bill_date >= p_from)
      )
    ),

    -- top 5 selling items (from live orders), optionally filtered
    'top_items', (
      select coalesce(json_agg(t), '[]'::json) from (
        select oi.item_name                                     as name,
               sum(oi.quantity)::int                           as total_quantity,
               sum(oi.quantity * oi.unit_price)::numeric(10,2) as total_revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.restaurant_id = p_restaurant_id
          and (p_from is null or o.order_time >= p_from)
        group by oi.item_name
        order by total_quantity desc
        limit 5
      ) t
    ),

    -- orders per day for the last 7 days, optionally filtered
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
                     and (p_from is null or bh.bill_date >= p_from)
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
          and (p_from is null or o.order_time >= p_from)
        group by gs.day
        order by gs.day
      ) d
    ),

    -- collected per payment method, optionally filtered
    'payment_breakdown', (
      select coalesce(json_agg(p order by p.total desc), '[]'::json)
      from (
        select
          coalesce(nullif(trim(payment_method), ''), 'cash') as payment_method,
          count(*)::int                                       as count,
          coalesce(sum(total_amount), 0)::numeric(10,2)      as total
        from public.billing_history
        where restaurant_id = p_restaurant_id
          and (p_from is null or bill_date >= p_from)
        group by coalesce(nullif(trim(payment_method), ''), 'cash')
      ) p
    ),

    -- expenses per payment method, optionally filtered
    'expense_breakdown', (
      select coalesce(json_agg(e order by e.total desc), '[]'::json)
      from (
        select
          coalesce(nullif(trim(payment_method), ''), 'cash') as payment_method,
          count(*)::int                                       as count,
          coalesce(sum(amount), 0)::numeric(10,2)            as total
        from public.expenses
        where restaurant_id = p_restaurant_id
          and (p_from is null or expense_date >= p_from::date)
        group by coalesce(nullif(trim(payment_method), ''), 'cash')
      ) e
    ),

    -- total expenses, optionally filtered
    'total_expenses', (
      select coalesce(sum(amount), 0)::numeric(10,2)
      from public.expenses
      where restaurant_id = p_restaurant_id
        and (p_from is null or expense_date >= p_from::date)
    ),

    -- total discount, optionally filtered
    'total_discount', (
      select coalesce(sum(discount_amount), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
        and (p_from is null or bill_date >= p_from)
    ),

    -- total round-off, optionally filtered
    'total_round_off', (
      select coalesce(sum(round_off), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
        and (p_from is null or bill_date >= p_from)
    ),

    -- count of bills with discount, optionally filtered
    'discount_count', (
      select count(*)::int
      from public.billing_history
      where restaurant_id = p_restaurant_id
        and discount_amount > 0
        and (p_from is null or bill_date >= p_from)
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_restaurant_analytics(uuid, timestamptz) to authenticated;
