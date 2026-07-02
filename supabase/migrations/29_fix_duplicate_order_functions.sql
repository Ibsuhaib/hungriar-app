-- =============================================================================
-- 29_fix_duplicate_order_functions.sql
-- Resolves: "Could not choose the best candidate function between
--   public.staff_place_order(... p_notes),
--   public.staff_place_order(... p_notes, p_order_id)"
--
-- Migration 28 added a p_order_id overload and dropped the old signatures. But
-- if migrations 10 / 25 / 27 were re-run AFTER 28 (CREATE OR REPLACE), the old
-- pre-p_order_id signatures came back and now coexist with the new ones, so
-- PostgREST sees two candidates and refuses to pick.
--
-- Drop the OLD signatures. The idempotent versions from migration 28
--   staff_place_order(uuid, uuid, jsonb, text, uuid)
--   admin_place_order(uuid, uuid, jsonb, uuid)
-- remain and handle every call (p_notes / p_order_id default when omitted).
--
-- ⚠️ Run migration 28 BEFORE this one, and do NOT re-run 10 / 25 / 27 afterward
-- (that would recreate the old overloads). Safe to re-run.
-- =============================================================================

-- Old Staff Panel order fn (migration 25 / 27) — no p_order_id
DROP FUNCTION IF EXISTS public.staff_place_order(uuid, uuid, jsonb, text);

-- Old admin/Take-Order fn (migration 10) — no p_order_id
DROP FUNCTION IF EXISTS public.admin_place_order(uuid, uuid, jsonb);

-- Sanity check: exactly one of each should remain. (Informational — will list
-- the surviving signatures in the query results.)
-- select proname, pg_get_function_identity_arguments(oid)
-- from pg_proc
-- where proname in ('staff_place_order','admin_place_order')
-- order by proname;
