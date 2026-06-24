-- =============================================================================
-- Goana AR - 01_schema.sql
-- Core tables, indexes and helper / business-logic functions
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- restaurants
-- -----------------------------------------------------------------------------
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  contact_email text,
  currency text not null default '₹',
  tax_percentage numeric(5,2) not null default 5 check (tax_percentage >= 0 and tax_percentage <= 50),
  subscription_status text not null default 'trial' check (subscription_status in ('trial','active','expired','inactive')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  paid_until_at timestamptz,
  super_admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurants_slug on public.restaurants (slug);

-- -----------------------------------------------------------------------------
-- user_roles
-- -----------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin','super_admin')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- restaurant_admins
-- -----------------------------------------------------------------------------
create table if not exists public.restaurant_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  agreement_accepted_at timestamptz,
  agreement_version text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

create index if not exists idx_restaurant_admins_user on public.restaurant_admins (user_id);
create index if not exists idx_restaurant_admins_restaurant on public.restaurant_admins (restaurant_id);

-- -----------------------------------------------------------------------------
-- subscription_payments
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  payment_date date not null default current_date,
  method text not null default 'upi' check (method in ('upi','cash','bank_transfer','other')),
  receipt_number text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_payments_restaurant on public.subscription_payments (restaurant_id);

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_restaurant on public.categories (restaurant_id);

-- -----------------------------------------------------------------------------
-- menu_items
-- -----------------------------------------------------------------------------
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  ar_model_url text,
  available boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_menu_items_restaurant on public.menu_items (restaurant_id);
create index if not exists idx_menu_items_category on public.menu_items (category_id);

-- -----------------------------------------------------------------------------
-- tables
-- -----------------------------------------------------------------------------
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_number text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

create index if not exists idx_tables_restaurant on public.tables (restaurant_id);

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid not null references public.tables (id) on delete cascade,
  order_time timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','preparing','served','completed')),
  total_amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_restaurant on public.orders (restaurant_id);
create index if not exists idx_orders_table on public.orders (table_id);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_order_time on public.orders (order_time);

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name text not null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0)
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- -----------------------------------------------------------------------------
-- billing_history
-- -----------------------------------------------------------------------------
create table if not exists public.billing_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  table_id uuid not null references public.tables (id) on delete cascade,
  bill_date timestamptz not null default now(),
  total_amount numeric(10,2) not null default 0,
  orders_json jsonb not null default '[]'::jsonb
);

create index if not exists idx_billing_history_restaurant on public.billing_history (restaurant_id);
create index if not exists idx_billing_history_table on public.billing_history (table_id);
create index if not exists idx_billing_history_date on public.billing_history (bill_date);

-- -----------------------------------------------------------------------------
-- rate_limits
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  type text not null check (type in ('customer','admin')),
  request_count int not null default 1,
  reset_at timestamptz not null,
  unique (identifier, type)
);

create index if not exists idx_rate_limits_reset on public.rate_limits (reset_at);

-- -----------------------------------------------------------------------------
-- admin_sessions
-- -----------------------------------------------------------------------------
create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fingerprint_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_sessions_user on public.admin_sessions (user_id);
create index if not exists idx_admin_sessions_expires on public.admin_sessions (expires_at);

-- =============================================================================
-- Helper functions (security definer - used inside RLS policies)
-- =============================================================================

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.is_restaurant_admin(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_admins
    where restaurant_id = target_restaurant_id and user_id = auth.uid()
  );
$$;

create or replace function public.restaurant_is_visible(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurants
    where id = p_restaurant_id and subscription_status <> 'inactive'
  );
$$;

-- =============================================================================
-- Protect subscription fields from being changed by restaurant admins
-- =============================================================================

create or replace function public.protect_subscription_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    new.subscription_status := old.subscription_status;
    new.trial_ends_at := old.trial_ends_at;
    new.paid_until_at := old.paid_until_at;
    new.super_admin_notes := old.super_admin_notes;
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_subscription_fields on public.restaurants;
create trigger trg_protect_subscription_fields
  before update on public.restaurants
  for each row execute function public.protect_subscription_fields();

