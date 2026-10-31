import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, CheckCircle2, ShoppingBag, Users } from 'lucide-react'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { supabase } from '../../lib/supabase'
import OrderCard from '../../components/OrderCard'
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, formatTime, formatCurrency } from '../../utils/formatters'
import { useTableOrders } from '../../hooks/useTableOrders'
import { getDeviceTag } from '../../utils/deviceTag'

// Two-step tracker: order placed → ready for customer
const TRACKER_STEPS = [
  { key: 'pending', label: 'Order Placed', Icon: Clock },
  { key: 'completed', label: 'Ready', Icon: CheckCircle2 },
]

const STATUS_MESSAGES = {
  awaiting_approval: 'Order sent! A staff member will confirm your table in a moment, then it goes straight to the kitchen.',
  pending: "Your order has been received and is being prepared. We'll let you know when it's ready!",
  preparing: 'The kitchen is working on your order. Almost there!',
  served: 'Your order is on the way to your table. Enjoy!',
  completed: 'Your order is ready! Thank you for dining with us.',
}

const STATUS_GRADIENT = {
  awaiting_approval: 'from-orange-400 to-orange-500',
  pending: 'from-amber-400 to-amber-500',
  preparing: 'from-primary-400 to-primary-600',
  served: 'from-secondary-400 to-secondary-600',
  completed: 'from-green-400 to-green-600',
}

const ORDERS_STORAGE_PREFIX = 'hungriar_orders_'

const NOT_YET_COOKING = ['awaiting_approval', 'pending']

/**
 * Everything ordered at this table during this visit, from every phone and
 * from the waiter, with the running bill. Each phone keeps its own cart; this
 * is what lets a family see one shared picture of the table.
 */
