import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { supabase } from '../../lib/supabase'
import OrderCard from '../../components/OrderCard'
import { ORDER_STATUS_COLORS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, formatTime } from '../../utils/formatters'

const STATUS_MESSAGES = {
  pending: 'Your order has been received and is waiting to be prepared.',
  preparing: 'The kitchen is preparing your order.',
  served: 'Your order has been served. Enjoy your meal!',
  completed: 'This order is complete. Thanks for dining with us!',
}

const ORDERS_STORAGE_PREFIX = 'goana_orders_'

export default function OrderStatus() {
  const { restaurantSlug, orderId } = useParams()
  const { restaurant } = useRestaurant()
  const { orders, loading } = useRealtimeOrders({ orderId })
  const [pastOrders, setPastOrders] = useState([])
  const [pastLoading, setPastLoading] = useState(true)

  const order = orders[0]
  const currency = restaurant?.currency || '₹'

  useEffect(() => {
    let cancelled = false

    async function loadPastOrders() {
      setPastLoading(true)
      try {
        const stored = JSON.parse(localStorage.getItem(`${ORDERS_STORAGE_PREFIX}${restaurantSlug}`) || '[]')
        const otherIds = stored.filter((id) => id !== orderId)

        if (otherIds.length === 0) {
          if (!cancelled) setPastOrders([])
          return
        }

        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), tables(table_number)')
          .in('id', otherIds)
          .order('order_time', { ascending: false })

        if (!error && !cancelled) setPastOrders(data || [])
      } finally {
        if (!cancelled) setPastLoading(false)
      }
    }

    loadPastOrders()
    return () => {
      cancelled = true
    }
  }, [restaurantSlug, orderId])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <div className="skeleton h-10 w-1/2 rounded-lg" />
        <div className="skeleton h-56 w-full rounded-2xl" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sand-100 p-6 text-center">
        <p className="text-lg font-semibold text-gray-800">We couldn't find this order.</p>
        <Link to={`/r/${restaurantSlug}`} className="btn-primary mt-4">
          Back to Menu
        </Link>
      </div>
    )
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status)

  return (
    <div className="min-h-screen bg-sand-100 pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <Link
          to={`/r/${restaurantSlug}`}
          aria-label="Back to menu"
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100"
        >
          ←
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Order Status</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Table {order.tables?.table_number ?? '-'}</p>
              <p className="text-xs text-gray-400">Placed {formatTime(order.order_time)}</p>
            </div>
            <span className={`badge ${ORDER_STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          <div className="mt-5 flex items-center">
            {ORDER_STATUS_FLOW.map((status, idx) => (
              <div key={status} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      idx <= currentIndex ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <p className={`mt-1 whitespace-nowrap text-[11px] ${idx <= currentIndex ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                    {ORDER_STATUS_LABELS[status]}
                  </p>
                </div>
                {idx < ORDER_STATUS_FLOW.length - 1 && (
                  <div className={`mx-1 h-0.5 flex-1 ${idx < currentIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 rounded-lg bg-sand-50 px-3 py-2 text-sm text-gray-600">{STATUS_MESSAGES[order.status]}</p>
        </div>

        <OrderCard order={order} currency={currency} />

        <Link to={`/r/${restaurantSlug}`} className="btn-outline block w-full text-center">
          Order More Items
        </Link>

        {!pastLoading && pastOrders.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Earlier Orders</h2>
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
