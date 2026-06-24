import { Link } from 'react-router-dom'
import { useCart } from '../contexts/CartContext'
import { useRestaurant } from '../contexts/RestaurantContext'
import { formatCurrency } from '../utils/formatters'

/**
 * Slide-over cart summary. Shown from the Menu page header; lets the
 * customer adjust quantities before heading to the full Cart/checkout page.
 */
export default function CartDrawer({ isOpen, onClose }) {
  const { items, updateQuantity, removeItem, subtotal, getTax } = useCart()
  const { restaurant, session } = useRestaurant()

  if (!isOpen) return null

  const currency = restaurant?.currency || '₹'
  const taxPercentage = Number(restaurant?.tax_percentage) || 0
  const tax = getTax(taxPercentage)
  const total = subtotal + tax

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Cart">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">Your Order</h2>
          <button type="button" onClick={onClose} aria-label="Close cart" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
              <p>Your cart is empty.</p>
              <p className="mt-1 text-sm">Add items from the menu to get started.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-14 w-14 flex-shrink-0 rounded-lg bg-sand-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(item.price, currency)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      -
                    </button>
                    <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name} from cart`}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-1 border-t px-4 py-3">
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
            <div className="flex justify-between pt-1 text-base font-semibold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
            <Link to={`/r/${session?.restaurantSlug}/cart`} onClick={onClose} className="btn-primary mt-2 block w-full text-center">
              View Cart
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
