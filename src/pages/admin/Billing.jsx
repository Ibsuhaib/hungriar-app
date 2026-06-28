import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, CheckCircle2, Printer, AlertCircle, TriangleAlert, Banknote, CreditCard, Smartphone, Wallet, WifiOff, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../utils/formatters'
import { enqueueBill, getQueuedBills, removeQueuedBill, getQueuedOrders, removeQueuedOrder } from '../../utils/offlineQueue'

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

const EMPTY_ADJ = { discountType: 'amount', discountValue: '', roundOff: '' }

function computeFinals(total, adj) {
  const dv = Math.max(0, Number(adj.discountValue) || 0)  // Bug 2: clamp negative inputs to 0
  const discountAmt = adj.discountType === 'percent'
    ? Math.min(total, Math.round(total * dv) / 100)        // total × dv% rounded to 2dp
    : Math.min(total, dv)
  const afterDiscount = total - discountAmt
  const roundOffAmt = Number(adj.roundOff) || 0
  const finalTotal = Math.max(0, Math.round((afterDiscount + roundOffAmt) * 100) / 100)
  return { discountAmt, roundOffAmt, finalTotal }
}

function printReceipt({ tableOrders, table, total, taxPercentage, paymentMethod, restaurant, discountAmt = 0, roundOffAmt = 0, finalTotal = null }) {
  const cur = restaurant?.currency || '₹'
  const fmt = (v) => `${cur}${Number(v).toFixed(2)}`
  const name = restaurant?.name || 'Restaurant'
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const pm = PM_LABELS[paymentMethod] || paymentMethod || '—'

  const subtotalPreTax = taxPercentage > 0 ? total / (1 + taxPercentage / 100) : total
  const taxAmt = total - subtotalPreTax
  const displayTotal = finalTotal !== null ? finalTotal : total
  const hasAdj = discountAmt > 0 || roundOffAmt !== 0

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

  const totalsSection = `
    ${taxPercentage > 0 ? `
      <tr class="sub-row"><td>Items</td><td class="r">${fmt(subtotalPreTax)}</td></tr>
      <tr class="sub-row"><td>Tax (${taxPercentage}%)</td><td class="r">+${fmt(taxAmt)}</td></tr>
      ${hasAdj ? `<tr class="sub-row b-row"><td>Subtotal</td><td class="r">${fmt(total)}</td></tr>` : ''}
      <tr><td colspan="2"><div class="dash" style="margin:3px 0"></div></td></tr>
    ` : hasAdj ? `
      <tr class="sub-row"><td>Subtotal</td><td class="r">${fmt(total)}</td></tr>
      <tr><td colspan="2"><div class="dash" style="margin:3px 0"></div></td></tr>
    ` : ''}
    ${discountAmt > 0 ? `<tr class="sub-row disc-row"><td>Discount</td><td class="r">-${fmt(discountAmt)}</td></tr>` : ''}
    ${roundOffAmt !== 0 ? `<tr class="sub-row ro-row"><td>Round Off</td><td class="r">${roundOffAmt >= 0 ? '+' : '-'}${fmt(Math.abs(roundOffAmt))}</td></tr>` : ''}
    ${hasAdj ? `<tr><td colspan="2"><div class="dash" style="margin:3px 0"></div></td></tr>` : ''}
    <tr class="total-row"><td>TOTAL</td><td class="r">${fmt(displayTotal)}</td></tr>
  `

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
    .b-row td { font-weight: 600; color: #222; }
    .disc-row td { color: #1a7a1a; }
    .ro-row td { color: #1a3d7a; }
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

  <table>${totalsSection}</table>

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
            <button type="button" onClick={onConfirm} disabled={loading} className="btn-secondary flex-1 gap-1.5">
              <Printer className="w-4 h-4" />
              {loading ? 'Settling…' : 'Print & Settle'}
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
  const [adjustments, setAdjustments] = useState({})
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingBills, setPendingBills] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

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

  // Load pending bill count + sync on reconnect
  const syncBills = useCallback(async () => {
    if (!restaurant?.id) return
    const bills = await getQueuedBills()
    const mine  = bills.filter((b) => b.restaurantId === restaurant.id)
    setPendingBills(mine.length)
    if (!navigator.onLine || mine.length === 0) return

    setSyncing(true)
    let synced = 0
    for (const bill of mine) {
      try {
        // Complete any pending offline orders for this table first
        const offlineOrders = await getQueuedOrders()
        for (const order of offlineOrders.filter((o) => o.tableId === bill.tableId)) {
          const { error } = await supabase.rpc('admin_place_order', {
            p_restaurant_id: order.restaurantId,
            p_table_id:      order.tableId,
            p_items:         order.items,
          })
          if (!error) await removeQueuedOrder(order.id)
        }
        // Auto-complete any still-pending orders for this table
        await supabase.from('orders')
          .update({ status: 'completed' })
          .eq('restaurant_id', bill.restaurantId)
          .eq('table_id', bill.tableId)
          .in('status', ['pending', 'preparing', 'served'])
        // Settle the bill
        const { error } = await supabase.rpc('reset_table_billing', {
          p_restaurant_id:  bill.restaurantId,
          p_table_id:       bill.tableId,
          p_payment_method: bill.paymentMethod,
          p_discount:       bill.discountAmt,
          p_round_off:      bill.roundOffAmt,
        })
        if (!error) { await removeQueuedBill(bill.id); synced++ }
      } catch { /* keep in queue, retry later */ }
    }
    if (synced > 0) {
      toast.success(`${synced} offline bill${synced > 1 ? 's' : ''} synced!`)
      fetchData()
    }
    const remaining = await getQueuedBills()
    setPendingBills(remaining.filter((b) => b.restaurantId === restaurant.id).length)
    setSyncing(false)
  }, [restaurant?.id, fetchData])

  useEffect(() => {
    syncBills()
    window.addEventListener('online', syncBills)
    return () => window.removeEventListener('online', syncBills)
  }, [syncBills])

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

  const getAdj = (tableId) => adjustments[tableId] || EMPTY_ADJ
  // Bug 1 fix: read from `prev` inside the functional update, not from the outer `adjustments` closure
  const patchAdj = (tableId, patch) =>
    setAdjustments((prev) => {
      const current = prev[tableId] || EMPTY_ADJ
      return { ...prev, [tableId]: { ...current, ...patch } }
    })

  const selectPayment = (tableId, methodId) =>
    setSelectedPayments((prev) => ({ ...prev, [tableId]: methodId }))

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

    const billData = bills.find((b) => b.table.id === confirmTable.id)
    const adj = getAdj(confirmTable.id)
    const { discountAmt, roundOffAmt, finalTotal } = computeFinals(billData?.total || 0, adj)
    const paymentMethod = selectedPayments[confirmTable.id] || 'other'

    if (billData) {
      printReceipt({
        tableOrders: billData.orders,
        table:        confirmTable,
        total:        billData.total,
        taxPercentage,
        paymentMethod,
        restaurant,
        discountAmt,
        roundOffAmt,
        finalTotal,
      })
    }

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!navigator.onLine) {
      try {
        await enqueueBill({
          restaurantId:  restaurant.id,
          tableId:       confirmTable.id,
          tableNumber:   confirmTable.table_number,
          paymentMethod,
          discountAmt,
          roundOffAmt,
          finalTotal,
        })
        setPendingBills((c) => c + 1)
        toast.success(`Bill saved offline for Table ${confirmTable.table_number} — will sync when online`, { duration: 5000 })
        setSelectedPayments((prev) => { const n = { ...prev }; delete n[confirmTable.id]; return n })
        setAdjustments((prev) => { const n = { ...prev }; delete n[confirmTable.id]; return n })
      } catch {
        toast.error('Failed to save bill offline')
      }
      setConfirmTable(null)
      return
    }

    // ── Online path ───────────────────────────────────────────────────────────
    setSettlingTableId(confirmTable.id)
    try {
      const { data, error } = await supabase.rpc('reset_table_billing', {
        p_restaurant_id:  restaurant.id,
        p_table_id:       confirmTable.id,
        p_payment_method: paymentMethod,
        p_discount:       discountAmt,
        p_round_off:      roundOffAmt,
      })
      if (error) throw error
      if (!data) { toast.error('No completed orders to settle for this table'); return }
      toast.success('Bill printed and settled')
      setSelectedPayments((prev) => { const next = { ...prev }; delete next[confirmTable.id]; return next })
      setAdjustments((prev) => { const next = { ...prev }; delete next[confirmTable.id]; return next })
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to settle bill')
    } finally {
      setSettlingTableId(null)
      setConfirmTable(null)
    }
  }

  const cur = restaurant?.currency || '₹'

  return (
    <div className="space-y-4">

      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">You are offline</p>
            <p className="text-xs text-amber-600">Bills will be saved on this device and settled in Supabase when internet returns.</p>
          </div>
        </div>
      )}

      {/* Pending sync banner */}
      {isOnline && pendingBills > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <RefreshCw className={`w-4 h-4 text-blue-600 flex-shrink-0 ${syncing ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-800">
              {syncing ? 'Syncing bills…' : `${pendingBills} offline bill${pendingBills > 1 ? 's' : ''} pending sync`}
            </p>
            <p className="text-xs text-blue-600">These were settled while offline and are being synced now.</p>
          </div>
          {!syncing && (
            <button type="button" onClick={syncBills} className="text-xs font-bold text-blue-600 bg-blue-100 rounded-xl px-3 py-1.5 hover:bg-blue-200 transition-colors flex-shrink-0">
              Sync now
            </button>
          )}
        </div>
      )}

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
            const adj = getAdj(table.id)
            const { discountAmt, roundOffAmt, finalTotal } = computeFinals(total, adj)
            const hasAdj = discountAmt > 0 || roundOffAmt !== 0

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
                            {cur}{Number(order.total_amount).toFixed(2)}
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

                {/* Controls + totals */}
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">

                  {/* Payment method */}
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

                  {/* Discount */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Discount</p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => patchAdj(table.id, { discountType: 'amount', discountValue: '' })}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border-2 transition-all flex-shrink-0
                          ${adj.discountType === 'amount'
                            ? 'border-primary-400 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                      >
                        {cur}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchAdj(table.id, { discountType: 'percent', discountValue: '' })}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border-2 transition-all flex-shrink-0
                          ${adj.discountType === 'percent'
                            ? 'border-primary-400 bg-primary-50 text-primary-700'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                      >
                        %
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={adj.discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                        value={adj.discountValue}
                        onChange={(e) => patchAdj(table.id, { discountValue: e.target.value })}
                        className="input text-sm py-1.5 flex-1 min-w-0"
                      />
                    </div>
                  </div>

                  {/* Round-off */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Round Off</p>
                      <div className="flex items-center gap-2">
                        {/* Preview: show what the rounded total will be */}
                        {(total - discountAmt) % 5 !== 0 && (
                          <span className="text-[10px] text-gray-400">
                            → {cur}{Math.floor((total - discountAmt) / 5) * 5}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const afterDiscount = total - discountAmt
                            const rounded = Math.floor(afterDiscount / 5) * 5  // nearest ₹5
                            const ro = rounded - afterDiscount
                            patchAdj(table.id, { roundOff: ro === 0 ? '' : ro.toFixed(2) })
                          }}
                          className="text-[10px] text-primary-500 font-semibold hover:underline"
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. -0.50  (negative removes paise)"
                      value={adj.roundOff}
                      onChange={(e) => patchAdj(table.id, { roundOff: e.target.value })}
                      className="input text-sm py-1.5 w-full"
                    />
                  </div>

                  {/* Total breakdown */}
                  <div className="space-y-1 pt-1 border-t border-dashed border-gray-200">
                    {hasAdj && (
                      <div className="space-y-0.5 pb-1.5">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Subtotal</span>
                          <span>{cur}{total.toFixed(2)}</span>
                        </div>
                        {discountAmt > 0 && (
                          <div className="flex justify-between text-xs font-semibold text-green-600">
                            <span>
                              Discount
                              {adj.discountType === 'percent' && adj.discountValue
                                ? ` (${adj.discountValue}%)`
                                : ''}
                            </span>
                            <span>−{cur}{discountAmt.toFixed(2)}</span>
                          </div>
                        )}
                        {roundOffAmt !== 0 && (
                          <div className="flex justify-between text-xs font-semibold text-blue-600">
                            <span>Round Off</span>
                            <span>
                              {roundOffAmt >= 0 ? '+' : '−'}{cur}{Math.abs(roundOffAmt).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-600">
                        {hasAdj ? 'Final Total' : 'Total Due'}
                      </span>
                      <span className={`text-xl font-bold font-display ${hasAdj ? 'text-primary-600' : 'text-gray-900'}`}>
                        {cur}{finalTotal.toFixed(2)}
                      </span>
                    </div>
                    {taxPercentage > 0 && !hasAdj && (
                      <p className="text-xs text-gray-400">Includes {taxPercentage}% tax</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => printReceipt({ tableOrders, table, total, taxPercentage, paymentMethod: chosen, restaurant, discountAmt, roundOffAmt, finalTotal })}
                      title="Print receipt without settling"
                      className="btn-outline gap-1.5 text-sm px-3"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClickSettle(table)}
                      disabled={settlingTableId === table.id || !chosen}
                      title={!chosen ? 'Select a payment method first' : isOnline ? 'Print receipt and settle the bill' : 'Print receipt and save bill offline'}
                      className="btn-secondary flex-1 gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {settlingTableId === table.id
                        ? 'Settling…'
                        : isOnline ? 'Print & Settle' : 'Print & Save Offline'}
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
