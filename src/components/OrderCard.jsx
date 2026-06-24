import { motion } from 'framer-motion'
import { Clock, ChefHat, Utensils, CheckCircle2, CheckCheck } from 'lucide-react'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  formatCurrency,
  formatTime,
} from '../utils/formatters'

const STATUS_ICONS = {
  pending: Clock,
  preparing: ChefHat,
  served: Utensils,
  completed: CheckCircle2,
}

const STATUS_BG = {
  pending: 'from-amber-400 to-amber-500',
  preparing: 'from-primary-400 to-primary-600',
  served: 'from-secondary-400 to-secondary-600',
  completed: 'from-green-400 to-green-500',
}

export default function OrderCard({ order, onStatusChange, currency = '₹' }) {
  const items = order.order_items || []
  const StatusIcon = STATUS_ICONS[order.status] || Clock
  const gradient = STATUS_BG[order.status] || 'from-gray-300 to-gray-400'
  const isCompleted = order.status === 'completed'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden p-0"
    >
      {/* Coloured header strip */}
      <div className={`bg-gradient-to-r ${gradient} px-4 py-3 flex items-center gap-3`}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <StatusIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-none">
            Table {order.tables?.table_number ?? '-'}
          </p>
          <p className="text-xs text-white/70 mt-0.5">{formatTime(order.order_time)}</p>
        </div>
        <span className={`badge ${ORDER_STATUS_COLORS[order.status] || 'bg-white/20 text-white'} text-[10px]`}>
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      {/* Items list */}
      <div className="px-4 py-3">
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-600 min-w-0 truncate">
                  <span className="font-medium text-gray-800">{item.quantity}×</span> {item.item_name}
                </span>
                <span className="font-semibold text-gray-900 flex-shrink-0 text-xs">
                  {formatCurrency(item.quantity * item.unit_price, currency)}
                </span>
              </div>
              {item.notes && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1 italic">
                  {item.notes}
                </p>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-500">Total</span>
          <span className="text-base font-bold text-gray-900">{formatCurrency(order.total_amount, currency)}</span>
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
          ) : (
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onStatusChange(order.id, 'completed')}
              className="w-full flex items-center justify-center gap-2 btn-primary py-2.5 text-sm bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 shadow-green-900/20"
            >
              <CheckCheck className="w-4 h-4" />
              Complete Order
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  )
}
