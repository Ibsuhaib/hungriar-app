import { ORDER_STATUS_COLORS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, formatCurrency, formatTime } from '../utils/formatters'

/**
 * Displays a single order with its items and status. When `onStatusChange`
 * is provided (admin Orders page), a status dropdown is shown so staff can
 * move the order through pending -> preparing -> served -> completed.
 */
export default function OrderCard({ order, onStatusChange, currency = '₹' }) {
  const items = order.order_items || []

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">Table {order.tables?.table_number ?? '-'}</p>
          <p className="text-xs text-gray-500">{formatTime(order.order_time)}</p>
        </div>
        <span className={`badge ${ORDER_STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between py-1.5 text-sm">
            <span className="text-gray-700">
              {item.quantity} &times; {item.item_name}
            </span>
            <span className="font-medium text-gray-900">{formatCurrency(item.quantity * item.unit_price, currency)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t pt-2">
        <span className="font-semibold text-gray-900">Total</span>
        <span className="font-semibold text-gray-900">{formatCurrency(order.total_amount, currency)}</span>
      </div>

      {onStatusChange && (
        <div>
          <label className="label" htmlFor={`status-${order.id}`}>
            Update status
          </label>
          <select
            id={`status-${order.id}`}
            className="input"
            value={order.status}
            onChange={(event) => onStatusChange(order.id, event.target.value)}
          >
            {ORDER_STATUS_FLOW.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
