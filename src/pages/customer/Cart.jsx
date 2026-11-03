import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Trash2, Minus, Plus, ShoppingBag } from 'lucide-react'
import { useCart } from '../../contexts/CartContext'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { useTableOrders } from '../../hooks/useTableOrders'
import { getDeviceTag } from '../../utils/deviceTag'
import { useRateLimit } from '../../hooks/useRateLimit'
import { invokeEdgeFunction } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'
import { getOptimizedImageUrl } from '../../utils/imageOptimizer'

// Local state so typing never touches CartContext — updates on blur only
function NoteInput({ itemId, initialNote, onSave }) {
  const [note, setNote] = useState(initialNote || '')
  return (
    <input
      type="text"
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => onSave(itemId, note)}
      placeholder="Add a note, e.g. no onions…"
      maxLength={200}
      className="w-full text-xs border border-sand-200 bg-sand-50 rounded-lg px-3 py-2 text-gray-600 placeholder-gray-300 focus:outline-none focus:border-primary-300 transition-colors"
    />
  )
}

const ORDERS_STORAGE_PREFIX = 'hungriar_orders_'
const MAX_STORED_ORDERS = 10

function rememberOrder(restaurantSlug, orderId) {
  const key = `${ORDERS_STORAGE_PREFIX}${restaurantSlug}`
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    const next = [orderId, ...existing.filter((id) => id !== orderId)].slice(0, MAX_STORED_ORDERS)
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    localStorage.setItem(key, JSON.stringify([orderId]))
  }
}

