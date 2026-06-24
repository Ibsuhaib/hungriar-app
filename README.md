# Goana AR

A multi-restaurant digital menu, AR/3D dish preview, and table-ordering platform.
Diners scan a table QR code to browse a menu (with optional AR previews), add
items to a cart, and place orders that appear in real time on the restaurant's
kitchen dashboard. Restaurant admins manage their menu, tables, orders, billing
and analytics. A separate super admin area lets the Goana AR team onboard new
restaurants and manage subscriptions.

## Tech Stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3 + React Router 6
- **Backend**: Supabase (Postgres + Row Level Security, Auth, Storage, Realtime, Edge Functions)
- **AR / 3D**: [`@google/model-viewer`](https://modelviewer.dev/) (lazy-loaded), `.glb` for Android/Web AR, `.usdz` for iOS AR Quick Look
- **Optional media storage**: Cloudflare R2 (via presigned uploads), instead of Supabase Storage

---

## 1. Prerequisites

- Node.js 18+ and npm
- A [Supabase](https://supabase.com) project (free tier is fine to start)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` or via your package manager) - used to deploy edge functions and set secrets

---

## 2. Supabase Project Setup

### 2.1 Run the database migrations

Run the SQL files in `supabase/migrations/` **in order**, either:

- **Dashboard**: open *SQL Editor* in your Supabase project and paste/run each file's contents in order (`01_schema.sql`, `02_rls.sql`, `03_storage.sql`, `04_seed.sql`), **or**
- **CLI**: from the project root, link your project and push migrations:

  ```bash
  supabase link --project-ref <your-project-ref>
  supabase db push
  ```

What each file does:

| File | Purpose |
| --- | --- |
| `01_schema.sql` | Creates all 12 tables, helper functions (`is_super_admin`, `is_restaurant_admin`, etc.), rate limiting, admin session/replay protection, billing settlement (`reset_table_billing`) and analytics (`get_restaurant_analytics`) RPCs |
| `02_rls.sql` | Enables Row Level Security and policies for every table |
| `03_storage.sql` | Creates the public `restaurant-assets` storage bucket and its access policies |
| `04_seed.sql` | Optional: bootstraps your **super admin** role and a demo restaurant with sample menu/tables (see step 3 below) |

### 2.2 Deploy the Edge Functions

Six edge functions live in `supabase/functions/`:

| Function | Purpose | Auth |
| --- | --- | --- |
| `generate-table-token` | Restaurant admin generates a signed table QR token | Restaurant admin / super admin |
| `validate-table-token` | Diner's browser verifies a scanned QR token | Public (IP rate-limited) |
| `place-order` | Diner places an order; re-validates the token and re-prices items server-side | Public (IP rate-limited) |
| `admin-management` | Super admin: list/create/delete restaurant admin accounts, reset passwords | Super admin only |
| `cleanup-rate-limits` | Deletes stale `rate_limits` / `admin_sessions` rows | Service role / cron |
| `r2-presign` | Issues a presigned Cloudflare R2 upload URL (only used if R2 is enabled) | Restaurant admin / super admin |

Deploy them all:

```bash
supabase functions deploy
```

(or deploy one at a time with `supabase functions deploy <name>`)

### 2.3 Set Edge Function secrets

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to
every edge function by Supabase - **do not set these yourself**.

You must set the following secrets manually:

```bash
# Required - used to sign/verify table QR tokens (30-day expiry).
# Generate a long random value, e.g.: openssl rand -hex 32
supabase secrets set TABLE_TOKEN_SECRET=<a-long-random-string>

# Optional - protects the cleanup-rate-limits function from being called
# by anyone other than your scheduler.
supabase secrets set CRON_SECRET=<another-random-string>
```

If you plan to use Cloudflare R2 for AR model / image storage (see section 6), also set:

```bash
supabase secrets set R2_ACCOUNT_ID=<account-id>
supabase secrets set R2_ACCESS_KEY_ID=<access-key-id>
supabase secrets set R2_SECRET_ACCESS_KEY=<secret-access-key>
supabase secrets set R2_BUCKET_NAME=<bucket-name>
supabase secrets set R2_PUBLIC_URL=<public-bucket-url>
```

---

## 3. Environment Variables

Copy `.env.example` to `.env` and fill in the two **required** values from
*Supabase Dashboard → Project Settings → API*:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key

# Leave false unless you've configured Cloudflare R2 (section 6)
VITE_USE_CLOUDFLARE_R2=false
VITE_R2_PUBLIC_URL=
```

> **Never** put secret keys (service role key, R2 access keys, `TABLE_TOKEN_SECRET`,
> `CRON_SECRET`) into `.env` or any `VITE_`-prefixed variable - anything prefixed
> `VITE_` is bundled into the client JavaScript and is publicly readable. Secrets
> belong only in Supabase Edge Function secrets (section 2.3).

---

## 4. Creating the Super Admin Account

Restaurant admin accounts are created from the Super Admin UI once you have at
least one super admin. The very first super admin must be created manually:

1. In the Supabase Dashboard, go to **Authentication → Users → Add User**.
   Enter an email and password for yourself and tick **"Auto confirm user"**.
2. Open **SQL Editor** and run (replacing the email):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'super_admin' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = 'super_admin';
   ```

   (This is the same step performed by the `DO` block at the top of
   `supabase/migrations/04_seed.sql` - edit the email in that file and run it
   if you prefer.)

3. Sign in at `/superadmin/login` with that email/password.

From the Super Admin → **Restaurants** page you can now add new restaurants.
Adding a restaurant also creates its admin login (email + password you choose)
via the `admin-management` edge function - share those credentials with the
restaurant owner.

---

## 5. Running Locally

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`. Key entry points:

- `/` - public landing page
- `/admin/login` - restaurant admin sign in
- `/superadmin/login` - super admin sign in
- `/r/<restaurant-slug>?token=...` - customer menu (the `token` query param comes from a table's QR code, generated from Admin → **Tables & QR**)

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build locally
```

---

## 6. Day-to-Day Operations

### Onboarding a new restaurant (Super Admin)

1. Sign in at `/superadmin/login`.
2. Go to **Restaurants → + Add Restaurant**. Fill in the restaurant's name,
   slug (used in QR URLs, e.g. `/r/my-restaurant`), contact email, currency
   and tax rate, plus an email/password for the restaurant's admin login.
3. The new restaurant starts on a 14-day **trial** (`subscription_status =
   'trial'`, see `01_schema.sql`).
4. Give the restaurant owner their admin login. On first login they'll be
   shown the agreement screen (`/admin/agreement`) before reaching the
   dashboard.

### Uploading AR / 3D models and menu photos

Restaurant admins (or the developer, signed in as that restaurant's admin)
upload images and `.glb` / `.usdz` AR models per menu item from **Admin → Menu
Items → Add/Edit Item**. Files are stored under
`restaurant-assets/{restaurant_id}/images/...` and
`restaurant-assets/{restaurant_id}/models/...` (Supabase Storage by default,
or Cloudflare R2 if enabled - see section 8).

### Generating table QR codes

**Admin → Tables & QR → Add Table**, then for each table use **Download PNG**
to print a QR code, or **Copy Link** to share the URL directly. Each QR
encodes a signed token (30-day expiry) tying that table to the restaurant -
diners who scan it land on `/r/<slug>?token=...`, which is validated and
cached in their browser.

### Managing subscriptions & payments (Super Admin)

Goana AR collects subscription fees outside the app (UPI / cash / bank
transfer). After receiving a payment:

1. Go to **Super Admin → Payment Log → Record Payment** and log the amount,
   date, method and an optional receipt number for your own records.
2. Go to **Super Admin → Subscriptions**, find the restaurant, and click
   **Extend 30 Days** (sets `subscription_status = 'active'` and pushes
   `paid_until_at` forward by 30 days from whichever is later: today or the
   current `paid_until_at`). You can also set the status to `expired` or
   `inactive` manually, or edit `paid_until_at` directly.

Restaurant admins always see their current status and paid-until date via the
`SubscriptionBanner` shown on their dashboard and Settings page. Setting a
restaurant to `inactive` hides its public menu/ordering pages immediately
(`restaurant_is_visible()` in `01_schema.sql`).

### Settling bills / order history

**Admin → Billing** groups completed orders by table. **Settle Bill** archives
those orders into **Admin → History** (`billing_history`) via the
`reset_table_billing` RPC and clears the table for new orders.

---

## 7. Security Testing Guide

The app implements several layered protections. Here's how to verify each one
in a local or staging environment.

### 7.1 Customer & admin rate limiting (60 / 120 req per minute)

Both limits are enforced **server-side** by the `check_rate_limit(identifier,
type, limit)` Postgres function (security definer, callable by `anon` and
`authenticated`), backed by the `rate_limits` table.

- **Customer (60/min)**: every customer-facing edge function call
  (`validate-table-token`, `place-order`) and every `RestaurantContext`/`Cart`
  action calls `checkCustomerLimit()`, keyed by a random id stored in
  `localStorage` under `goana_customer_id`. To test: open a restaurant menu
  and rapidly trigger 61+ actions (e.g. repeatedly add items to cart and open
  the cart drawer, or re-run `useRestaurant().refetchMenu()` from the console)
  within 60 seconds - the 61st should show the toast *"You're going a bit
  fast! Please wait Ns and try again."*
- **Admin (120/min)**: every admin mutation calls `checkAdminLimit(user.id)`
  first. To test, rapidly perform 121+ admin actions (e.g. toggling an item's
  availability) within 60 seconds from **Admin → Menu Items** - the 121st
  shows *"Too many requests. Please wait Ns and try again."*
- You can also call the RPC directly from the browser console to see the raw
  response:

  ```js
  await supabase.rpc('check_rate_limit', { p_identifier: 'test-id', p_type: 'customer', p_limit: 60 })
  // => { allowed: true, retry_after: 0 } ... then false with retry_after > 0 after 60 calls
  ```

### 7.2 Table QR token tampering

Table tokens are HMAC-SHA256 signed (`supabase/functions/_shared/tableToken.ts`)
with payload `restaurantId:tableId:issuedAt`, base64url-encoded as
`<payload>:<signature>`, valid for 30 days.

1. From **Admin → Tables & QR**, click **Copy Link** for any table - it looks
   like `https://.../r/<slug>?token=<long-string>`.
2. Decode the token (base64url) - you'll see something like
   `11111111-...-1:22222222-...-2:1750000000:9f3a...`.
3. Try tampering with it:
   - **Change the table id or restaurant id** and re-encode → visiting the URL
     returns *"Invalid QR code. Please ask staff for a new one."* (signature
     mismatch, rejected by `validate-table-token`).
   - **Change the `issuedAt` timestamp to a value older than 30 days** and
     re-encode → returns *"This QR code has expired. Please ask staff for a
     new one."*
   - **Submit an old/tampered token directly to `place-order`** (via
     `supabase.functions.invoke('place-order', { body: { token, items } })`)
     → returns `401 Invalid or expired table session. Please rescan the QR
     code.` - orders cannot be placed with a tampered token even if the
     `/r/<slug>` page was somehow reached.
4. Use **Regenerate** on a table to invalidate old QR codes for that table
   (issues a new token with a fresh `issuedAt`; old printed QR codes still
   verify until they hit the 30-day expiry, since both old and new tokens are
   independently valid signatures - reprint the QR if you need to revoke
   immediate access).

### 7.3 Password length limits

- `MAX_PASSWORD_LENGTH = 128` (see `src/contexts/AuthContext.jsx`) is enforced
  on every password `<input maxLength={128}>` and rejected client-side in
  `signIn()` if exceeded.
- The `admin-management` edge function additionally enforces `8-128`
  characters server-side for `reset_password` and `create_restaurant_admin` -
  try calling it with a 129-character or 7-character password to confirm you
  get `400 Password must be between 8 and 128 characters`.

### 7.4 Admin session replay protection (device fingerprint)

On sign-in, `upsert_admin_session` stores a SHA-256 device fingerprint
(`src/utils/fingerprint.js`) with a 15-minute expiry in `admin_sessions`,
replacing any previous session for that user. Every 5 minutes,
`validate_admin_session` checks the current browser's fingerprint still
matches.

To test: sign in to the same admin account in two different browsers (or one
normal + one incognito window). Within ~5 minutes, the **first** browser will
show *"Your session has expired. Please sign in again."* and be signed out,
because the second login replaced its `admin_sessions` row.

---

## 8. Cloudflare R2 (Optional)

By default all images and AR models go to the public Supabase Storage bucket
`restaurant-assets` (created by `03_storage.sql`) - this works out of the box
with no extra configuration.

To use Cloudflare R2 instead:

1. Create an R2 bucket and an API token with read/write access, and enable
   public access (or a custom domain) for the bucket so uploaded files are
   reachable at `R2_PUBLIC_URL/<key>`.
2. Set the R2 secrets on the `r2-presign` edge function (section 2.3):
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
3. In your **client** `.env`, set:

   ```env
   VITE_USE_CLOUDFLARE_R2=true
   VITE_R2_PUBLIC_URL=https://your-r2-public-domain
   ```

When enabled, `src/lib/storage.js` requests a short-lived presigned PUT URL
from `r2-presign` and uploads the file directly to R2 from the browser - R2
credentials never reach the client. Note: deleting an asset (e.g. replacing a
menu item's photo) is a no-op for R2 uploads by design (no client-side delete
credentials) - periodically clean up orphaned files from the R2 dashboard if
needed.

---

## 9. Scheduled Cleanup

`cleanup-rate-limits` deletes `rate_limits` rows older than their reset time
and `admin_sessions` rows expired more than a day ago. Schedule it to run
daily, e.g. with [Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions)
or any external scheduler that can send an HTTPS request:

```sql
select cron.schedule(
  'cleanup-rate-limits-daily',
  '0 3 * * *', -- 3am daily
  $$
  select net.http_post(
    url := 'https://<your-project-ref>.functions.supabase.co/cleanup-rate-limits',
    headers := jsonb_build_object('x-cron-secret', '<your-CRON_SECRET-value>')
  );
  $$
);
```

(Requires the `pg_cron` and `pg_net` extensions, enabled from
*Database → Extensions* in the Supabase Dashboard.)

---

## 10. Deployment

`vercel.json` is preconfigured for a single-page app deploy on Vercel: SPA
rewrites (`/* → /index.html`) plus baseline security headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) and long-term
caching for `/assets/*`.

1. Push this repo to GitHub/GitLab and import it in Vercel (or run `vercel`
   from the CLI).
2. Set the build command to `npm run build` and output directory to `dist`
   (Vercel auto-detects this for Vite projects).
3. Add the two required environment variables (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`) - and `VITE_USE_CLOUDFLARE_R2` /
   `VITE_R2_PUBLIC_URL` if using R2 - in the Vercel project settings.
4. Deploy. The Supabase edge functions are deployed separately (section 2.2)
   and are independent of where the frontend is hosted.
