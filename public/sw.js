/* Service worker — handles Web Push notifications for new orders */

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'New Order!'
  const options = {
    body: data.body ?? 'A new order has been placed',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
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
