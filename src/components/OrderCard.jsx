import { motion } from 'framer-motion'
import { Clock, ChefHat, Utensils, CheckCircle2, CheckCheck, XCircle, X, Printer, Plus, Minus, Trash2, Bike, ShoppingBag, Phone, MapPin, Loader2 } from 'lucide-react'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  formatCurrency,
  formatTime,
} from '../utils/formatters'
import { printKOT } from '../utils/kotPrint'

const STATUS_ICONS = {
  pending: Clock,
  preparing: ChefHat,
  served: Utensils,
  completed: CheckCircle2,
  cancelled: XCircle,
  // Online (delivery/takeaway) lifecycle
  confirmed: CheckCheck,
  ready: Utensils,
  out_for_delivery: Bike,
  delivered: CheckCircle2,
}

const STATUS_BG = {
  pending: 'from-amber-400 to-amber-500',
  preparing: 'from-primary-400 to-primary-600',
  served: 'from-secondary-400 to-secondary-600',
  completed: 'from-green-400 to-green-500',
  cancelled: 'from-gray-300 to-gray-400',
  // Online (delivery/takeaway) lifecycle
  confirmed: 'from-teal-400 to-teal-500',
  ready: 'from-indigo-400 to-indigo-600',
  out_for_delivery: 'from-purple-400 to-purple-600',
  delivered: 'from-green-400 to-green-500',
}

// Next step in the online (delivery/takeaway) status chain shown on the
// primary action button. Dine-in orders keep the one-tap Complete flow.
function nextOnlineAction(order) {
  switch (order.status) {
    case 'pending':          return { status: 'confirmed', label: 'Accept Order' }
    case 'confirmed':        return { status: 'preparing', label: 'Start Preparing' }
    case 'preparing':        return { status: 'ready', label: 'Mark Ready' }
    case 'ready':
      return order.order_type === 'delivery'
        ? { status: 'out_for_delivery', label: 'Out for Delivery' }
        : { status: 'delivered', label: 'Picked Up' }
    case 'out_for_delivery': return { status: 'delivered', label: 'Mark Delivered' }
    default:                 return null
  }
}

