export function formatCurrency(amount, currency = '₹') {
  const value = Number(amount) || 0
  return `${currency}${value.toFixed(2)}`
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  preparing: 'Preparing',
  served: 'Served',
  completed: 'Completed',
  cancelled: 'Cancelled',
  // Online (delivery/takeaway) order lifecycle
  confirmed: 'Confirmed',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
}

export const ORDER_STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  preparing: 'bg-blue-100 text-blue-800',
  served: 'bg-secondary-100 text-secondary-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  // Online (delivery/takeaway) order lifecycle
  confirmed: 'bg-teal-100 text-teal-800',
  ready: 'bg-indigo-100 text-indigo-800',
  out_for_delivery: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-700',
}

export const ORDER_STATUS_FLOW = ['pending', 'preparing', 'served', 'completed']

// Simplified flow: any active order goes directly to completed in one tap.
export function nextOrderStatus(status) {
  if (status === 'completed') return null
  return 'completed'
}

export function truncate(text, maxLength = 100) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}...`
}

export const SUBSCRIPTION_STATUS_LABELS = {
  trial: 'Trial',
  active: 'Active',
  expired: 'Expired',
  inactive: 'Inactive',
}

export const SUBSCRIPTION_STATUS_COLORS = {
  trial: 'bg-amber-100 text-amber-800',
  active: 'bg-secondary-100 text-secondary-800',
  expired: 'bg-red-100 text-red-800',
  inactive: 'bg-gray-200 text-gray-600',
}

export function daysBetween(from, to) {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const diffMs = toDate.getTime() - fromDate.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}
