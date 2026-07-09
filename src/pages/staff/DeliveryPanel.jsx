import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Bike, LogOut, Phone, MapPin, StickyNote, CheckCircle2, Clock, ChefHat, Package, Banknote } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatTime } from '../../utils/formatters'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'

const PM_LABELS = { cash: 'CASH — collect on delivery', upi: 'UPI', card: 'Card', other: 'Other' }

function addressText(addr) {
  if (!addr) return ''
  return [addr.line1, addr.line2, addr.landmark, addr.city, addr.pincode].filter(Boolean).join(', ')
}

function OrderCard({ order, currency, onAdvance, busy }) {
  const addr = order.delivery_address
  const addrStr = addressText(addr)
  const items = (order.order_items || []).filter((i) => !i.cancelled)
  const isReady = order.status === 'ready'
  const isOut = order.status === 'out_for_delivery'
  const isCash = (order.payment_method || 'cash') === 'cash'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="card overflow-hidden p-0"
    >
      {/* Header strip */}
      <div className={`px-4 py-3 flex items-center gap-3 bg-gradient-to-r ${
        isOut ? 'from-purple-400 to-purple-600' : isReady ? 'from-indigo-400 to-indigo-600' : 'from-amber-400 to-amber-500'
      }`}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          {isOut ? <Bike className="w-4 h-4 text-white" /> : isReady ? <Package className="w-4 h-4 text-white" /> : <ChefHat className="w-4 h-4 text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-none truncate">
            {order.customer_name || 'Customer'} · #{order.id.slice(0, 6).toUpperCase()}
          </p>
          <p className="text-xs text-white/70 mt-0.5">{formatTime(order.order_time)}</p>
        </div>
        <span className="text-sm font-bold text-white flex-shrink-0">
          {formatCurrency(order.total_amount, currency)}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2">
        {/* Contact + address */}
        <div className="flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-1 ${
            isCash ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            <Banknote className="w-3 h-3" />
            {PM_LABELS[order.payment_method] || order.payment_method}
          </span>
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              className="flex items-center gap-1.5 text-xs font-bold text-primary-600 bg-primary-50 border border-primary-100 rounded-full px-3 py-1"
            >
              <Phone className="w-3 h-3" /> Call
            </a>
          )}
        </div>

        {addrStr && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(addrStr)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-1.5 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 hover:bg-gray-100 transition-colors"
          >
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
            <span className="flex-1">{addrStr}</span>
          </a>
        )}

        {order.notes && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 italic">
            <StickyNote className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {order.notes}
          </p>
        )}

        {/* Items */}
        <ul className="text-xs text-gray-500 space-y-0.5 pt-1 border-t border-dashed border-gray-100">
          {items.map((i) => (
            <li key={i.id}>
              <span className="font-semibold text-gray-700">{i.quantity}×</span> {i.item_name}
            </li>
          ))}
        </ul>
      </div>

      {/* Action */}
      {(isReady || isOut) && (
        <div className="px-4 pb-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            onClick={() => onAdvance(order)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white shadow-lg transition-opacity disabled:opacity-50 bg-gradient-to-r ${
              isReady ? 'from-purple-500 to-purple-600' : 'from-green-500 to-green-600'
            }`}
          >
            {isReady ? (<><Bike className="w-4 h-4" /> Start Delivery</>) : (<><CheckCircle2 className="w-4 h-4" /> Mark Delivered</>)}
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}

export default function DeliveryPanel() {
  const { restaurant, signOut } = useAuth()
  const navigate = useNavigate()
  const currency = restaurant?.currency || '₹'
  const [busyId, setBusyId] = useState(null)

  const { orders, patchOrder, refetch, loading } = useRealtimeOrders({
    restaurantId: restaurant?.id,
    pollInterval: 5000,
  })

  const deliveryOrders = useMemo(
    () => orders
      .filter((o) => o.order_type === 'delivery' && !['delivered', 'completed', 'cancelled'].includes(o.status))
      .sort((a, b) => new Date(a.order_time) - new Date(b.order_time)),
    [orders],
  )

  const preparing = deliveryOrders.filter((o) => ['pending', 'confirmed', 'preparing'].includes(o.status))
  const ready = deliveryOrders.filter((o) => o.status === 'ready')
  const onTheWay = deliveryOrders.filter((o) => o.status === 'out_for_delivery')

  const handleAdvance = async (order) => {
    const next = order.status === 'ready' ? 'out_for_delivery' : 'delivered'
    if (next === 'delivered' && !window.confirm('Order delivered to the customer?')) return
    setBusyId(order.id)
    const prev = order.status
    patchOrder(order.id, { status: next })
    const { error } = await supabase.from('orders').update({ status: next }).eq('id', order.id)
    if (error) {
      patchOrder(order.id, { status: prev })
      toast.error('Failed to update — try again')
    } else if (next === 'delivered') {
      toast.success('Delivered! 🎉')
    }
    setBusyId(null)
    refetch({ silent: true })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-navy-800 px-4 py-3 flex items-center gap-3 shadow-md">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Bike className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-none truncate">Delivery — {restaurant?.name}</p>
          <p className="text-xs text-white/50 mt-0.5">
            {ready.length} ready · {onTheWay.length} on the way
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-red-400 px-2 py-1.5 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 pb-16">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}
          </div>
        ) : deliveryOrders.length === 0 ? (
          <div className="card py-16 text-center bg-white mt-4">
            <Bike className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600">No delivery orders right now</p>
            <p className="text-xs text-gray-400 mt-1">New orders will appear here automatically.</p>
          </div>
        ) : (
          <>
            {ready.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Package className="w-4 h-4 text-indigo-500" /> Ready for pickup ({ready.length})
                </h2>
                <AnimatePresence>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {ready.map((o) => (
                      <OrderCard key={o.id} order={o} currency={currency} onAdvance={handleAdvance} busy={busyId === o.id} />
                    ))}
                  </div>
                </AnimatePresence>
              </section>
            )}

            {onTheWay.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Bike className="w-4 h-4 text-purple-500" /> On the way ({onTheWay.length})
                </h2>
                <AnimatePresence>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {onTheWay.map((o) => (
                      <OrderCard key={o.id} order={o} currency={currency} onAdvance={handleAdvance} busy={busyId === o.id} />
                    ))}
                  </div>
                </AnimatePresence>
              </section>
            )}

            {preparing.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-400">
                  <Clock className="w-4 h-4" /> Still in the kitchen ({preparing.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 opacity-70">
                  {preparing.map((o) => (
                    <OrderCard key={o.id} order={o} currency={currency} onAdvance={handleAdvance} busy={busyId === o.id} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