function TableOrdersPanel({ orders, total, tableNumber, currentOrderId, currency }) {
  const myTag = getDeviceTag()
  if (orders.length === 0) return null
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-sand-200">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary-500" />
          <h2 className="text-sm font-bold text-gray-900">Table {tableNumber} · everyone&apos;s orders</h2>
        </div>
        <span className="text-xs text-gray-400">{orders.length} order{orders.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="divide-y divide-sand-100">
        {orders.map((o) => {
          const mine = myTag && o.device_tag === myTag
          return (
            <li key={o.id} className={`px-4 py-3 ${o.id === currentOrderId ? 'bg-primary-50/50' : ''}`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${mine ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
                    {mine ? 'You' : o.device_tag ? 'Someone at your table' : 'Waiter'}
                  </span>
                  <span className="text-xs text-gray-400">{formatTime(o.order_time)}</span>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                  {ORDER_STATUS_LABELS[o.status] || o.status}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {(o.items || []).map((i) => `${i.quantity}× ${i.item_name}`).join(', ')}
              </p>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-between items-center px-4 py-3 bg-sand-50 border-t border-sand-200">
        <span className="text-sm font-semibold text-gray-700">Table bill so far</span>
        <span className="text-base font-bold text-primary-600">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  )
}

export default function OrderStatus() {
  const { restaurantSlug, orderId } = useParams()
  const navigate = useNavigate()
  const { restaurant, session } = useRestaurant()
  // includeAwaiting: this page must show the customer's own order while it
  // waits for staff to confirm the table.
  const { orders, loading } = useRealtimeOrders({ orderId, pollInterval: 2000, includeAwaiting: true })
  const tableView = useTableOrders(session)
  const [pastOrders, setPastOrders] = useState([])
  const [pastLoading, setPastLoading] = useState(true)

  const order = orders[0]
  const currency = restaurant?.currency || '₹'

  useEffect(() => {
    let isMounted = true
    const storageKey = `${ORDERS_STORAGE_PREFIX}${restaurantSlug}`

    async function loadPastOrders() {
      setPastLoading(true)
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
        const otherIds = stored.filter((id) => id !== orderId)
        if (otherIds.length === 0) {
          if (isMounted) setPastOrders([])
          return
        }
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), tables(table_number)')
          .in('id', otherIds)
          .neq('status', 'cancelled')   // never show cancelled orders to customer
          .order('order_time', { ascending: false })
        if (!isMounted) return
        const rows = error ? [] : (data || [])
        setPastOrders(rows)
        // Remove stale IDs (settled/deleted orders) from localStorage
        const liveIds = new Set(rows.map((o) => o.id))
        const cleaned = stored.filter((id) => id === orderId || liveIds.has(id))
        localStorage.setItem(storageKey, JSON.stringify(cleaned))
      } finally {
        if (isMounted) setPastLoading(false)
      }
    }

    loadPastOrders()
    return () => { isMounted = false }
  }, [restaurantSlug, orderId])

  if (loading) {
    return (
      <div className="min-h-screen bg-sand-100">
        <div className="h-14 bg-white shadow-sm" />
        <div className="mx-auto max-w-2xl space-y-3 p-4">
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="skeleton h-56 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sand-100 p-6 text-center">
        <p className="text-5xl mb-4">🔍</p>
        <p className="text-lg font-semibold text-gray-800">We couldn't find this order.</p>
        <Link to={`/r/${restaurantSlug}`} className="btn-primary mt-4">
          Back to Menu
        </Link>
      </div>
    )
  }

  // 0 = placed (pending), 1 = ready (anything else)
  const trackerIndex = NOT_YET_COOKING.includes(order.status) ? 0 : 1
  const gradient = STATUS_GRADIENT[order.status] || 'from-primary-400 to-primary-600'
  const isReady = !NOT_YET_COOKING.includes(order.status)

  return (
    <div className="min-h-screen bg-sand-100 pb-10">
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(`/r/${restaurantSlug}`, { replace: true })}
            aria-label="Back to menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Order Status</h1>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${ORDER_STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
            {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* Status card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-card overflow-hidden"
        >
          {/* Gradient header */}
          <div className={`bg-gradient-to-r ${gradient} p-5 text-white`}>
            <div className="flex items-center gap-3 mb-3">
              <motion.div
                animate={!isReady ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0"
              >
                {isReady
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : <Clock className="w-5 h-5 text-white" />}
              </motion.div>
              <div>
                <p className="font-semibold text-white/95">
                  Table {order.tables?.table_number ?? '-'}
                </p>
                <p className="text-xs text-white/70 mt-0.5">
                  Placed {formatTime(order.order_time)}
                </p>
              </div>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">
              {STATUS_MESSAGES[order.status] || STATUS_MESSAGES.pending}
            </p>
          </div>

          {/* 2-step progress tracker */}
          <div className="px-5 py-5">
            <div className="flex items-center">
              {TRACKER_STEPS.map(({ key, label, Icon }, idx) => {
                const done = idx <= trackerIndex
                const active = idx === trackerIndex
                return (
                  <div key={key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <motion.div
                        animate={{
                          backgroundColor: done ? '#22c55e' : '#e5e7eb',
                          scale: active ? [1, 1.18, 1] : 1,
                        }}
                        transition={{
                          scale: { repeat: Infinity, duration: 1.6, ease: 'easeInOut' },
                          backgroundColor: { duration: 0.35 },
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                      >
                        <Icon className="w-4 h-4" style={{ color: done ? '#fff' : '#9ca3af' }} />
                      </motion.div>
                      <p className={`whitespace-nowrap text-[11px] font-semibold ${done ? 'text-green-600' : 'text-gray-300'}`}>
                        {label}
                      </p>
                    </div>
                    {idx < TRACKER_STEPS.length - 1 && (
                      <motion.div
                        animate={{ backgroundColor: trackerIndex > idx ? '#22c55e' : '#e5e7eb' }}
                        transition={{ duration: 0.5 }}
                        className="mx-3 h-0.5 flex-1 rounded-full mb-5"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {isReady && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 text-center text-sm font-semibold text-green-600"
              >
                Your order is ready! 🎉
              </motion.p>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <OrderCard order={order} currency={currency} />
        </motion.div>

        <button
          type="button"
          onClick={() => navigate(`/r/${restaurantSlug}`, { replace: true })}
          className="btn-outline block w-full text-center"
        >
          Order More Items
        </button>

        {/* Whole table's orders — shown when this phone holds the table's
            current session; otherwise fall back to this phone's own history */}
        {tableView.orders.length > 0 && (
          <TableOrdersPanel
            orders={tableView.orders}
            total={tableView.total}
            tableNumber={session?.tableNumber ?? order.tables?.table_number ?? '-'}
            currentOrderId={orderId}
            currency={currency}
          />
        )}

        {/* Earlier orders */}
        {tableView.orders.length === 0 && !pastLoading && pastOrders.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Earlier Orders
              </h2>
            </div>
            <div className="space-y-3">
              {pastOrders.map((pastOrder) => (
                <OrderCard key={pastOrder.id} order={pastOrder} currency={currency} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
