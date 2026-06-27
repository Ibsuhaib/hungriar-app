-- =============================================================================
-- 13_day_close.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Tracks day-end close events per restaurant.
-- close_day() RPC: cancels all remaining active orders, records the close.
-- =============================================================================

-- ── day_closes table ──────────────────────────────────────────────────────────

create table if not exists public.day_closes (
  id              uuid          primary key default gen_random_uuid(),
  restaurant_id   uuid          not null references public.restaurants(id) on delete cascade,
  close_date      date          not null,
  total_collected numeric(10,2) not null default 0,
  total_expenses  numeric(10,2) not null default 0,
  net_total       numeric(10,2) not null default 0,
  summary_json    jsonb,
  closed_at       timestamptz   not null default now(),
  unique (restaurant_id, close_date)
);

create index if not exists idx_day_closes_restaurant on public.day_closes(restaurant_id);
create index if not exists idx_day_closes_date       on public.day_closes(close_date);

alter table public.day_closes enable row level security;

drop policy if exists day_closes_admin on public.day_closes;
create policy day_closes_admin on public.day_closes
  for all to authenticated
  using  (public.is_restaurant_admin(restaurant_id) or public.is_super_admin())
  with check (public.is_restaurant_admin(restaurant_id) or public.is_super_admin());

-- ── close_day RPC ─────────────────────────────────────────────────────────────
-- Cancels all remaining active orders for the restaurant and saves a
-- day-end record.  Idempotent: calling it twice on the same date updates
-- the existing record instead of inserting a duplicate.

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
end;
$$;

grant execute on function public.close_day(uuid, date, numeric, numeric, numeric, jsonb)
  to authenticated;