export default function OrderCard({ order, onStatusChange, onQuantityChange, onCancelItem, onCancelOrder, busyItemId, currency = '₹', restaurantName = '' }) {
  const items = order.order_items || []
  const StatusIcon = STATUS_ICONS[order.status] || Clock
  const gradient = STATUS_BG[order.status] || 'from-gray-300 to-gray-400'
  const isCompleted = order.status === 'completed'
  const isCancelled = order.status === 'cancelled'
  const isOnline = order.order_type === 'delivery' || order.order_type === 'takeaway'
  const isDelivered = order.status === 'delivered'
  const OnlineIcon = order.order_type === 'delivery' ? Bike : ShoppingBag
  const onlineAction = isOnline ? nextOnlineAction(order) : null
  const addr = order.delivery_address

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="card overflow-hidden p-0"
    >
      {/* Coloured header strip */}
      <div className={`bg-gradient-to-r ${gradient} px-4 py-3 flex items-center gap-3`}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <StatusIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-none flex items-center gap-1.5">
            {isOnline ? (
              <>
                <OnlineIcon className="w-3.5 h-3.5 flex-shrink-0" />
                {order.order_type === 'delivery' ? 'Delivery' : 'Takeaway'}
              </>
            ) : (
              <>Table {order.tables?.table_number ?? '-'}</>
            )}
          </p>
          <p className="text-xs text-white/70 mt-0.5">{formatTime(order.order_time)}</p>
        </div>
        <span className={`badge ${ORDER_STATUS_COLORS[order.status] || 'bg-white/20 text-white'} text-xs`}>
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </span>
        <button
          type="button"
          onClick={() => printKOT(order, restaurantName)}
          data-tip="Print KOT"
          aria-label="Print KOT"
          className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/35 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <Printer className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Items list */}
      <div className="px-4 py-3">
        <ul className="space-y-1.5">
          {isCancelled ? (
            // Cancelled order: show all items cleanly so the history is readable
            items.map((item) => (
              <li key={item.id} className="text-sm flex items-center justify-between gap-3">
                <span className="text-gray-500 min-w-0 flex-1">
                  <span className="font-medium text-gray-600">{item.quantity}×</span>{' '}
                  {item.item_name}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatCurrency(item.quantity * item.unit_price, currency)}
                </span>
              </li>
            ))
          ) : (
            // Active order: only show non-cancelled items
            <>
              {items.filter((i) => !i.cancelled).map((item) => (
                <li key={item.id} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 text-gray-600">
                      {!(onQuantityChange && !isCompleted && !isOnline) && (
                        <><span className="font-medium text-gray-800">{item.quantity}×</span>{' '}</>
                      )}
                      {item.item_name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {onQuantityChange && !isCompleted && !isOnline ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => item.quantity === 1
                              ? onCancelItem?.(order.id, item.id, item.item_name)
                              : onQuantityChange(order, item, item.quantity - 1)}
                            disabled={busyItemId === item.id}
                            data-tip={item.quantity === 1 ? 'Remove item' : 'Reduce quantity'}
                            aria-label={item.quantity === 1 ? `Remove ${item.item_name}` : `Reduce ${item.item_name} quantity`}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                          >
                            {item.quantity === 1 ? <Trash2 className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4" />}
                          </button>
                          <span className="w-6 text-center font-bold text-gray-800 text-sm">
                            {busyItemId === item.id
                              ? <Loader2 className="w-4 h-4 mx-auto animate-spin text-primary-500" />
                              : item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onQuantityChange(order, item, item.quantity + 1)}
                            disabled={busyItemId === item.id}
                            data-tip="Add one more"
                            aria-label={`Increase ${item.item_name} quantity`}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        onCancelItem && !isCompleted && !isOnline && (
                          <button
                            type="button"
                            onClick={() => onCancelItem(order.id, item.id, item.item_name)}
                            data-tip="Remove item"
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label={`Cancel ${item.item_name}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )
                      )}
                      <span className="font-semibold text-gray-900 text-sm">
                        {formatCurrency(item.quantity * item.unit_price, currency)}
                      </span>
                    </div>
                  </div>
                  {item.notes && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1 italic">
                      {item.notes}
                    </p>
                  )}
                </li>
              ))}
              {/* Small note if any items were cancelled from this order */}
              {items.some((i) => i.cancelled) && (
                <li className="text-xs text-red-500 pt-1 border-t border-dashed border-gray-100">
                  {items.filter((i) => i.cancelled).map((i) => i.item_name).join(', ')} — removed
                </li>
              )}
            </>
          )}
        </ul>

        {/* Customer details for delivery/takeaway orders */}
        {isOnline && (order.customer_name || order.customer_phone || addr || order.notes) && (
          <div className="mt-3 pt-3 border-t border-dashed border-gray-100 space-y-1.5">
            {(order.customer_name || order.customer_phone) && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-700 truncate">
                  {order.customer_name || 'Customer'}
                </span>
                {order.customer_phone && (
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="flex items-center gap-1 text-primary-600 font-semibold flex-shrink-0 hover:text-primary-700"
                  >
                    <Phone className="w-3 h-3" /> {order.customer_phone}
                  </a>
                )}
              </div>
            )}
            {order.order_type === 'delivery' && addr && (
              <p className="flex items-start gap-1 text-xs text-gray-500">
                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                {[addr.line1, addr.line2, addr.landmark, addr.city, addr.pincode].filter(Boolean).join(', ')}
              </p>
            )}
            {order.notes && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 italic">
                {order.notes}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-500">Total</span>
          <span className={`text-base font-bold ${isCancelled ? 'text-gray-300 line-through' : 'text-gray-900'}`}>
            {formatCurrency(order.total_amount, currency)}
          </span>
        </div>
      </div>

      {/* Action area */}
      {onStatusChange && (
        <div className="px-4 pb-4">
          {isCompleted ? (
            <div className="flex items-center gap-2 text-xs text-green-600 justify-center py-2 bg-green-50 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Order completed
            </div>
          ) : isCancelled ? (
            <div className="flex items-center gap-2 text-xs text-red-500 justify-center py-2 bg-red-50 rounded-xl">
              <XCircle className="w-3.5 h-3.5" />
              Order cancelled
            </div>
          ) : isOnline && isDelivered ? (
            <div className="flex items-center gap-2 text-xs text-green-600 justify-center py-2 bg-green-50 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Delivered — settle it from Billing
            </div>
          ) : (
            <>
              <motion.button
                type="button"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onStatusChange(order.id, isOnline && onlineAction ? onlineAction.status : 'completed')}
                className="w-full flex items-center justify-center gap-2 btn-primary py-2.5 text-sm bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 shadow-green-900/20"
              >
                <CheckCheck className="w-4 h-4" />
                {isOnline && onlineAction ? onlineAction.label : 'Complete Order'}
              </motion.button>

              {onCancelOrder && (
                <button
                  type="button"
                  onClick={() => onCancelOrder(order.id)}
                  className="mt-2 w-full min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50/60 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel entire order
                </button>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}
