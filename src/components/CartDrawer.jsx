import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBag, Minus, Plus, Trash2, ArrowRight } from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useRestaurant } from '../contexts/RestaurantContext'
import { formatCurrency } from '../utils/formatters'
import { getOptimizedImageUrl } from '../utils/imageOptimizer'

const DRAWER_VARIANTS = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 380, damping: 38, mass: 0.8 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } },
}

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, x: -16, height: 0, marginBottom: 0, transition: { duration: 0.18 } },
}

/**
 * Slide-over cart drawer — springs in from the right with backdrop blur.
 */
export default function CartDrawer({ isOpen, onClose }) {
  const { items, updateQuantity, removeItem, subtotal, getTax } = useCart()
  const { restaurant, session } = useRestaurant()

  const currency = restaurant?.currency || '₹'
  const taxPercentage = Number(restaurant?.tax_percentage) || 0
  const tax = getTax(taxPercentage)
  const total = subtotal + tax
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Cart">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            variants={DRAWER_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary-500" />
                <h2 className="text-base font-bold text-gray-900 font-display">Your Order</h2>
                {itemCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
                    {itemCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close cart"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                    <ShoppingBag className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="font-semibold text-gray-600">Your cart is empty</p>
                  <p className="mt-1 text-sm text-gray-400">Add items from the menu to get started.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <motion.li
                        key={item.id}
                        variants={ITEM_VARIANTS}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3"
                      >
                        {item.image_url ? (
                          <img
                            src={getOptimizedImageUrl(item.image_url, { width: 112, quality: 75 })}
                            alt={item.name}
                            className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-sand-200 flex items-center justify-center">
                            <ShoppingBag className="w-5 h-5 text-sand-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                          <p className="text-xs text-primary-600 font-medium mt-0.5">
                            {formatCurrency(item.price, currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                              aria-label={`Decrease ${item.name} quantity`}
                            >
                              {item.quantity === 1 ? <Trash2 className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4" />}
                            </button>
                            <span className="w-5 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                              aria-label={`Increase ${item.name} quantity`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {/* Summary + CTA */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 px-4 pt-3 pb-4 space-y-3 bg-white">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span className="text-gray-700 font-medium">{formatCurrency(subtotal, currency)}</span>
                  </div>
                  {taxPercentage > 0 && (
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Tax ({taxPercentage}%)</span>
                      <span>{formatCurrency(tax, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-100 text-sm font-bold text-gray-900">
                    <span>Total</span>
                    <span className="text-primary-600">{formatCurrency(total, currency)}</span>
                  </div>
                </div>
                <Link
                  to={`/r/${session?.restaurantSlug}/cart`}
                  onClick={onClose}
                  className="btn-primary flex w-full items-center justify-between px-5 py-3.5 rounded-xl text-sm"
                >
                  <span>View Cart & Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
