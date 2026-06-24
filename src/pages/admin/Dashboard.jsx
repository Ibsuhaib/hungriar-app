import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import SubscriptionBanner from '../../components/SubscriptionBanner'
import OrderCard from '../../components/OrderCard'
import { formatCurrency } from '../../utils/formatters'

const STAT_TONES = {
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  secondary: 'bg-secondary-50 text-secondary-700',
  primary: 'bg-primary-50 text-primary-700',
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`rounded-xl p-4 shadow-card ${STAT_TONES[tone]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  )
}

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
    // audio not available - ignore
  }
}

export default function Dashboard() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const handleNewOrder = useCallback((order) => {
    playNotificationSound()
    toast.success('New order received!', { id: `order-${order.id}` })
  }, [])

  const { orders, loading } = useRealtimeOrders({ restaurantId: restaurant?.id, onInsert: handleNewOrder })

  const stats = useMemo(() => {
    const todayKey = new Date().toDateString()
    const todayOrders = orders.filter((order) => new Date(order.order_time).toDateString() === todayKey)

    return {
      pending: orders.filter((order) => order.status === 'pending').length,
      preparing: orders.filter((order) => order.status === 'preparing').length,
      served: orders.filter((order) => order.status === 'served').length,
      todayCount: todayOrders.length,
      todayRevenue: todayOrders
        .filter((order) => order.status === 'completed')
        .reduce((sum, order) => sum + Number(order.total_amount), 0),
    }
  }, [orders])

  const activeOrders = useMemo(() => orders.filter((order) => order.status !== 'completed').slice(0, 6), [orders])

  const handleStatusChange = async (orderId, newStatus) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) toast.error('Failed to update order status')
  }

  return (
    <div className="space-y-6">
      <SubscriptionBanner restaurant={restaurant} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={stats.pending} tone="amber" />
        <StatCard label="Preparing" value={stats.preparing} tone="blue" />
        <StatCard label="Served" value={stats.served} tone="secondary" />
        <StatCard label="Today's Orders" value={stats.todayCount} tone="primary" />
      </div>

      <div className="card">
        <p className="text-sm text-gray-500">Today's Revenue (completed orders)</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(stats.todayRevenue, restaurant?.currency)}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/admin/orders" className="btn-outline">
          View All Orders
        </Link>
        <Link to="/admin/tables" className="btn-outline">
          Manage Tables & QR
        </Link>
        <Link to="/admin/menu" className="btn-outline">
          Manage Menu
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Active Orders</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        ) : activeOrders.length === 0 ? (
          <p className="text-gray-500">No active orders right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeOrders.map((order) => (
              <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} currency={restaurant?.currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
