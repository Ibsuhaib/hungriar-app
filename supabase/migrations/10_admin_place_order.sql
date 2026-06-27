-- =============================================================================
-- 10_admin_place_order.sql
-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- Safe to re-run.
-- =============================================================================
-- Lets restaurant admins place orders directly from the dashboard
-- (manual/waiter ordering when the customer hasn't scanned the QR code).
-- Prices are always read from the database — the client only sends
-- menu_item_id, quantity, and optional notes.
-- =============================================================================

create or replace function public.admin_place_order(
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_items         jsonb   -- [{ "menu_item_id": "...", "quantity": N, "notes": "..." }]
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_order_id   uuid;
  v_item       jsonb;
  v_name       text;
  v_price      numeric;
  v_qty        int;
  v_notes      text;
  v_subtotal   numeric(10,2) := 0;
  v_tax_pct    numeric;
  v_total      numeric(10,2);
begin
  if not (public.is_restaurant_admin(p_restaurant_id) or public.is_super_admin()) then
    raise exception 'not authorized';
  end if;

  select coalesce(tax_percentage, 0) into v_tax_pct
  from public.restaurants where id = p_restaurant_id;

  -- Create the order (total set to 0, updated at the end)
  insert into public.orders (restaurant_id, table_id, status, total_amount)
  values (p_restaurant_id, p_table_id, 'pending', 0)
  returning id into v_order_id;

  -- Insert each item; prices are always taken from the DB
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select name, price into v_name, v_price
    from public.menu_items
    where id            = (v_item->>'menu_item_id')::uuid
      and restaurant_id = p_restaurant_id
      and available     = true;

    if v_name is null then continue; end if;  -- skip unavailable items

    v_qty   := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_notes := coalesce(nullif(trim(v_item->>'notes'), ''), '');

    insert into public.order_items
      (order_id, menu_item_id, item_name, quantity, unit_price, notes)
    values
      (v_order_id, (v_item->>'menu_item_id')::uuid, v_name, v_qty, v_price, v_notes);

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  if v_subtotal = 0 then
    -- No valid items — roll back the order
    delete from public.orders where id = v_order_id;
    raise exception 'No available items in order';
  end if;

  v_total := round(v_subtotal * (1 + v_tax_pct / 100) * 100) / 100;

  update public.orders set total_amount = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.admin_place_order(uuid, uuid, jsonb) to authenticated;
