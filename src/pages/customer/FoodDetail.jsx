import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { useCart } from '../../contexts/CartContext'
import ARViewer from '../../components/ARViewer'
import { formatCurrency } from '../../utils/formatters'

const MAX_QUANTITY = 50

export default function FoodDetail() {
  const { restaurantSlug, itemId } = useParams()
  const navigate = useNavigate()
  const { restaurant, getMenuItemById, loading } = useRestaurant()
  const { addItem } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [showAR, setShowAR] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand-100 p-4">
        <div className="skeleton h-80 w-full max-w-2xl rounded-2xl" />
      </div>
    )
  }

  const item = getMenuItemById(itemId)

  if (!item || !item.available) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sand-100 p-6 text-center">
        <p className="text-lg font-semibold text-gray-800">This item isn't available right now.</p>
        <button type="button" onClick={() => navigate(`/r/${restaurantSlug}`)} className="btn-primary mt-4">
          Back to Menu
        </button>
      </div>
    )
  }

  const handleAdd = () => {
    addItem(item, quantity)
    toast.success(`${quantity} x ${item.name} added to cart`)
    navigate(`/r/${restaurantSlug}`)
  }

  return (
    <div className="min-h-screen bg-sand-100 pb-28">
      <div className="relative">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-64 w-full object-cover sm:h-80" />
        ) : (
          <div className="flex h-64 w-full items-center justify-center bg-sand-200 text-6xl sm:h-80">🍽</div>
        )}
        <button
          type="button"
          onClick={() => navigate(`/r/${restaurantSlug}`)}
          aria-label="Back to menu"
          className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg shadow hover:bg-white"
        >
          ←
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
          <p className="whitespace-nowrap text-xl font-bold text-primary-700">{formatCurrency(item.price, restaurant?.currency)}</p>
        </div>

        {item.description && <p className="mt-2 leading-relaxed text-gray-600">{item.description}</p>}

        {item.ar_model_url && (
          <button type="button" onClick={() => setShowAR(true)} className="btn-outline mt-4 w-full">
            View in AR / 3D
          </button>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4 shadow-lg">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-lg text-gray-700 hover:bg-gray-50"
            >
              -
            </button>
            <span className="w-8 text-center text-lg font-semibold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
              aria-label="Increase quantity"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-lg text-gray-700 hover:bg-gray-50"
            >
              +
            </button>
          </div>
          <button type="button" onClick={handleAdd} className="btn-primary flex-1">
            Add to Cart &middot; {formatCurrency(item.price * quantity, restaurant?.currency)}
          </button>
        </div>
      </div>

      {showAR && (
        <ARViewer src={item.ar_model_url} alt={item.name} poster={item.image_url || undefined} onClose={() => setShowAR(false)} />
      )}
    </div>
  )
}