-- =============================================================================
-- Rate limiting
-- =============================================================================

create or replace function public.check_rate_limit(p_identifier text, p_type text, p_limit int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limits%rowtype;
  v_now timestamptz := now();
  v_window interval := interval '1 minute';
begin
  if p_type not in ('customer','admin') then
    raise exception 'invalid rate limit type';
  end if;

  if p_identifier is null or length(p_identifier) = 0 or length(p_identifier) > 200 then
    raise exception 'invalid identifier';
  end if;

  select * into v_row from public.rate_limits
  where identifier = p_identifier and type = p_type
  for update;

  if v_row.id is null then
    insert into public.rate_limits (identifier, type, request_count, reset_at)
    values (p_identifier, p_type, 1, v_now + v_window)
    on conflict (identifier, type) do update
      set request_count = 1, reset_at = v_now + v_window;
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  if v_row.reset_at <= v_now then
    update public.rate_limits
    set request_count = 1, reset_at = v_now + v_window
    where id = v_row.id;
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  if v_row.request_count >= p_limit then
    return jsonb_build_object('allowed', false, 'retry_after', greatest(extract(epoch from (v_row.reset_at - v_now))::int, 1));
  end if;

  update public.rate_limits
  set request_count = request_count + 1
  where id = v_row.id;

  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

grant execute on function public.check_rate_limit(text, text, int) to anon, authenticated;

create or replace function public.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where reset_at < now() - interval '1 day';
  delete from public.admin_sessions where expires_at < now() - interval '1 day';
$$;

grant execute on function public.cleanup_rate_limits() to service_role;

-- =============================================================================
-- Admin session / device fingerprint (login replay protection)
-- =============================================================================

create or replace function public.upsert_admin_session(p_fingerprint_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fingerprint_hash is null or length(p_fingerprint_hash) <> 64 then
    raise exception 'invalid fingerprint';
  end if;

  delete from public.admin_sessions where user_id = auth.uid();

  insert into public.admin_sessions (user_id, fingerprint_hash, expires_at)
  values (auth.uid(), p_fingerprint_hash, now() + interval '15 minutes');
end;
$$;

grant execute on function public.upsert_admin_session(text) to authenticated;

create or replace function public.validate_admin_session(p_fingerprint_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_sessions
    where user_id = auth.uid()
      and fingerprint_hash = p_fingerprint_hash
      and expires_at > now()
  );
$$;

grant execute on function public.validate_admin_session(text) to authenticated;

-- =============================================================================
-- Billing: reset a table (move completed orders to billing_history)
-- =============================================================================

create or replace function public.reset_table_billing(p_restaurant_id uuid, p_table_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric(10,2);
  v_orders_json jsonb;
  v_billing_id uuid;
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(total_amount), 0), coalesce(jsonb_agg(id), '[]'::jsonb)
  into v_total, v_orders_json
  from public.orders
  where restaurant_id = p_restaurant_id and table_id = p_table_id and status = 'completed';

  if v_total = 0 then
    return null;
  end if;

  insert into public.billing_history (restaurant_id, table_id, total_amount, orders_json)
  values (p_restaurant_id, p_table_id, v_total, v_orders_json)
  returning id into v_billing_id;

  delete from public.orders
  where restaurant_id = p_restaurant_id and table_id = p_table_id and status = 'completed';

  return v_billing_id;
end;
$$;

grant execute on function public.reset_table_billing(uuid, uuid) to authenticated;

-- =============================================================================
-- Analytics
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
    'total_orders', (
      (select count(*) from public.orders where restaurant_id = p_restaurant_id)
      +
      (select coalesce(sum(jsonb_array_length(orders_json)), 0) from public.billing_history where restaurant_id = p_restaurant_id)
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
               sum(oi.quantity)::int as total_quantity,
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
        from generate_series(current_date - interval '6 days', current_date, interval '1 day') as gs(day)
        left join public.orders o
          on o.restaurant_id = p_restaurant_id
          and date_trunc('day', o.order_time) = gs.day
        group by gs.day
        order by gs.day
      ) d
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_restaurant_analytics(uuid) to authenticated;
