import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Scan, Minus, Plus, ShoppingCart } from 'lucide-react'
import { useRestaurant } from '../../contexts/RestaurantContext'
import { useCart } from '../../contexts/CartContext'
import ARViewer from '../../components/ARViewer'
import { formatCurrency } from '../../utils/formatters'
import { getOptimizedImageUrl } from '../../utils/imageOptimizer'

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
      <div className="min-h-screen bg-sand-100">
        <div className="skeleton h-72 w-full" />
        <div className="mx-auto max-w-2xl px-4 py-5">
          <div className="skeleton h-8 w-3/4 rounded-xl mb-3" />
          <div className="skeleton h-24 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  const item = getMenuItemById(itemId)

  if (!item || !item.available) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-sand-100 p-6 text-center">
        <p className="text-5xl mb-4">🍽</p>
        <p className="text-lg font-semibold text-gray-800">This item isn't available right now.</p>
        <button
          type="button"
          onClick={() => navigate(`/r/${restaurantSlug}`)}
          className="btn-primary mt-4"
        >
          Back to Menu
        </button>
      </div>
    )
  }

  const handleAdd = () => {
    addItem(item, quantity)
    toast.success(`${quantity} × ${item.name} added!`, { duration: 1800 })
    navigate(`/r/${restaurantSlug}`)
  }

  return (
    <div className="min-h-screen bg-sand-100 pb-28">
      {/* Hero image */}
      <div className="relative h-72 w-full overflow-hidden bg-sand-200 sm:h-96">
        {item.image_url ? (
          <motion.img
            src={getOptimizedImageUrl(item.image_url, { width: 800, quality: 80 })}
            alt={item.name}
            className="w-full h-full object-cover"
            initial={{ scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-7xl">🍽</div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

        {/* Back button */}
        <motion.button
          type="button"
          onClick={() => navigate(`/r/${restaurantSlug}`)}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          whileTap={{ scale: 0.88 }}
          aria-label="Back to menu"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-md text-gray-700 hover:bg-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </motion.button>

        {/* AR badge */}
        {item.ar_model_url && (
          <motion.button
            type="button"
            onClick={() => setShowAR(true)}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            whileTap={{ scale: 0.88 }}
            className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-secondary-500 px-3 py-2 text-xs font-bold text-white shadow-md"
          >
            <Scan className="w-3.5 h-3.5" />
            View in AR
          </motion.button>
        )}

        {/* Price overlay on image */}
        <div className="absolute bottom-4 right-4">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/95 backdrop-blur-sm text-primary-700 font-bold text-lg px-3 py-1.5 rounded-xl shadow-md"
          >
            {formatCurrency(item.price, restaurant?.currency)}
          </motion.span>
        </div>
      </div>

      {/* Info panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.3 }}
        className="mx-auto max-w-2xl px-4 py-5"
      >
        <div className="bg-white rounded-2xl p-5 shadow-card">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{item.name}</h1>

          {item.description && (
            <p className="mt-3 text-gray-500 leading-relaxed text-sm">{item.description}</p>
          )}

          <div className="mt-4 pt-4 border-t border-sand-200 flex flex-wrap gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 font-medium">
              Fresh ingredients
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-secondary-50 text-secondary-700 font-medium">
              Chef's choice
            </span>
          </div>
        </div>
      </motion.div>

      {/* Fixed bottom bar */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.28 }}
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-sand-200 shadow-xl p-4"
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {/* Quantity selector */}
          <div className="flex items-center gap-1 bg-sand-100 rounded-xl p-1">
            <motion.button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              whileTap={{ scale: 0.85 }}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-white disabled:opacity-40 transition-all"
            >
              <Minus className="w-4 h-4" />
            </motion.button>
            <span className="w-8 text-center text-base font-bold text-gray-900">{quantity}</span>
            <motion.button
              type="button"
              onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
              whileTap={{ scale: 0.85 }}
              disabled={quantity >= MAX_QUANTITY}
              aria-label="Increase quantity"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-white disabled:opacity-40 transition-all"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
          </div>

          <motion.button
            type="button"
            onClick={handleAdd}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="flex-1 flex items-center justify-between bg-primary-500 hover:bg-primary-600 text-white px-5 py-3 rounded-xl font-semibold transition-colors shadow-sm"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Add to Cart
            </span>
            <span className="font-bold">
              {formatCurrency(item.price * quantity, restaurant?.currency)}
            </span>
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showAR && (
          <ARViewer
            src={item.ar_model_url}
            alt={item.name}
            poster={item.image_url || undefined}
            onClose={() => setShowAR(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
