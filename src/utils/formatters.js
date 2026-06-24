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
}

export const ORDER_STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800',
  preparing: 'bg-blue-100 text-blue-800',
  served: 'bg-secondary-100 text-secondary-800',
  completed: 'bg-gray-100 text-gray-600',
}

export const ORDER_STATUS_FLOW = ['pending', 'preparing', 'served', 'completed']

export function nextOrderStatus(status) {
  const idx = ORDER_STATUS_FLOW.indexOf(status)
  if (idx === -1 || idx === ORDER_STATUS_FLOW.length - 1) return null
  return ORDER_STATUS_FLOW[idx + 1]
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
