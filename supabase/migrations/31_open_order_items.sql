-- =============================================================================
-- 31_open_order_items.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Adds "Open Order" support to Take Order: a custom line item with an
-- admin-typed name + price, for one-off customer requests that don't exist in
-- the menu catalog. It is NOT written to menu_items — it only ever exists as
-- an order_items row (menu_item_id stays NULL, same as any deleted-menu-item
-- row already behaves).
--
-- Item shape sent by the client is now one of:
--   { menu_item_id: "<uuid>", quantity, notes }              — normal catalog item
--   { custom_name: "...", custom_price: N, quantity, notes }  — open order item
-- =============================================================================

drop function if exists public.admin_place_order(uuid, uuid, jsonb, uuid);

create function public.admin_place_order(
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_items         jsonb,
  p_order_id      uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_name     text;
  v_price    numeric;
  v_qty      int;
  v_notes    text;
  v_subtotal numeric(10,2) := 0;
  v_tax_pct  numeric;
  v_total    numeric(10,2);
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  insert into public.orders (id, restaurant_id, table_id, status, total_amount)
  values (coalesce(p_order_id, gen_random_uuid()), p_restaurant_id, p_table_id, 'pending', 0)
  on conflict (id) do nothing
  returning id into v_order_id;

  if v_order_id is null then
    return p_order_id;
  end if;

  select coalesce(tax_percentage, 0) into v_tax_pct
  from public.restaurants where id = p_restaurant_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'menu_item_id') is not null then
      select name, price into v_name, v_price
      from public.menu_items
      where id = (v_item->>'menu_item_id')::uuid
        and restaurant_id = p_restaurant_id
        and available = true;
    elsif nullif(trim(v_item->>'custom_name'), '') is not null and (v_item->>'custom_price') is not null then
      -- Open order item — admin-typed name/price, never touches menu_items.
      v_name  := trim(v_item->>'custom_name');
      v_price := greatest(0, (v_item->>'custom_price')::numeric);
    else
      v_name := null;
    end if;

    if v_name is null then continue; end if;

    v_qty   := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_notes := coalesce(nullif(trim(v_item->>'notes'), ''), '');

    insert into public.order_items
      (order_id, menu_item_id, item_name, quantity, unit_price, notes)
    values
      (v_order_id, nullif(v_item->>'menu_item_id', '')::uuid, v_name, v_qty, v_price, v_notes);

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  if v_subtotal = 0 then
    delete from public.orders where id = v_order_id;
    raise exception 'No available items in order';
  end if;

  v_total := round(v_subtotal * (1 + v_tax_pct / 100) * 100) / 100;
  update public.orders set total_amount = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.admin_place_order(uuid, uuid, jsonb, uuid) to authenticated;
