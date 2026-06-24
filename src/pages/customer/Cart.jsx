import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useCart } from '../../contexts/CartContext'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { invokeEdgeFunction } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'

const ORDERS_STORAGE_PREFIX = 'goana_orders_'
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
  const { items, updateQuantity, removeItem, clearCart, subtotal, getTax } = useCart()
  const { restaurant, session, table, loading } = useRestaurant()
  const { checkCustomerLimit } = useRateLimit()
  const [placing, setPlacing] = useState(false)

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

  const handlePlaceOrder = async () => {
    if (items.length === 0 || placing) return

    if (!session?.token) {
      toast.error('Your table session has expired. Please rescan the QR code on your table.')
      return
    }

    const allowed = await checkCustomerLimit()
    if (!allowed) return

    setPlacing(true)
    try {
      const result = await invokeEdgeFunction('place-order', {
        token: session.token,
        items: items.map((item) => ({ menuItemId: item.id, quantity: item.quantity })),
      })

      rememberOrder(restaurantSlug, result.orderId)
      clearCart()
      toast.success('Order placed! The kitchen has been notified.')
      navigate(`/r/${restaurantSlug}/order/${result.orderId}`)
    } catch (err) {
      toast.error(err.message || 'Failed to place order. Please try again.')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="min-h-screen bg-sand-100 pb-32">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(`/r/${restaurantSlug}`)}
          aria-label="Back to menu"
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-100"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">Your Order</h1>
        {table && <span className="badge ml-auto bg-secondary-100 text-secondary-800">Table {table.number}</span>}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
            <p className="text-4xl">🛒</p>
            <p className="mt-3">Your cart is empty.</p>
            <button type="button" onClick={() => navigate(`/r/${restaurantSlug}`)} className="btn-primary mt-4">
              Browse Menu
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="card flex items-center gap-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-sand-200 text-xl">🍽</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">{formatCurrency(item.price, currency)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      aria-label={`Decrease ${item.name} quantity`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-medium">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      aria-label={`Increase ${item.name} quantity`}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="card mt-4 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {taxPercentage > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Tax ({taxPercentage}%)</span>
                  <span>{formatCurrency(tax, currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </div>
          </>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg">
          <div className="mx-auto max-w-2xl">
            <button type="button" onClick={handlePlaceOrder} disabled={placing} className="btn-primary w-full">
              {placing ? 'Placing order...' : `Place Order · ${formatCurrency(total, currency)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
