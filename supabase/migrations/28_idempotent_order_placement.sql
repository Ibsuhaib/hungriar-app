-- =============================================================================
-- 28_idempotent_order_placement.sql
-- Makes offline order replay safe against duplicates.
--
-- Both admin_place_order (migration 10) and staff_place_order (migration 27)
-- generated a fresh order id on every call. That made offline sync unsafe:
--   • TakeOrder.syncQueue AND Billing.syncBills both replay the same queued
--     orders → the same order could be inserted twice.
--   • If the RPC commits but the HTTP response is lost, the client retries and
--     inserts a duplicate.
--
-- Fix: accept an optional client-generated p_order_id and INSERT ... ON CONFLICT
-- (id) DO NOTHING. A replay of an already-placed order becomes a no-op that just
-- returns the existing id. When p_order_id is null (normal online path) a random
-- id is generated exactly as before, so behaviour is unchanged.
--
-- We DROP the old signatures first so PostgREST has a single, unambiguous
-- candidate (calls that omit p_order_id still resolve via its DEFAULT).
--
-- Safe to re-run.
-- =============================================================================

-- ── admin_place_order ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_place_order(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.admin_place_order(
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_items         jsonb,   -- [{ "menu_item_id": "...", "quantity": N, "notes": "..." }]
  p_order_id      uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
  v_name     text;
  v_price    numeric;
  v_qty      int;
  v_notes    text;
  v_subtotal numeric(10,2) := 0;
  v_tax_pct  numeric;
  v_total    numeric(10,2);
BEGIN
  IF NOT (public.is_restaurant_admin(p_restaurant_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Idempotent create. If this id already exists (a retried replay), the insert
  -- affects no row and v_order_id stays NULL → we return without re-adding items.
  INSERT INTO public.orders (id, restaurant_id, table_id, status, total_amount)
  VALUES (coalesce(p_order_id, gen_random_uuid()), p_restaurant_id, p_table_id, 'pending', 0)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_order_id;

  IF v_order_id IS NULL THEN
    RETURN p_order_id;  -- already placed earlier → no-op
  END IF;

  SELECT coalesce(tax_percentage, 0) INTO v_tax_pct
  FROM public.restaurants WHERE id = p_restaurant_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT name, price INTO v_name, v_price
    FROM public.menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND restaurant_id = p_restaurant_id
      AND available = true;

    IF v_name IS NULL THEN CONTINUE; END IF;

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

GRANT EXECUTE ON FUNCTION public.admin_place_order(uuid, uuid, jsonb, uuid) TO authenticated;

-- ── staff_place_order ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.staff_place_order(uuid, uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.staff_place_order(
  p_restaurant_id uuid,
  p_table_id      uuid,
  p_items         jsonb,   -- [{menu_item_id uuid, quantity int, notes text}]
  p_notes         text DEFAULT '',
  p_order_id      uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_item     jsonb;
  v_name     text;
  v_price    numeric;
  v_qty      int;
  v_notes    text;
  v_subtotal numeric(10,2) := 0;
  v_tax_pct  numeric;
  v_total    numeric(10,2);
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

  INSERT INTO public.orders (id, restaurant_id, table_id, status, total_amount)
  VALUES (coalesce(p_order_id, gen_random_uuid()), p_restaurant_id, p_table_id, 'pending', 0)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_order_id;

  IF v_order_id IS NULL THEN
    RETURN p_order_id;  -- already placed earlier → no-op
  END IF;

  SELECT coalesce(tax_percentage, 0) INTO v_tax_pct
  FROM public.restaurants WHERE id = p_restaurant_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT name, price INTO v_name, v_price
    FROM public.menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND restaurant_id = p_restaurant_id
      AND available = true;

    IF v_name IS NULL THEN CONTINUE; END IF;

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

GRANT EXECUTE ON FUNCTION public.staff_place_order(uuid, uuid, jsonb, text, uuid) TO authenticated;
