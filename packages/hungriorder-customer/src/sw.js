/* hungriOrder customer service worker.
   Precache the app shell; cache menu/restaurant API reads and images so a
   customer can browse a previously visited restaurant offline. Ordering
   always requires a network connection. */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Supabase REST reads (restaurant profile, menu) — fresh when online,
// cached copy when offline.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && url.pathname.startsWith('/rest/v1/'),
  new StaleWhileRevalidate({
    cacheName: 'ho-api',
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 24 * 60 * 60 })],
  })
);

// Menu images and logos from Supabase Storage
registerRoute(
  ({ url }) => url.pathname.includes('/storage/v1/object/public/'),
  new CacheFirst({
    cacheName: 'ho-images',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  })
);
