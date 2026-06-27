import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import {
  StaleWhileRevalidate,
  CacheFirst,
  NetworkOnly,
} from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// ─── Precache all static assets (JS, CSS, HTML) ───────────────────────────────
// __WB_MANIFEST is injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ─── Navigation fallback — SPA routing ────────────────────────────────────────
// Serve index.html for all navigation requests so React Router works offline
registerRoute(
  new NavigationRoute(
    async ({ request }) => {
      try {
        return await fetch(request)
      } catch {
        return caches.match('/index.html')
      }
    },
  ),
)

// ─── Menu data — Stale While Revalidate ───────────────────────────────────────
// Serve from cache immediately, update in background.
// Customers can browse the menu even with weak/no signal.
registerRoute(
  ({ url }) =>
    url.hostname.includes('supabase.co') &&
    url.pathname.includes('/rest/v1/') &&
    (
      url.pathname.includes('menu_items') ||
      url.pathname.includes('categories') ||
      url.pathname.includes('restaurants') ||
      url.pathname.includes('tables')
    ),
  new StaleWhileRevalidate({
    cacheName: 'supabase-menu-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }), // 24h
    ],
  }),
)

// ─── CDN / R2 images — Cache First ───────────────────────────────────────────
// Menu item photos and AR models from Cloudflare R2 — long-lived, never change
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 }), // 30 days
    ],
  }),
)

// ─── Google Fonts — Cache First ───────────────────────────────────────────────
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }), // 1 year
    ],
  }),
)

// ─── Orders, billing, auth, edge functions — Network Only ────────────────────
// These MUST go to the server — never serve stale data for transactional calls
const networkOnlyPattern = ({ url }) =>
  url.hostname.includes('supabase.co') &&
  (
    url.pathname.includes('/rest/v1/orders') ||
    url.pathname.includes('/rest/v1/billing_history') ||
    url.pathname.includes('/rest/v1/expenses') ||
    url.pathname.includes('/rest/v1/day_closes') ||
    url.pathname.includes('/functions/v1/') ||
    url.pathname.includes('/auth/')
  )

registerRoute(networkOnlyPattern, new NetworkOnly())

// ─── Push notifications (Web Push for new orders) ────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'New Order!'
  const options = {
    body: data.body ?? 'A new order has been placed',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    tag: 'hungriar-order',
    requireInteraction: true,
    data: { url: data.url ?? '/admin/orders' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/admin') && 'focus' in client) return client.focus()
      }
      const url = event.notification.data?.url ?? '/admin/orders'
      return clients.openWindow?.(url)
    }),
  )
})

// ─── Skip waiting — activate new SW immediately on update ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
