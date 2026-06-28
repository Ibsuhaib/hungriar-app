import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { Clock, CheckCircle2, TrendingUp, ArrowRight, Bell, BellOff, ChefHat, Sunset, Download, Printer, WifiOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRateLimit } from '../../hooks/useRateLimit'
import { useSessionStart } from '../../hooks/useSessionStart'
import { supabase } from '../../lib/supabase'
import SubscriptionBanner from '../../components/SubscriptionBanner'
import OrderCard from '../../components/OrderCard'
import { formatCurrency } from '../../utils/formatters'
import { usePushNotifications, showNotification } from '../../hooks/usePushNotifications'
import { usePwaInstall } from '../../hooks/usePwaInstall'
import { getQueuedOrders, getQueuedBills } from '../../utils/offlineQueue'

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.value = 0.15
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.25)
    oscillator.onended = () => ctx.close()
  } catch {
    // audio not available
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
        <BellOff className="w-3 h-3" /> Notifications blocked
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

function KOTToggle({ restaurantId }) {
  const key = restaurantId ? `hungriar_kot_auto_${restaurantId}` : null
  const [on, setOn] = useState(false)

  useEffect(() => {
    if (key) setOn(localStorage.getItem(key) === 'true')
  }, [key])

  const toggle = () => {
    if (!key) return
    setOn((prev) => { localStorage.setItem(key, String(!prev)); return !prev })
  }
  return (
    <button
      type="button"
      onClick={toggle}
      title={on ? 'Auto-print KOT ON — click to turn off' : 'Auto-print KOT OFF — click to turn on'}
      className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-medium border transition-colors ${
        on
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
      }`}
    >
      <Printer className="w-3 h-3" />
      KOT {on ? 'ON' : 'OFF'}
    </button>
  )
}

const STAT_CONFIG = [
  { key: 'pending', label: 'Awaiting', icon: Clock, gradient: 'from-amber-400 to-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  { key: 'completedToday', label: 'Completed Today', icon: CheckCircle2, gradient: 'from-green-400 to-green-500', bg: 'bg-green-50', text: 'text-green-700' },
]

function StatCard({ config, value, index }) {
  const Icon = config.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.25 }}
      className={`card flex items-center gap-4 ${config.bg}`}
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${config.gradient} shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className={`text-sm font-medium ${config.text} opacity-80`}>{config.label}</p>
        <p className={`text-3xl font-bold ${config.text} leading-none mt-0.5`}>{value}</p>
      </div>
    </motion.div>
  )
}

const QUICK_LINKS = [
  { to: '/admin/orders', label: 'View All Orders', icon: '📋' },
  { to: '/admin/tables', label: 'Tables & QR', icon: '🪑' },
  { to: '/admin/menu', label: 'Manage Menu', icon: '🍽' },
  { to: '/admin/analytics', label: 'Analytics', icon: '📊' },
]

export default function Dashboard() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()
  const { sessionStart } = useSessionStart(restaurant?.id)
  const { canInstall, install } = usePwaInstall()
  const [settledToday, setSettledToday]   = useState({ count: 0, revenue: 0 })
  const [offlinePending, setOfflinePending] = useState(0)

  useEffect(() => {
    if (!restaurant?.id) return
    Promise.all([getQueuedOrders(), getQueuedBills()]).then(([orders, bills]) => {
      const id = restaurant.id
      setOfflinePending(
        orders.filter((o) => o.restaurantId === id).length +
        bills.filter((b) => b.restaurantId === id).length
      )
    })
  }, [restaurant?.id])

  // Show "just ended" banner for 10 minutes after End Day
  const justEndedKey = restaurant?.id ? `hungriar_day_ended_${restaurant.id}` : null
  const justEndedAt  = justEndedKey ? Number(localStorage.getItem(justEndedKey) ?? 0) : 0
  const isTodayClosed = justEndedAt > 0 && Date.now() - justEndedAt < 10 * 60 * 1000

  useEffect(() => {
    if (!restaurant?.id || !sessionStart) return
    function fetchSettled() {
      supabase
        .from('billing_history')
        .select('orders_json, total_amount')
        .eq('restaurant_id', restaurant.id)
        .gte('bill_date', sessionStart)
        .then(({ data }) => {
          const settled = (data || []).reduce(
            (acc, row) => ({
              count: acc.count + (Array.isArray(row.orders_json) ? row.orders_json.length : 0),
              revenue: acc.revenue + Number(row.total_amount),
            }),
            { count: 0, revenue: 0 },
          )
          setSettledToday(settled)
        })
    }
    fetchSettled()
    const timer = setInterval(fetchSettled, 15000)
    return () => clearInterval(timer)
  }, [restaurant?.id, sessionStart])

  const handleNewOrder = useCallback((order) => {
    playNotificationSound()
    toast.success('New order received!', { id: `order-${order.id}`, icon: '🔔' })
    showNotification(
      'New Order!',
      `Table ${order.tables?.table_number ?? '?'} placed an order`,
    )
  }, [])

  const { orders, loading, patchOrder, refetch } = useRealtimeOrders({ restaurantId: restaurant?.id, onInsert: handleNewOrder, pollInterval: 3000 })

  const stats = useMemo(() => {
    if (!sessionStart) return { pending: 0, completedToday: 0, todayRevenue: 0 }
    const sessionDate = new Date(sessionStart)
    const completedSinceStart = orders.filter(
      (o) => o.status === 'completed' && new Date(o.order_time) >= sessionDate,
    )
    return {
      pending: orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length,
      completedToday: completedSinceStart.length + settledToday.count,
      todayRevenue: completedSinceStart.reduce((sum, o) => sum + Number(o.total_amount), 0) + settledToday.revenue,
    }
  }, [orders, settledToday, sessionStart])

  const activeOrders = useMemo(
    () => isTodayClosed ? [] : orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').slice(0, 6),
    [orders, isTodayClosed],
  )

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
    <div className="space-y-6">
      <SubscriptionBanner restaurant={restaurant} />

      {/* Day Closed banner */}
      {isTodayClosed && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-orange-50 to-rose-50 border border-orange-100 rounded-2xl px-4 py-3">
          <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow-sm">
            <Sunset className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-orange-800">Day Closed</p>
            <p className="text-xs text-orange-600">All orders cleared. Ready for a fresh start — new orders will appear here.</p>
          </div>
        </div>
      )}

      {/* Offline orders pending sync */}
      {offlinePending > 0 && (
        <Link
          to="/admin/take-order"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
        >
          <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">{offlinePending} offline order{offlinePending > 1 ? 's' : ''} pending sync</p>
            <p className="text-xs text-amber-600">Tap to go to Take Order and sync them now.</p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-500 flex-shrink-0" />
        </Link>
      )}

      {/* Notification + Chef mode + KOT + Install row */}
      <div className="flex items-center gap-3 flex-wrap">
        <NotificationButton restaurantId={restaurant?.id} />
        <Link
          to="/admin/chef"
          className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 font-medium hover:bg-gray-100 transition-colors"
        >
          <ChefHat className="w-3 h-3" /> Open Chef View
        </Link>
        <KOTToggle restaurantId={restaurant?.id} />
        {canInstall && (
          <button
            type="button"
            onClick={install}
            className="flex items-center gap-1.5 text-xs text-white bg-gradient-to-r from-orange-500 to-rose-500 rounded-full px-3 py-1 font-medium hover:opacity-90 transition-opacity shadow-sm"
          >
            <Download className="w-3 h-3" /> Install App
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {STAT_CONFIG.map((config, i) => (
          <StatCard key={config.key} config={config} value={stats[config.key]} index={i} />
        ))}
      </div>

      {/* Revenue card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.25 }}
        className="card flex items-center justify-between gap-4"
      >
        <div>
          <p className="text-sm text-gray-500">Today's Revenue</p>
          <p className="text-3xl font-bold text-gray-900 mt-0.5 font-display">
            {formatCurrency(stats.todayRevenue, restaurant?.currency)}
          </p>
          <p className="text-xs text-gray-400 mt-1">From completed orders today</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex-shrink-0 shadow-sm">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
      </motion.div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="card flex items-center gap-2.5 hover:shadow-card-hover hover:bg-gray-50 transition-all duration-200 group"
          >
            <span className="text-xl">{link.icon}</span>
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 leading-tight">{link.label}</span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-400 ml-auto transition-colors" />
          </Link>
        ))}
      </div>

      {/* Active orders */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary-500" />
          <h2 className="text-base font-bold text-gray-900 font-display">Active Orders</h2>
          {activeOrders.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
              {activeOrders.length}
            </span>
          )}
          <Link to="/admin/orders" className="ml-auto text-xs font-medium text-primary-600 hover:underline">
            See all
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="card text-center py-10 bg-gray-50">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-sm font-medium text-gray-500">No active orders right now.</p>
            <p className="text-xs text-gray-400 mt-1">New orders will appear here automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeOrders.map((order) => (
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
          </div>
        )}
      </div>
    </div>
  )
}
