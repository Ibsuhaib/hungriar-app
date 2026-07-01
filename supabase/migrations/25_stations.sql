-- =============================================================================
-- 25_stations.sql
-- Station accounts: chef and staff roles with PIN-based kiosk login.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS).
-- =============================================================================

-- 1. Extend user_roles to allow 'chef' and 'staff' ─────────────────────────
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'super_admin', 'chef', 'staff'));

-- 2. restaurant_stations table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.restaurant_stations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  auth_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('chef', 'staff')),
  label         text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_stations_restaurant
  ON public.restaurant_stations (restaurant_id);

ALTER TABLE public.restaurant_stations ENABLE ROW LEVEL SECURITY;

-- Restaurant admin can list their stations; station users can read their own row
DROP POLICY IF EXISTS restaurant_stations_select ON public.restaurant_stations;
CREATE POLICY restaurant_stations_select ON public.restaurant_stations
  FOR SELECT TO authenticated
  USING (
    public.is_restaurant_admin(restaurant_id)
    OR auth_user_id = auth.uid()
    OR public.is_super_admin()
  );

-- Only service role (edge functions) may insert
DROP POLICY IF EXISTS restaurant_stations_insert ON public.restaurant_stations;
CREATE POLICY restaurant_stations_insert ON public.restaurant_stations
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- Admin may delete their own stations
DROP POLICY IF EXISTS restaurant_stations_delete ON public.restaurant_stations;
CREATE POLICY restaurant_stations_delete ON public.restaurant_stations
  FOR DELETE TO authenticated
  USING (public.is_restaurant_admin(restaurant_id) OR public.is_super_admin());

-- 3. Helper: is the current user a station account for p_restaurant_id? ────
CREATE OR REPLACE FUNCTION public.is_restaurant_station(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_stations
    WHERE auth_user_id = auth.uid()
      AND restaurant_id = p_restaurant_id
  )
$$;

-- 4. Extend RLS on existing tables to allow station users ──────────────────

-- tables: chef and staff need to read tables
DROP POLICY IF EXISTS tables_select ON public.tables;
CREATE POLICY tables_select ON public.tables
  FOR SELECT TO authenticated
  USING (
    public.is_restaurant_admin(restaurant_id)
    OR public.is_restaurant_station(restaurant_id)
    OR public.is_super_admin()
  );

-- orders: station users can read and update (cancel / mark status)
DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders
  FOR SELECT TO anon, authenticated
  USING (
    public.restaurant_is_visible(restaurant_id)
    OR public.is_restaurant_admin(restaurant_id)
    OR public.is_restaurant_station(restaurant_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.is_restaurant_admin(restaurant_id)
    OR public.is_restaurant_station(restaurant_id)
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.is_restaurant_admin(restaurant_id)
    OR public.is_restaurant_station(restaurant_id)
    OR public.is_super_admin()
  );

-- order_items: station users can update items they need (chef: status; staff: see items)
DROP POLICY IF EXISTS order_items_update ON public.order_items;
CREATE POLICY order_items_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          public.is_restaurant_admin(o.restaurant_id)
          OR public.is_restaurant_station(o.restaurant_id)
          OR public.is_super_admin()
        )
    )
  );

-- 5. staff_place_order RPC ─────────────────────────────────────────────────
-- Lets staff station accounts create orders. Validates that the caller is a
-- station user for the given restaurant and that all items belong to it.
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
  v_menu_item  record;
  v_total      numeric := 0;
  v_tax        numeric;
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

  SELECT tax_percentage INTO v_tax
  FROM public.restaurants WHERE id = p_restaurant_id;

  INSERT INTO public.orders (restaurant_id, table_id, status, notes)
  VALUES (p_restaurant_id, p_table_id, 'pending', COALESCE(p_notes, ''))
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_menu_item
    FROM public.menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND restaurant_id = p_restaurant_id
      AND available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item % not found or unavailable', v_item->>'menu_item_id';
    END IF;

    INSERT INTO public.order_items (
      order_id, menu_item_id, menu_item_name, unit_price,
      quantity, notes, status
    ) VALUES (
      v_order_id,
      v_menu_item.id,
      v_menu_item.name,
      v_menu_item.price,
      (v_item->>'quantity')::int,
      COALESCE(v_item->>'notes', ''),
      'pending'
    );

    v_total := v_total + v_menu_item.price * (v_item->>'quantity')::int;
  END LOOP;

  UPDATE public.orders
  SET total_amount = v_total * (1 + v_tax / 100)
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- 6. staff_cancel_order RPC ────────────────────────────────────────────────
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

  UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
  UPDATE public.order_items SET status = 'cancelled' WHERE order_id = p_order_id;
END;
$$;
