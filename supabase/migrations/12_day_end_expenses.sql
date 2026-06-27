-- =============================================================================
-- 12_day_end_expenses.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- 1. expenses table  — records money paid out (vegetables, wages, utilities…)
-- 2. Updated get_restaurant_analytics — now includes expense breakdown so
--    the analytics page can show net amounts per payment method.
-- =============================================================================

-- ── 1. expenses table ─────────────────────────────────────────────────────────

create table if not exists public.expenses (
  id             uuid         primary key default gen_random_uuid(),
  restaurant_id  uuid         not null references public.restaurants(id) on delete cascade,
  description    text         not null,
  amount         numeric(10,2) not null check (amount > 0),
  payment_method text         not null default 'cash',
  expense_date   date         not null default current_date,
  created_at     timestamptz  not null default now()
);

create index if not exists idx_expenses_restaurant on public.expenses(restaurant_id);
create index if not exists idx_expenses_date       on public.expenses(expense_date);

alter table public.expenses enable row level security;

drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses
  for all to authenticated
  using  (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- ── 2. Updated analytics RPC ──────────────────────────────────────────────────

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

    -- total orders (live + settled)
    'total_orders', (
      (select count(*) from public.orders where restaurant_id = p_restaurant_id)
      +
      (select coalesce(sum(jsonb_array_length(orders_json)), 0)
         from public.billing_history where restaurant_id = p_restaurant_id)
    ),

    -- total revenue (live completed + settled)
    'total_revenue', (
      (select coalesce(sum(total_amount), 0) from public.orders
        where restaurant_id = p_restaurant_id and status = 'completed')
      +
      (select coalesce(sum(total_amount), 0) from public.billing_history
        where restaurant_id = p_restaurant_id)
    ),

    -- top 5 selling items (from live orders only — billing_history has rolled-up JSON)
    'top_items', (
      select coalesce(json_agg(t), '[]'::json) from (
        select oi.item_name                                            as name,
               sum(oi.quantity)::int                                   as total_quantity,
               sum(oi.quantity * oi.unit_price)::numeric(10,2)        as total_revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.restaurant_id = p_restaurant_id
        group by oi.item_name
        order by total_quantity desc
        limit 5
      ) t
    ),

    -- orders per day for the last 7 days
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

    -- collected per payment method (all-time, from settled bills)
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

    -- expenses paid out per payment method (all-time)
    'expense_breakdown', (
      select coalesce(json_agg(e order by e.total desc), '[]'::json)
      from (
        select
          coalesce(nullif(trim(payment_method), ''), 'cash') as payment_method,
          count(*)::int                                       as count,
          coalesce(sum(amount), 0)::numeric(10,2)            as total
        from public.expenses
        where restaurant_id = p_restaurant_id
        group by coalesce(nullif(trim(payment_method), ''), 'cash')
      ) e
    ),

    -- total expenses (all-time)
    'total_expenses', (
      select coalesce(sum(amount), 0)::numeric(10,2)
      from public.expenses
      where restaurant_id = p_restaurant_id
    ),

    -- total discount given (all-time)
    'total_discount', (
      select coalesce(sum(discount_amount), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
    ),

    -- total round-off (all-time, negative = customer saved money)
    'total_round_off', (
      select coalesce(sum(round_off), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
    ),

    -- number of bills that had a discount
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
