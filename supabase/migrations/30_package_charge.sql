-- =============================================================================
-- 30_package_charge.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds a "package charge" adjustment to bills — a flat fee (e.g. for takeaway
-- packaging) applied the same way discount and round-off already are: entered
-- per-bill at settle time, stored on billing_history, folded into the final
-- total, and rolled up into the analytics totals.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. package_charge column on billing_history
-- -----------------------------------------------------------------------------
alter table public.billing_history
  add column if not exists package_charge numeric(10,2) not null default 0;

-- -----------------------------------------------------------------------------
-- 2. reset_table_billing — accepts + stores the package charge
-- -----------------------------------------------------------------------------
drop function if exists public.reset_table_billing(uuid, uuid, text, numeric, numeric);

create function public.reset_table_billing(
  p_restaurant_id  uuid,
  p_table_id       uuid,
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

  -- Apply discount, then round-off, then package charge; floor at zero
  v_final := greatest(
    round((v_total - coalesce(p_discount, 0) + coalesce(p_round_off, 0) + coalesce(p_package_charge, 0)) * 100) / 100,
    0
  );

  -- Atomically reserve the next bill number for today (resets on close_day)
  update public.restaurants
  set    daily_bill_counter = daily_bill_counter + 1
  where  id = p_restaurant_id
  returning daily_bill_counter into v_bill_number;

  insert into public.billing_history
    (restaurant_id, table_id, total_amount, orders_json, payment_method, discount_amount, round_off, package_charge, bill_number)
  values
    (p_restaurant_id, p_table_id, v_final, v_orders_json, p_payment_method,
     coalesce(p_discount, 0), coalesce(p_round_off, 0), coalesce(p_package_charge, 0), v_bill_number)
  returning id into v_billing_id;

  delete from public.orders
  where restaurant_id = p_restaurant_id
    and table_id      = p_table_id
    and status        = 'completed';

  return query select v_billing_id, v_bill_number;
end;
$func$;

grant execute on function public.reset_table_billing(uuid, uuid, text, numeric, numeric, numeric)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 3. get_restaurant_analytics — roll up total package charges, same as discount
-- -----------------------------------------------------------------------------
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

    -- total package charges
    'total_package_charge', (
      select coalesce(sum(package_charge), 0)::numeric(10,2)
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
