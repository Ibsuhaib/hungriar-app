-- =============================================================================
-- 17_collection_category.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds a 'category' column to expenses so owner collections (money the owner
-- physically takes from the register) are separated from business expenses
-- (supplies, wages, utilities etc).  The analytics RPC is updated to return
-- both breakdowns so the UI can show the owner exactly what is still sitting
-- in the restaurant vs what was already spent.
-- =============================================================================

-- ── 1. Add category column ───────────────────────────────────────────────────

alter table public.expenses
  add column if not exists category text
  check (category in ('expense', 'collection'));

-- Backfill existing rows: anything whose description looks like an owner
-- collection (recorded via the Collect button which used 'Cash collection' etc.)
update public.expenses
set category = 'collection'
where category is null
  and description ilike '%collection%';

-- Everything else defaults to a business expense (null → treated as 'expense')

-- ── 2. Updated analytics RPC ─────────────────────────────────────────────────

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

    -- total orders (live + settled)
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

    -- total revenue (live completed + settled)
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

    -- top 5 selling items
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

    -- revenue collected per payment method (from customer bills)
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

    -- BUSINESS expenses per method (supplies, wages, utilities — NOT owner collections)
    -- filtered by created_at for precise period boundary
    'expense_breakdown', (
      select coalesce(json_agg(e order by e.total desc), '[]'::json)
      from (
        select
          coalesce(nullif(trim(payment_method), ''), 'cash') as payment_method,
          count(*)::int                                       as count,
          coalesce(sum(amount), 0)::numeric(10,2)            as total
        from public.expenses
        where restaurant_id = p_restaurant_id
          and (p_from is null or created_at >= p_from)
          and (category is null or category = 'expense')
        group by coalesce(nullif(trim(payment_method), ''), 'cash')
      ) e
    ),

    -- OWNER COLLECTIONS per method (money the owner physically took from register)
    'collection_breakdown', (
      select coalesce(json_agg(c order by c.total desc), '[]'::json)
      from (
        select
          coalesce(nullif(trim(payment_method), ''), 'cash') as payment_method,
          count(*)::int                                       as count,
          coalesce(sum(amount), 0)::numeric(10,2)            as total
        from public.expenses
        where restaurant_id = p_restaurant_id
          and (p_from is null or created_at >= p_from)
          and category = 'collection'
        group by coalesce(nullif(trim(payment_method), ''), 'cash')
      ) c
    ),

    -- total business expenses only
    'total_expenses', (
      select coalesce(sum(amount), 0)::numeric(10,2)
      from public.expenses
      where restaurant_id = p_restaurant_id
        and (p_from is null or created_at >= p_from)
        and (category is null or category = 'expense')
    ),

    -- total owner collections
    'total_collections', (
      select coalesce(sum(amount), 0)::numeric(10,2)
      from public.expenses
      where restaurant_id = p_restaurant_id
        and (p_from is null or created_at >= p_from)
        and category = 'collection'
    ),

    -- total discount
    'total_discount', (
      select coalesce(sum(discount_amount), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
        and (p_from is null or bill_date >= p_from)
    ),

    -- total round-off
    'total_round_off', (
      select coalesce(sum(round_off), 0)::numeric(10,2)
      from public.billing_history
      where restaurant_id = p_restaurant_id
        and (p_from is null or bill_date >= p_from)
    ),

    -- count of bills with discount
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
