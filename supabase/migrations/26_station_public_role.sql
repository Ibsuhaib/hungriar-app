-- =============================================================================
-- 26_station_public_role.sql
-- Allow the station login page (unauthenticated) to read a station's role
-- by its ID so the correct icon can be displayed before PIN entry.
-- Only returns role + label — no user IDs or restaurant IDs exposed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_station_role(p_station_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object('role', role, 'label', label)
  FROM public.restaurant_stations
  WHERE id = p_station_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_station_role(uuid) TO anon, authenticated;
