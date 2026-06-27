import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, CheckCircle2, Printer, AlertCircle, TriangleAlert, Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../utils/formatters'

const PAYMENT_METHODS = [
  { id: 'cash',  label: 'Cash',  icon: Banknote,   active: 'border-green-500 bg-green-50 text-green-700' },
  { id: 'upi',   label: 'UPI',   icon: Smartphone, active: 'border-purple-500 bg-purple-50 text-purple-700' },
  { id: 'card',  label: 'Card',  icon: CreditCard, active: 'border-blue-500 bg-blue-50 text-blue-700' },
  { id: 'other', label: 'Other', icon: Wallet,     active: 'border-gray-400 bg-gray-50 text-gray-700' },
]

export const PAYMENT_BADGE = {
  cash:  { label: 'Cash',  classes: 'bg-green-100 text-green-700' },
  upi:   { label: 'UPI',   classes: 'bg-purple-100 text-purple-700' },
  card:  { label: 'Card',  classes: 'bg-blue-100 text-blue-700' },
  other: { label: 'Other', classes: 'bg-gray-100 text-gray-600' },
}

const PM_LABELS = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' }

function printReceipt({ tableOrders, table, total, taxPercentage, paymentMethod, restaurant }) {
  const cur = restaurant?.currency || '₹'
  const fmt = (v) => `${cur}${Number(v).toFixed(2)}`
  const name = restaurant?.name || 'Restaurant'
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const pm = PM_LABELS[paymentMethod] || paymentMethod || '—'

  const subtotal = taxPercentage > 0 ? total / (1 + taxPercentage / 100) : total
  const taxAmt = total - subtotal

  const orderRows = tableOrders.map((order, idx) => {
    const activeItems = (order.order_items || []).filter((i) => !i.cancelled)
    if (activeItems.length === 0) return ''
    const oTime = new Date(order.order_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    const itemRows = activeItems.map((item) => `
      <tr>
        <td>${item.quantity}&times; ${item.item_name}</td>
        <td class="r">${fmt(item.quantity * item.unit_price)}</td>
      </tr>`).join('')
    return `
      ${idx > 0 ? '<tr><td colspan="2"><div class="dash"></div></td></tr>' : ''}
      <tr class="order-hdr"><td colspan="2">Order ${idx + 1} &bull; ${oTime}</td></tr>
      ${itemRows}`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Bill &mdash; Table ${table.table_number}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11.5px; color: #000; width: 72mm; }
    .c  { text-align: center; }
    .r  { text-align: right; }
    .b  { font-weight: bold; }
    .sm { font-size: 10px; color: #444; }
    .dash { border-top: 1px dashed #000; margin: 5px 0; }
    .solid { border-top: 1px solid #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    td:last-child { white-space: nowrap; padding-left: 6px; }
    .order-hdr td { font-size: 10px; color: #555; padding-top: 5px; }
    .total-row td { font-size: 13px; font-weight: bold; padding-top: 3px; }
    .sub-row td { font-size: 10px; color: #444; }
  </style>
</head>
<body>
  <div class="c b" style="font-size:15px">${name}</div>
  <div class="c sm" style="margin-top:2px">Powered by HungriAR</div>

  <div class="dash" style="margin-top:7px"></div>

  <div style="display:flex;justify-content:space-between">
    <span>Table: <strong>${table.table_number}</strong></span>
    <span>${dateStr}</span>
  </div>
  <div class="sm">${timeStr}</div>

  <div class="dash"></div>

  <table>${orderRows}</table>

  <div class="solid"></div>

  <table>
    ${taxPercentage > 0 ? `
    <tr class="sub-row"><td>Subtotal</td><td class="r">${fmt(subtotal)}</td></tr>
    <tr class="sub-row"><td>Tax (${taxPercentage}%)</td><td class="r">${fmt(taxAmt)}</td></tr>
    <tr><td colspan="2"><div class="dash" style="margin:3px 0"></div></td></tr>
    ` : ''}
    <tr class="total-row"><td>TOTAL</td><td class="r">${fmt(total)}</td></tr>
  </table>

  <div class="dash"></div>

  <div>Payment: <strong>${pm}</strong></div>

  <div class="solid" style="margin-top:10px"></div>
  <div class="c sm" style="margin-top:6px">Thank you for dining with us!</div>
  <div class="c sm">Please visit again &hearts;</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=340,height=600')
  if (!win) { toast.error('Allow pop-ups to print the bill'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

function ConfirmDialog({ table, activeCount, onConfirm, onCancel, loading }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ pointerEvents: 'none' }}
      >
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" style={{ pointerEvents: 'auto' }}>
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl mb-4 ${activeCount > 0 ? 'bg-amber-50' : 'bg-secondary-50'}`}>
            {activeCount > 0
              ? <TriangleAlert className="w-5 h-5 text-amber-500" />
              : <CheckCircle2 className="w-5 h-5 text-secondary-500" />
            }
          </div>
          <h3 className="text-base font-bold text-gray-900 font-display">
            Settle bill for Table {table.table_number}?
          </h3>
          {activeCount > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                <span className="font-semibold">{activeCount} order{activeCount !== 1 ? 's' : ''} still in the kitchen.</span>{' '}
                Only completed orders will be settled. Active orders remain open.
              </p>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">
            Completed orders will be archived to History. This cannot be undone.
          </p>
          <div className="flex gap-3 mt-5">
            <button type="button" onClick={onCancel} className="btn-outline flex-1">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={loading} className="btn-secondary flex-1">
              {loading ? 'Settling…' : 'Settle Bill'}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function Billing() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [taxPercentage, setTaxPercentage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [settlingTableId, setSettlingTableId] = useState(null)
  const [confirmTable, setConfirmTable] = useState(null)
  const [activeOrdersCount, setActiveOrdersCount] = useState(0)
  const [selectedPayments, setSelectedPayments] = useState({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [tablesRes, ordersRes, restaurantRes] = await Promise.all([
      supabase.from('tables').select('*').eq('restaurant_id', restaurant.id).order('table_number'),
      supabase.from('orders').select('*, order_items(*)').eq('restaurant_id', restaurant.id).eq('status', 'completed').order('order_time'),
      supabase.from('restaurants').select('tax_percentage').eq('id', restaurant.id).maybeSingle(),
    ])
    if (!tablesRes.error) setTables(tablesRes.data || [])
    if (!ordersRes.error) setOrders(ordersRes.data || [])
    if (!restaurantRes.error) setTaxPercentage(Number(restaurantRes.data?.tax_percentage) || 0)
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => { fetchData() }, [fetchData])

  const bills = useMemo(() =>
    tables
      .map((table) => {
        const tableOrders = orders.filter((o) => o.table_id === table.id)
        const total = tableOrders.reduce((s, o) => s + Number(o.total_amount), 0)
        return { table, orders: tableOrders, total }
      })
      .filter((b) => b.orders.length > 0),
    [tables, orders],
  )

  const selectPayment = (tableId, methodId) => {
    setSelectedPayments((prev) => ({ ...prev, [tableId]: methodId }))
  }

  const handleClickSettle = async (table) => {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurant.id)
      .eq('table_id', table.id)
      .neq('status', 'completed')
      .neq('status', 'cancelled')
    setActiveOrdersCount(count ?? 0)
    setConfirmTable(table)
  }

  const handleSettle = async () => {
    if (!confirmTable || settlingTableId) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) { setConfirmTable(null); return }

    setSettlingTableId(confirmTable.id)
    try {
      const { data, error } = await supabase.rpc('reset_table_billing', {
        p_restaurant_id:  restaurant.id,
        p_table_id:       confirmTable.id,
        p_payment_method: selectedPayments[confirmTable.id] || 'other',
      })
      if (error) throw error
      if (!data) { toast.error('No completed orders to settle for this table'); return }
      toast.success('Bill settled and archived to history')
      setSelectedPayments((prev) => { const next = { ...prev }; delete next[confirmTable.id]; return next })
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to settle bill')
    } finally {
      setSettlingTableId(null)
      setConfirmTable(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 leading-relaxed">
          Select a payment method on each table, then print the receipt or settle to archive and clear the table.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
        </div>
      ) : bills.length === 0 ? (
        <div className="card py-14 text-center bg-gray-50">
          <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No unsettled bills.</p>
          <p className="text-xs text-gray-400 mt-1">All tables are clear.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bills.map(({ table, orders: tableOrders, total }) => {
            const chosen = selectedPayments[table.id] || null
            return (
              <motion.div
                key={table.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="card overflow-hidden p-0"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 bg-gray-50 border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-400" />
                    <h2 className="text-base font-bold text-gray-900 font-display">Table {table.table_number}</h2>
                  </div>
                  <span className="badge bg-amber-100 text-amber-700">
                    {tableOrders.length} order{tableOrders.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Orders */}
                <div className="px-5 py-4">
                  <ul className="divide-y divide-gray-50">
                    {tableOrders.map((order) => (
                      <li key={order.id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Order at {formatTime(order.order_time)}</span>
                          <span className="font-semibold text-gray-800">
                            {restaurant?.currency || '₹'}{Number(order.total_amount).toFixed(2)}
                          </span>
                        </div>
                        <ul className="mt-1 pl-3 space-y-0.5">
                          {(order.order_items || []).filter((item) => !item.cancelled).map((item) => (
                            <li key={item.id} className="flex items-center gap-1.5 text-xs text-gray-400">
                              <span className="font-medium text-gray-500">{item.quantity}×</span>
                              {item.item_name}
                              {item.notes && <span className="italic text-gray-300">— {item.notes}</span>}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Total + payment method + actions */}
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-600">Total Due</span>
                    <span className="text-xl font-bold text-gray-900 font-display">
                      {restaurant?.currency || '₹'}{total.toFixed(2)}
                    </span>
                  </div>
                  {taxPercentage > 0 && (
                    <p className="text-xs text-gray-400 -mt-3">Includes {taxPercentage}% tax</p>
                  )}

                  {/* Payment method selector */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment method</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => selectPayment(table.id, m.id)}
                          className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 transition-all text-[11px] font-semibold
                            ${chosen === m.id
                              ? m.active
                              : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
                            }`}
                        >
                          <m.icon className="w-4 h-4" />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => printReceipt({ tableOrders, table, total, taxPercentage, paymentMethod: chosen, restaurant })}
                      disabled={!chosen}
                      title={!chosen ? 'Select a payment method first' : 'Print receipt'}
                      className="btn-outline flex-1 gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClickSettle(table)}
                      disabled={settlingTableId === table.id || !chosen}
                      title={!chosen ? 'Select a payment method first' : ''}
                      className="btn-secondary flex-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {settlingTableId === table.id ? 'Settling…' : 'Settle Bill'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {confirmTable && (
        <ConfirmDialog
          table={confirmTable}
          activeCount={activeOrdersCount}
          onConfirm={handleSettle}
          onCancel={() => setConfirmTable(null)}
          loading={!!settlingTableId}
        />
      )}
    </div>
  )
}
