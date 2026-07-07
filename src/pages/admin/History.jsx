import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ChevronDown, ChevronUp, History as HistoryIcon, Printer, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDateTime, formatDate } from '../../utils/formatters'

const PAYMENT_BADGE = {
  cash:  { label: 'Cash',  classes: 'bg-green-100 text-green-700' },
  upi:   { label: 'UPI',   classes: 'bg-purple-100 text-purple-700' },
  card:  { label: 'Card',  classes: 'bg-blue-100 text-blue-700' },
  other: { label: 'Other', classes: 'bg-gray-100 text-gray-600' },
}

const PAGE_SIZE = 50
const PURGE_AFTER_DAYS = 7

async function purgeOldRecords(restaurantId) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PURGE_AFTER_DAYS)
  await supabase
    .from('billing_history')
    .delete()
    .eq('restaurant_id', restaurantId)
    .lt('bill_date', cutoff.toISOString())
}

function printDailyReport(records, restaurant) {
  const todayStr = new Date().toDateString()
  const todayRecords = records.filter((r) => new Date(r.bill_date).toDateString() === todayStr)
  const currency = restaurant?.currency || '₹'
  const totalRevenue = todayRecords.reduce((sum, r) => sum + Number(r.total_amount), 0)
  const dateLabel = formatDate(new Date().toISOString())

  const rows = todayRecords.map((r) => {
    const items = (r.orders_json || []).flatMap((o) => o.items || [])
    const itemSummary = items.map((it) => `${it.quantity}× ${it.item_name}`).join(', ')
    const time = new Date(r.bill_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    const orderCount = Array.isArray(r.orders_json) ? r.orders_json.length : 0
    const pmLabel = PAYMENT_BADGE[r.payment_method]?.label || r.payment_method || '—'
    return `
      <tr>
        <td>${time}</td>
        <td><strong>${r.order_type === 'delivery' ? `Delivery${r.customer_name ? ` — ${r.customer_name}` : ''}` : r.order_type === 'takeaway' ? `Takeaway${r.customer_name ? ` — ${r.customer_name}` : ''}` : `Table ${r.tables?.table_number ?? '-'}`}</strong>${itemSummary ? `<div class="items">${itemSummary}</div>` : ''}</td>
        <td class="center">${orderCount}</td>
        <td class="center">${pmLabel}</td>
        <td class="right">${formatCurrency(r.total_amount, currency)}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${restaurant?.name ?? 'Restaurant'} — Daily Report ${dateLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; padding: 32px 40px; }
    h1 { font-size: 18px; font-weight: bold; }
    .meta { color: #666; font-size: 13px; margin: 4px 0 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; border-bottom: 2px solid #111; padding: 8px 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
    .items { color: #777; font-size: 11px; margin-top: 3px; }
    .center { text-align: center; }
    .right { text-align: right; font-weight: 600; }
    .total-row td { border-top: 2px solid #111; border-bottom: none; font-weight: bold; padding-top: 12px; }
    .empty { color: #999; text-align: center; padding: 40px 0; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #aaa; }
    @media print { body { padding: 16px 24px; } }
  </style>
</head>
<body>
  <h1>${restaurant?.name ?? 'Restaurant'} — Daily Report</h1>
  <p class="meta">${dateLabel} &nbsp;·&nbsp; ${todayRecords.length} settled bill${todayRecords.length !== 1 ? 's' : ''}</p>
  ${todayRecords.length === 0
    ? '<p class="empty">No settled bills today.</p>'
    : `<table>
        <thead>
          <tr><th>Time</th><th>Table / Items</th><th class="center">Orders</th><th class="center">Payment</th><th class="right">Total</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="4">Total Revenue</td>
            <td class="right">${formatCurrency(totalRevenue, currency)}</td>
          </tr>
        </tbody>
       </table>`
  }
  <p class="footer">Printed ${new Date().toLocaleString('en-IN')} &nbsp;·&nbsp; HungriAR</p>
</body>
</html>`

  const win = window.open('', '_blank', 'width=860,height=700')
  if (!win) { toast.error('Allow pop-ups to print the report'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

export default function History() {
  const { restaurant } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    await purgeOldRecords(restaurant.id)
    const { data, error } = await supabase
      .from('billing_history')
      .select('*, tables(table_number)')
      .eq('restaurant_id', restaurant.id)
      .order('bill_date', { ascending: false })
      .limit(PAGE_SIZE)
    if (!error) setRecords(data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => { load() }, [load])

  const handleClearAll = async () => {
    setClearing(true)
    const { error } = await supabase
      .from('billing_history')
      .delete()
      .eq('restaurant_id', restaurant.id)
    if (error) {
      toast.error('Failed to clear history')
    } else {
      setRecords([])
      toast.success('History cleared')
    }
    setConfirmClear(false)
    setClearing(false)
  }

  const filtered = records.filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      r.tables?.table_number?.toLowerCase().includes(q) ||
      formatDateTime(r.bill_date).toLowerCase().includes(q) ||
      String(r.total_amount).includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-sm">
          Settled bills. Records older than 7 days are cleared automatically each time you open this page.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => printDailyReport(records, restaurant)}
            className="btn-outline gap-1.5 text-sm"
          >
            <Printer className="w-4 h-4" />
            Print Today
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="btn-outline gap-1.5 text-sm text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
      </div>

      {/* Confirm clear */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-red-700 font-medium">
              Permanently delete all billing history for this restaurant?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="btn-outline text-sm px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing}
                className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {clearing ? 'Clearing…' : 'Yes, delete all'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          className="input pl-10"
          placeholder="Search by table, date or amount…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-14 text-center bg-gray-50">
          <HistoryIcon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">
            {search ? 'No matching records.' : 'No settled bills yet.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="table-base">
            <thead>
              <tr>
                <th>Date</th>
                <th>Table</th>
                <th>Orders</th>
                <th>Payment</th>
                <th className="text-right">Total</th>
                <th className="text-right w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const isExpanded = expanded === record.id
                const orderCount = Array.isArray(record.orders_json) ? record.orders_json.length : 0
                return (
                  <>
                    <tr
                      key={record.id}
                      className="cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : record.id)}
                    >
                      <td className="text-gray-700 text-xs">{formatDateTime(record.bill_date)}</td>
                      <td className="font-medium text-gray-800">
                        {record.order_type === 'delivery' || record.order_type === 'takeaway'
                          ? `${record.order_type === 'delivery' ? 'Delivery' : 'Takeaway'}${record.customer_name ? ` — ${record.customer_name}` : ''}`
                          : `Table ${record.tables?.table_number ?? '-'}`}
                      </td>
                      <td className="text-gray-500">{orderCount}</td>
                      <td>
                        {record.payment_method
                          ? <span className={`badge text-[10px] ${PAYMENT_BADGE[record.payment_method]?.classes || 'bg-gray-100 text-gray-600'}`}>
                              {PAYMENT_BADGE[record.payment_method]?.label || record.payment_method}
                            </span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="text-right font-bold text-gray-900">{formatCurrency(record.total_amount, restaurant?.currency)}</td>
                      <td className="text-right">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 inline" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 inline" />}
                      </td>
                    </tr>
                    <AnimatePresence>
                      {isExpanded && Array.isArray(record.orders_json) && record.orders_json.length > 0 && (
                        <tr key={`${record.id}-detail`}>
                          <td colSpan={6} className="p-0 border-b border-gray-100">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="bg-gray-50 px-6 py-3 space-y-2">
                                {record.orders_json.map((order, i) => {
                                  if (!order || typeof order !== 'object') return null
                                  return (
                                    <div key={i} className="text-xs text-gray-500">
                                      <span className="font-medium text-gray-700">
                                        {formatCurrency(order.total_amount, restaurant?.currency)}
                                      </span>
                                      {order.items && order.items.length > 0 && (
                                        <span className="ml-2">
                                          — {order.items.map((it) => `${it.quantity}× ${it.item_name}`).join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </>
                )
              })}
            </tbody>
          </table>
          {records.length === PAGE_SIZE && (
            <p className="text-center text-xs text-gray-400 py-3 border-t border-gray-100">
              Showing latest {PAGE_SIZE} records.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