export default function Cart() {
  const { restaurantSlug } = useParams()
  const navigate = useNavigate()
  const { items, updateQuantity, removeItem, updateNotes, clearCart, subtotal, getTax } = useCart()
  const { restaurant, session, table, loading } = useRestaurant()
  const { checkCustomerLimit } = useRateLimit()
  const [placing, setPlacing] = useState(false)
  // Orders already placed by anyone at this table — used to warn about
  // ordering the same dish twice from two phones.
  const { orders: tableOrders } = useTableOrders(session)

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <div className="skeleton h-10 w-1/2 rounded-lg" />
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="skeleton h-24 w-full rounded-2xl" />
      </div>
    )
  }

  const currency = restaurant?.currency || '₹'
  const taxPercentage = Number(restaurant?.tax_percentage) || 0
  const tax = getTax(taxPercentage)
  const total = subtotal + tax
  const totalQty = items.reduce((a, i) => a + i.quantity, 0)

  // Dishes in this cart that someone at the table has already ordered.
  const orderedQty = new Map()
  for (const o of tableOrders) {
    for (const i of o.items || []) {
      if (i.menu_item_id) orderedQty.set(i.menu_item_id, (orderedQty.get(i.menu_item_id) || 0) + i.quantity)
    }
  }
  const alreadyOrdered = items
    .filter((i) => orderedQty.has(i.id))
    .map((i) => ({ name: i.name, qty: orderedQty.get(i.id) }))

  const handlePlaceOrder = async () => {
    if (items.length === 0 || placing) return

    if (!session?.token) {
      toast.error('Please rescan the QR code on your table to order.')
      return
    }

    const allowed = await checkCustomerLimit()
    if (!allowed) return

    setPlacing(true)
    try {
      const result = await invokeEdgeFunction('place-order', {
        token: session.token,
        sessionId: session.sessionId,
        deviceTag: getDeviceTag(),
        items: items.map((item) => ({ menuItemId: item.id, quantity: item.quantity, notes: item.notes || '' })),
      })

      rememberOrder(restaurantSlug, result.orderId)
      clearCart()
      if (result.status === 'awaiting_approval') {
        toast.success('Order sent! A staff member will confirm your table in a moment.', { duration: 5000 })
      } else {
        toast.success('Order placed! The kitchen has been notified.')
      }
      navigate(`/r/${restaurantSlug}/order/${result.orderId}`, { replace: true })
    } catch (err) {
      const msg = err.message || ''
      if (msg === 'session_ended' || msg.includes('session_ended') || msg.includes('bill has been settled')) {
        // Clear stale session — forces customer to rescan QR
        localStorage.removeItem(`hungriar_table_session_${restaurantSlug}`)
        toast.error('The bill for this table has been settled. Please rescan the QR code to place a new order.', { duration: 6000 })
      } else {
        toast.error(msg || 'Failed to place order. Please try again.')
      }
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="min-h-screen bg-sand-100 pb-32">
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <motion.button
            type="button"
            onClick={() => navigate(-1)}
            whileTap={{ scale: 0.88 }}
            aria-label="Back to menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Your Order</h1>
          {table && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-secondary-100 text-secondary-800">
              Table {table.number}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <ShoppingBag className="w-14 h-14 text-gray-200 mb-4" />
            <p className="font-semibold text-gray-500 text-lg">Your cart is empty</p>
            <p className="text-sm text-gray-400 mt-1">Add something delicious from the menu</p>
            <button
              type="button"
              onClick={() => navigate(`/r/${restaurantSlug}`)}
              className="btn-primary mt-6"
            >
              Browse Menu
            </button>
          </motion.div>
        ) : (
          <>
            <ul className="space-y-3">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.22 }}
                    className="bg-white rounded-2xl shadow-card overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-3">
                      {item.image_url ? (
                        <img
                          src={getOptimizedImageUrl(item.image_url, { width: 128, quality: 75 })}
                          alt={item.name}
                          className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 flex-shrink-0 flex items-center justify-center rounded-xl bg-sand-200 text-xl">
                          🍽
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatCurrency(item.price, currency)} each
                        </p>
                        <p className="text-sm font-bold text-primary-600 mt-1">
                          {formatCurrency(item.price * item.quantity, currency)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1 bg-sand-100 rounded-xl p-1">
                          <motion.button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            whileTap={{ scale: 0.82 }}
                            aria-label={`Decrease ${item.name} quantity`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-white transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </motion.button>
                          <span className="w-5 text-center text-sm font-bold text-gray-900">
                            {item.quantity}
                          </span>
                          <motion.button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            whileTap={{ scale: 0.82 }}
                            aria-label={`Increase ${item.name} quantity`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-white transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </motion.button>
                        </div>

                        <motion.button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          whileTap={{ scale: 0.82 }}
                          aria-label={`Remove ${item.name}`}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>

                    {/* Per-item note */}
                    <div className="px-3 pb-3">
                      <NoteInput
                        itemId={item.id}
                        initialNote={item.notes}
                        onSave={updateNotes}
                      />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {/* Summary card */}
            <motion.div layout className="mt-4 bg-white rounded-2xl shadow-card p-4 space-y-2.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal ({totalQty} {totalQty === 1 ? 'item' : 'items'})</span>
                <span className="text-gray-700 font-medium">{formatCurrency(subtotal, currency)}</span>
              </div>
              {taxPercentage > 0 && (
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Tax ({taxPercentage}%)</span>
                  <span>{formatCurrency(tax, currency)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2.5 border-t border-sand-200 text-base font-bold">
                <span className="text-gray-900">Total</span>
                <span className="text-primary-600">{formatCurrency(total, currency)}</span>
              </div>
            </motion.div>
          </>
        )}
      </main>

      {/* Place order fixed bar */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-sand-200 px-4 pt-4 pb-safe-4 shadow-xl">
          <div className="mx-auto max-w-2xl">
            {alreadyOrdered.length > 0 && (
              <p className="mb-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                <span className="font-semibold">Already ordered for your table:</span>{' '}
                {alreadyOrdered.map((a) => `${a.name} ×${a.qty}`).join(', ')}. Still want more? Go ahead.
              </p>
            )}
            <motion.button
              type="button"
              onClick={handlePlaceOrder}
              disabled={placing}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-between bg-primary-500 hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-3.5 rounded-xl font-semibold transition-colors shadow-sm"
            >
              <span>{placing ? 'Placing order...' : 'Place Order'}</span>
              <span className="font-bold">{formatCurrency(total, currency)}</span>
            </motion.button>
          </div>
        </div>
      )}
    </div>
  )
}
