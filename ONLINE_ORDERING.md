# hungriOrder Online Ordering — Integration Guide

goana-ar-app now includes the hungriOrder online-ordering platform: a public
delivery/takeaway storefront per restaurant, walk-in delivery orders in Take
Order, and online-order handling across Orders / Billing / History — all on
the **same** Supabase project, menu and orders tables as the POS.

Nothing about the existing dine-in flow changed. Every schema change is
additive; existing orders keep `order_type = 'dine-in'` and behave exactly as
before.

## What's where

| Piece | Location |
|---|---|
| Customer storefront (delivery/takeaway ordering, tracking) | [`Ibsuhaib/hungriorder`](https://github.com/Ibsuhaib/hungriorder) → `packages/customer-app` |
| Standalone admin (online-only restaurants, `has_hungriar = false`) | [`Ibsuhaib/hungriorder`](https://github.com/Ibsuhaib/hungriorder) → `packages/admin-app` |
| DB migration | `supabase/migrations/32_online_ordering.sql` (this repo) |
| Storage buckets for storefront images | `supabase/migrations/33_online_storage.sql` (this repo) |
| Order placement edge function (public) | `supabase/functions/place-online-order` (this repo) |
| Status transitions edge function (admins) | `supabase/functions/update-order-status` (this repo) |

hungriOrder is a separate product with its own repo and Vercel hosting (the consumer side,
like Zomato); this repo is the POS plus the **shared backend** — one Supabase project serves both.

The existing `place-order` function (QR table orders) is untouched — the
online flow deliberately lives under a different name.

## Deploy checklist

1. **Migrations** — run in the Supabase SQL Editor, in order:
   `32_online_ordering.sql`, then `33_online_storage.sql`. Both are safe to
   re-run.
2. **Edge functions**:
   ```bash
   supabase functions deploy place-online-order
   supabase functions deploy update-order-status
   ```
   They reuse the secrets already configured (`ALLOWED_ORIGINS` should gain the
   storefront/admin domains, e.g. `https://hungriorder.com`).
3. **Frontend apps** — live in the separate
   [`Ibsuhaib/hungriorder`](https://github.com/Ibsuhaib/hungriorder) repo.
   Create two Vercel projects from that repo (Root Directory
   `packages/customer-app` and `packages/admin-app`) with
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` pointing at this project.
   See that repo's README for details.
4. **Main app env (optional)** — `VITE_HUNGRIORDER_URL` sets the storefront
   base URL used by the sidebar "Online Store" link and the Settings tab
   (defaults to `https://hungriorder.com`).

## How a restaurant goes online

1. Super Admin → restaurant row → *Online Ordering*: set the subscription tier
   + expiry and (optionally) toggles. `has_hungriar` stays on for POS
   restaurants.
2. Restaurant admin → Settings → *Online Ordering*: enable it, add cover
   image/description/tags, delivery radius, min order, fee, opening hours.
3. The storefront is live at `hungriorder.com/r/{slug}` (the existing
   restaurant slug — still managed by the platform team only).
4. Online orders arrive on the Orders page (Delivery/Takeaway tabs) with a
   status chain *Accept → Preparing → Ready → Out for Delivery → Delivered*,
   then settle from Billing (delivery fee shown as a fixed line). Settled
   bills land in History / Day End / Analytics like any other bill.

## Design decisions that differ from a naive merge

- **Server-side pricing**: `place-online-order` recomputes every price from
  `menu_items` and enforces `is_active`, `delivery_enabled`,
  `subscription_expiry` and min-order — clients never send prices.
- **PII protection**: the public `orders` SELECT policy now only exposes
  dine-in orders (unchanged for the QR flow). Online orders — which carry a
  phone number and address — are readable only by their customer, the
  restaurant's admins, or via the `get_order_tracking()` RPC keyed by the
  unguessable order UUID.
- **Admin identity**: the standalone admin authenticates via the existing
  `restaurant_admins` table (no parallel `profiles` table), so all existing
  RLS applies as-is.
- **Slug stays super-admin-only**: the existing `protect_subscription_fields`
  trigger already guards it (printed QR codes depend on it); the trigger now
  also guards the new online-subscription fields.
