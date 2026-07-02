-- =============================================================================
-- 27_fix_station_order_schema.sql
-- Fixes a schema mismatch that broke the entire Staff Panel order flow.
--
-- Migration 25's staff_place_order / staff_cancel_order referenced columns that
-- do not exist on the real tables:
--   • orders.notes            → column was never added to public.orders
--   • order_items.menu_item_name → the real column is order_items.item_name
--   • order_items.status         → the real per-item flag is order_items.cancelled
--
-- As written they raised "column does not exist" at runtime, so staff could
-- never place or cancel an order. This migration re-creates both functions
-- against the actual schema (matching admin_place_order in migration 10) and
-- applies the same tax rounding.
--
-- Safe to re-run (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.staff_place_order(
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_items         jsonb,   -- [{menu_item_id uuid, quantity int, notes text}]
  p_notes         text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id   uuid;
  v_item       jsonb;
  v_name       text;
  v_price      numeric;
  v_qty        int;
  v_notes      text;
  v_subtotal   numeric(10,2) := 0;
  v_tax_pct    numeric;
  v_total      numeric(10,2);
BEGIN
  IF NOT public.is_restaurant_station(p_restaurant_id) THEN
    RAISE EXCEPTION 'Unauthorized: caller is not a station for this restaurant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tables
    WHERE id = p_table_id AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  SELECT coalesce(tax_percentage, 0) INTO v_tax_pct
  FROM public.restaurants WHERE id = p_restaurant_id;

  INSERT INTO public.orders (restaurant_id, table_id, status, total_amount)
  VALUES (p_restaurant_id, p_table_id, 'pending', 0)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT name, price INTO v_name, v_price
    FROM public.menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND restaurant_id = p_restaurant_id
      AND available = true;

    IF v_name IS NULL THEN CONTINUE; END IF;  -- skip unavailable items

    v_qty   := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_notes := coalesce(nullif(trim(v_item->>'notes'), ''), '');

    INSERT INTO public.order_items
      (order_id, menu_item_id, item_name, quantity, unit_price, notes)
    VALUES
      (v_order_id, (v_item->>'menu_item_id')::uuid, v_name, v_qty, v_price, v_notes);

    v_subtotal := v_subtotal + v_price * v_qty;
  END LOOP;

  IF v_subtotal = 0 THEN
    DELETE FROM public.orders WHERE id = v_order_id;
    RAISE EXCEPTION 'No available items in order';
  END IF;

  v_total := round(v_subtotal * (1 + v_tax_pct / 100) * 100) / 100;

  UPDATE public.orders SET total_amount = v_total WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_cancel_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id
  FROM public.orders WHERE id = p_order_id;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT (public.is_restaurant_admin(v_restaurant_id) OR public.is_restaurant_station(v_restaurant_id)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Real schema: order_items uses a `cancelled` boolean, not a `status` column.
  UPDATE public.order_items SET cancelled = true WHERE order_id = p_order_id;
  UPDATE public.orders SET status = 'cancelled', total_amount = 0 WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_place_order(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_cancel_order(uuid) TO authenticated;
