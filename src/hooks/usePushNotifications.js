import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Manages push notification permission and Web Push subscription for the
 * admin panel. Falls back gracefully when service workers or VAPID are
 * unavailable.
 *
 * status values: 'idle' | 'requesting' | 'subscribed' | 'denied' | 'unsupported'
 */
export function usePushNotifications({ restaurantId } = {}) {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window

  const [status, setStatus] = useState(() => {
    if (!isSupported) return 'unsupported'
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') return 'subscribed'
      if (Notification.permission === 'denied') return 'denied'
    }
    return 'idle'
  })

  useEffect(() => {
    if (!isSupported) return
    if (Notification.permission === 'granted') setStatus('subscribed')
    else if (Notification.permission === 'denied') setStatus('denied')
  }, [isSupported])

  const enable = useCallback(async () => {
    if (!isSupported || status === 'requesting') return
    setStatus('requesting')

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }

      // Register service worker (no-op if already registered)
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Only attempt push subscription when VAPID key is configured
      if (VAPID_PUBLIC_KEY && restaurantId) {
        try {
          const existing = await registration.pushManager.getSubscription()
          if (existing) await existing.unsubscribe()

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })

          const { endpoint, keys } = subscription.toJSON()
          await supabase.from('push_subscriptions').upsert(
            { restaurant_id: restaurantId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
            { onConflict: 'restaurant_id,endpoint' },
          )
        } catch {
          // Push subscription failed but browser notifications still work
        }
      }

      setStatus('subscribed')
    } catch {
      setStatus('idle')
    }
  }, [isSupported, restaurantId, status])

  return { status, isSupported, enable }
}

/** Show a browser notification immediately (works when tab is open). */
export function showNotification(title, body, url = '/admin/orders') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'hungriar-order', requireInteraction: true })
    n.onclick = () => { window.focus(); n.close() }
  } catch {
    // Notification API blocked or unavailable
  }
}
