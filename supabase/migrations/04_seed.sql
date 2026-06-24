-- =============================================================================
-- Goana AR - 04_seed.sql
-- Optional demo data + super admin bootstrap helper.
--
-- IMPORTANT: Supabase auth users cannot be created from a plain SQL migration.
-- 1. Sign up the super admin account through Supabase Auth first
--    (e.g. open the app's /superadmin/login page and use "Forgot password"
--    after creating the user in Authentication > Users in the dashboard,
--    or use `supabase.auth.admin.createUser` from the SQL editor's
--    "Run as service role" is NOT available - use the Dashboard).
-- 2. Then run the DO block below (edit the email first) to grant the
--    'super_admin' role to that user.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Step 1: Grant super_admin role to an existing auth user (by email)
-- -----------------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
  v_email text := 'superadmin@example.com'; -- <-- change this to your super admin's email
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    raise notice 'No auth user found for %. Create the user in Supabase Authentication first, then re-run this block.', v_email;
  else
    insert into public.user_roles (user_id, role)
    values (v_user_id, 'super_admin')
    on conflict (user_id) do update set role = 'super_admin';
    raise notice 'super_admin role granted to % (%)', v_email, v_user_id;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Step 2: Demo restaurant + menu (safe to run multiple times)
-- -----------------------------------------------------------------------------
insert into public.restaurants (id, name, slug, currency, tax_percentage, subscription_status, trial_ends_at, contact_email)
values (
  '11111111-1111-1111-1111-111111111111',
  'Goana Spice House',
  'goana-spice-house',
  '₹',
  5,
  'trial',
  now() + interval '14 days',
  'contact@goanaspicehouse.example'
)
on conflict (id) do nothing;

-- Categories
insert into public.categories (id, restaurant_id, name, display_order) values
  ('11111111-1111-1111-1111-100000000001', '11111111-1111-1111-1111-111111111111', 'Starters', 1),
  ('11111111-1111-1111-1111-100000000002', '11111111-1111-1111-1111-111111111111', 'Main Course', 2),
  ('11111111-1111-1111-1111-100000000003', '11111111-1111-1111-1111-111111111111', 'Desserts', 3),
  ('11111111-1111-1111-1111-100000000004', '11111111-1111-1111-1111-111111111111', 'Beverages', 4)
on conflict (id) do nothing;

-- Menu items
insert into public.menu_items (id, restaurant_id, category_id, name, description, price, available, display_order) values
  ('11111111-1111-1111-1111-200000000001', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-100000000001', 'Chicken Cafreal', 'Pan-fried chicken marinated in a spicy green Goan masala.', 280, true, 1),
  ('11111111-1111-1111-1111-200000000002', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-100000000001', 'Prawn Rissois', 'Crispy pastry parcels stuffed with creamy prawn filling.', 320, true, 2),
  ('11111111-1111-1111-1111-200000000003', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-100000000002', 'Goan Fish Curry', 'Tangy coconut-based curry with kingfish, served with rice.', 380, true, 1),
  ('11111111-1111-1111-1111-200000000004', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-100000000002', 'Pork Vindaloo', 'Slow-cooked pork in a fiery vinegar-spice gravy.', 420, true, 2),
  ('11111111-1111-1111-1111-200000000005', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-100000000003', 'Bebinca', 'Traditional 7-layer Goan dessert with coconut and jaggery.', 180, true, 1),
  ('11111111-1111-1111-1111-200000000006', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-100000000004', 'Sol Kadhi', 'Refreshing kokum and coconut milk cooler.', 90, true, 1)
on conflict (id) do nothing;

-- Tables
insert into public.tables (id, restaurant_id, table_number) values
  ('11111111-1111-1111-1111-300000000001', '11111111-1111-1111-1111-111111111111', '1'),
  ('11111111-1111-1111-1111-300000000002', '11111111-1111-1111-1111-111111111111', '2'),
  ('11111111-1111-1111-1111-300000000003', '11111111-1111-1111-1111-111111111111', '3'),
  ('11111111-1111-1111-1111-300000000004', '11111111-1111-1111-1111-111111111111', '4')
on conflict (restaurant_id, table_number) do nothing;

-- -----------------------------------------------------------------------------
-- Step 3: Link a restaurant admin to the demo restaurant (optional)
-- Sign up a normal user through /admin/login (the app auto-creates the
-- restaurant_admins link is NOT automatic - a super admin must run this,
-- or you can do it manually here after creating the auth user).
-- -----------------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
  v_email text := 'admin@goanaspicehouse.example'; -- <-- change to your demo admin's email
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    raise notice 'No auth user found for %. Create the user via Supabase Authentication, then re-run this block.', v_email;
  else
    insert into public.restaurant_admins (user_id, restaurant_id)
    values (v_user_id, '11111111-1111-1111-1111-111111111111')
    on conflict (user_id, restaurant_id) do nothing;
    raise notice 'restaurant_admins link created for % (%)', v_email, v_user_id;
  end if;
end $$;
