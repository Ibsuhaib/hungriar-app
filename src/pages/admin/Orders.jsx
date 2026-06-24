import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import OrderCard from '../../components/OrderCard'
import { ORDER_STATUS_LABELS } from '../../utils/formatters'

const FILTERS = ['all', 'pending', 'preparing', 'served']
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// Synthesised bell tone via Web Audio API — plays when a new order arrives
// while the tab is open. No audio file needed.
function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    ;[[880, 0.5], [1320, 0.25], [2200, 0.1]].forEach(([freq, vol]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
      osc.start(now)
      osc.stop(now + 1.2)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1500)
  } catch (_) {}
}

export default function Orders() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()
  const [filter, setFilter] = useState('all')
  // 'idle' | 'prompt' | 'granted' | 'denied'
  const [notifState, setNotifState] = useState('idle')

  // Fired by the Realtime subscription on every new order INSERT
  const handleNewOrder = useCallback(() => {
    playBell()
  }, [])

  const { orders, loading } = useRealtimeOrders({ restaurantId: restaurant?.id, onInsert: handleNewOrder })

  // Register service worker + subscribe to push so the chef gets an OS
  // notification (and the device's default notification sound) even when
  // the browser tab is closed.
  const autoSubscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY || !user || !restaurant) return
    try {
      await navigator.serviceWorker.register('/sw.js')
      const swReg = await navigator.serviceWorker.ready

      let sub = await swReg.pushManager.getSubscription()
      if (!sub) {
        sub = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const subJson = sub.toJSON()
      await supabase.from('push_subscriptions').upsert(
        {
          restaurant_id: restaurant.id,
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth_key: subJson.keys.auth,
        },
        { onConflict: 'user_id,endpoint' },
      )
      setNotifState('granted')
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        setNotifState('denied')
      }
      console.error('push subscribe error', err)
    }
  }, [user, restaurant])

  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      autoSubscribe()
    } else if (Notification.permission === 'denied') {
      setNotifState('denied')
    } else {
      // 'default' — some browsers (Safari) require a user gesture to request
      // permission; show a tap-to-enable banner and subscribe on first click.
      setNotifState('prompt')
    }
  }, [autoSubscribe])

  const handleEnableClick = async () => {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      await autoSubscribe()
    } else {
      setNotifState('denied')
    }
  }

  const activeOrders = useMemo(() => {
    const active = orders
      .filter((order) => order.status !== 'completed')
      .sort((a, b) => new Date(a.order_time) - new Date(b.order_time))
    if (filter === 'all') return active
    return active.filter((order) => order.status === filter)
  }, [orders, filter])

  const handleStatusChange = async (orderId, newStatus) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) toast.error('Failed to update order status')
  }

  return (
    <div className="space-y-4">
      {notifState === 'prompt' && (
        <button
          type="button"
          onClick={handleEnableClick}
          className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left text-sm text-amber-800 hover:bg-amber-100 transition-colors"
        >
          🔔 <span className="font-medium">Tap here to enable order notification sounds</span>
          <span className="ml-1 text-amber-600">— you'll hear a bell and get an alert even when this tab is closed.</span>
        </button>
      )}

      {notifState === 'denied' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          🔕 <span className="font-medium">Notifications are blocked.</span> Order sounds are disabled on this device.
          To fix this, allow notifications for this site in your browser settings, then reload.
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === value ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-primary-50'
            }`}
          >
            {value === 'all' ? 'All Active' : ORDER_STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      ) : activeOrders.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No orders to show.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeOrders.map((order) => (
            <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} currency={restaurant?.currency} />
          ))}
        </div>
      )}
    </div>
  )
}
