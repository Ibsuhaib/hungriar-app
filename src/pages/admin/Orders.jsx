import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, CheckCircle2, Bell, BellOff, XCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import OrderCard from '../../components/OrderCard'
import { usePushNotifications } from '../../hooks/usePushNotifications'

// Persistent AudioContext — must be created/resumed during a user gesture
// because browsers block audio that starts without interaction.
let _audioCtx = null

function unlockAudio() {
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {})
  } catch (_) {}
}

function playBell() {
  const ctx = _audioCtx
  if (!ctx) return
  const ring = () => {
    try {
      const now = ctx.currentTime
      // Compressor lets us push gain hard without clipping
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -3
      comp.ratio.value = 20
      comp.attack.value = 0.001
      comp.release.value = 0.05
      comp.connect(ctx.destination)
      // Three loud bursts — 880 Hz + 1100 Hz for a piercing ring ring ring
      for (let burst = 0; burst < 3; burst++) {
        const t = now + burst * 0.55
        ;[880, 1100].forEach((freq) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          osc.connect(gain)
          gain.connect(comp)
          gain.gain.setValueAtTime(0, t)
          gain.gain.linearRampToValueAtTime(0.8, t + 0.01)
          gain.gain.setValueAtTime(0.8, t + 0.35)
          gain.gain.linearRampToValueAtTime(0, t + 0.4)
          osc.start(t)
          osc.stop(t + 0.4)
        })
      }
    } catch (_) {}
  }
  if (ctx.state === 'suspended') {
    ctx.resume().then(ring).catch(() => {})
  } else {
    ring()
  }
}

function NotificationButton({ restaurantId }) {
  const { status, isSupported, enable } = usePushNotifications({ restaurantId })
  if (!isSupported) return null
  if (status === 'subscribed') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-100 rounded-full px-3 py-1 font-medium">
        <Bell className="w-3 h-3" /> Notifications on
      </span>
    )
  }
  if (status === 'denied') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
        <BellOff className="w-3 h-3" /> Blocked
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={enable}
      disabled={status === 'requesting'}
      className="flex items-center gap-1.5 text-xs text-primary-600 bg-primary-50 border border-primary-100 rounded-full px-3 py-1 font-medium hover:bg-primary-100 transition-colors disabled:opacity-60"
    >
      <Bell className="w-3 h-3" />
      {status === 'requesting' ? 'Enabling…' : 'Enable notifications'}
    </button>
  )
}

export default function Orders() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()
  const handleNewOrder = useCallback(() => { playBell() }, [])
  const { orders, loading, patchOrder, refetch } = useRealtimeOrders({ restaurantId: restaurant?.id, pollInterval: 3000, onInsert: handleNewOrder })
  const [settledTodayCount, setSettledTodayCount] = useState(0)

  // Create AudioContext on mount (suspended) and resume on any user click.
  useEffect(() => {
    unlockAudio()
    document.addEventListener('click', unlockAudio)
    document.addEventListener('touchend', unlockAudio)
    return () => {
      document.removeEventListener('click', unlockAudio)
      document.removeEventListener('touchend', unlockAudio)
    }
  }, [])

  useEffect(() => {
    if (!restaurant?.id) return
    function fetchSettled() {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      supabase
        .from('billing_history')
        .select('orders_json')
        .eq('restaurant_id', restaurant.id)
        .gte('bill_date', todayStart.toISOString())
        .then(({ data }) => {
          const count = (data || []).reduce(
            (sum, row) => sum + (Array.isArray(row.orders_json) ? row.orders_json.length : 0),
            0,
          )
          setSettledTodayCount(count)
        })
    }
    fetchSettled()
    const timer = setInterval(fetchSettled, 15000)
    return () => clearInterval(timer)
  }, [restaurant?.id])

  const pendingOrders = useMemo(
    () => orders
      .filter((o) => o.status !== 'completed' && o.status !== 'cancelled')
      .sort((a, b) => new Date(a.order_time) - new Date(b.order_time)),
    [orders],
  )

  const cancelledOrders = useMemo(
    () => orders
      .filter((o) => o.status === 'cancelled')
      .sort((a, b) => new Date(b.order_time) - new Date(a.order_time)),
    [orders],
  )

  const completedToday = useMemo(() => {
    const todayKey = new Date().toDateString()
    const active = orders.filter(
      (o) => o.status === 'completed' && new Date(o.order_time).toDateString() === todayKey,
    ).length
    return active + settledTodayCount
  }, [orders, settledTodayCount])

  const handleStatusChange = async (orderId, newStatus) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const prevStatus = orders.find((o) => o.id === orderId)?.status
    patchOrder(orderId, { status: newStatus })
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) {
      toast.error('Failed to update order status')
      if (prevStatus) patchOrder(orderId, { status: prevStatus })
    }
  }

  const handleCancelItem = async (orderId, itemId, itemName) => {
    if (!window.confirm(`Cancel "${itemName}" from this order?`)) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.rpc('cancel_order_item', { p_item_id: itemId })
    if (error) {
      toast.error('Failed to cancel item')
    } else {
      toast.success(`${itemName} cancelled`)
      refetch({ silent: true })
    }
  }

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this entire order? This cannot be undone.')) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId })
    if (error) {
      toast.error('Failed to cancel order')
    } else {
      toast.success('Order cancelled')
      refetch({ silent: true })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 leading-none">Active</p>
            <p className="text-xl font-bold text-gray-900 leading-tight">{pendingOrders.length}</p>
          </div>
        </div>
        <div className="w-px h-8 bg-gray-200 mx-1" />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-green-50">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-gray-400 leading-none">Completed today</p>
            <p className="text-xl font-bold text-gray-900 leading-tight">{completedToday}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NotificationButton restaurantId={restaurant?.id} />
          {pendingOrders.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-3 py-1">
              <Bell className="w-3 h-3" />
              {pendingOrders.length} need{pendingOrders.length === 1 ? 's' : ''} attention
            </span>
          )}
        </div>
      </div>

      {/* Active orders grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      ) : pendingOrders.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card py-16 text-center bg-gray-50"
        >
          <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600">All caught up!</p>
          <p className="text-xs text-gray-400 mt-1">New orders will appear here automatically.</p>
        </motion.div>
      ) : (
        <AnimatePresence>
          <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendingOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                onCancelItem={handleCancelItem}
                onCancelOrder={handleCancelOrder}
                currency={restaurant?.currency}
                restaurantName={restaurant?.name}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Cancelled orders section */}
      {cancelledOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <XCircle className="w-4 h-4 text-red-300" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Cancelled ({cancelledOrders.length})
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
            {cancelledOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                currency={restaurant?.currency}
                restaurantName={restaurant?.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
