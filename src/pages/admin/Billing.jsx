import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Receipt, CheckCircle2, Printer, AlertCircle, TriangleAlert, Banknote, CreditCard, Smartphone, Wallet, WifiOff, RefreshCw, Plus, Minus, Trash2, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { supabase } from '../../lib/supabase'
import { formatTime } from '../../utils/formatters'
import { enqueueBill, getQueuedBills, removeQueuedBill, getQueuedOrders, removeQueuedOrder, isNetworkError } from '../../utils/offlineQueue'
import { pageCache } from '../../utils/pageCache'

// Build a fake order list from offline queued orders for a table
function buildOfflineBill(queuedOrders, table, taxPercentage) {
  const tableOrders = queuedOrders.map((o, idx) => ({
    id:           `offline-${o.id}`,
    order_time:   o.queuedAt,
    total_amount: o.totalAmount,
    order_items:  (o.richItems || o.items || []).map((item) => ({
      id:         `item-${o.id}-${idx}`,
      item_name:  item.item_name || '(item)',
      quantity:   item.quantity,
      unit_price: item.unit_price || 0,
      notes:      item.notes || '',
      cancelled:  false,
    })),
  }))
  const total = tableOrders.reduce((s, o) => s + Number(o.total_amount), 0)
  return { table, orders: tableOrders, total, isOffline: true, queuedOrders }
}

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

// Recompute a tax-inclusive order total from its (non-cancelled) items —
// used for optimistic UI updates before the server round-trip confirms.
function computeOrderTotal(items, taxPercentage) {
  const subtotal = items.filter((i) => !i.cancelled).reduce((s, i) => s + i.quantity * i.unit_price, 0)
  return Math.round(subtotal * (1 + taxPercentage / 100) * 100) / 100
}

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function printReceipt({ tableOrders, table, total, taxPercentage, paymentMethod, restaurant, discountAmt = 0, roundOffAmt = 0, finalTotal = null, billNumber = null }) {
  const cur = restaurant?.currency || '₹'
  const fmt = (v) => `${cur}${Number(v).toFixed(2)}`
  const name = escapeHtml(restaurant?.name || 'Restaurant')
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  const pm = PM_LABELS[paymentMethod] || paymentMethod || '—'
  const billNoLabel = billNumber != null ? String(billNumber).padStart(4, '0') : 'PREVIEW'

  const subtotalPreTax = taxPercentage > 0 ? total / (1 + taxPercentage / 100) : total
  const taxAmt = total - subtotalPreTax
  const halfTaxPct = parseFloat((taxPercentage / 2).toFixed(2))
  const halfTaxAmt = taxAmt / 2
  const displayTotal = finalTotal !== null ? finalTotal : total
  const hasAdj = discountAmt > 0 || roundOffAmt !== 0

  const headerLines = [
    restaurant?.address          ? `<div class="c sm">${escapeHtml(restaurant.address)}</div>` : '',
    restaurant?.phone            ? `<div class="c sm">Ph: ${escapeHtml(restaurant.phone)}</div>` : '',
    restaurant?.gstin            ? `<div class="c sm">GSTIN: ${escapeHtml(restaurant.gstin)}</div>` : '',
    restaurant?.fssai_license_no ? `<div class="c sm">FSSAI Lic: ${escapeHtml(restaurant.fssai_license_no)}</div>` : '',
  ].filter(Boolean).join('')

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
      <tr class="sub-row"><td>CGST (${halfTaxPct}%)</td><td class="r">+${fmt(halfTaxAmt)}</td></tr>
      <tr class="sub-row"><td>SGST (${halfTaxPct}%)</td><td class="r">+${fmt(halfTaxAmt)}</td></tr>
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
  ${headerLines}

  <div class="dash" style="margin-top:7px"></div>

  <div style="display:flex;justify-content:space-between">
    <span>Bill No: <strong>${billNoLabel}</strong></span>
    <span>${dateStr}</span>
  </div>
  <div style="display:flex;justify-content:space-between">
    <span>Table: <strong>${table.table_number}</strong></span>
    <span class="sm">${timeStr}</span>
  </div>

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

  const tablesCacheKey = `billing-tables-${restaurant?.id}`
  const tablesCache    = pageCache.get(tablesCacheKey) || {}

  const [tables, setTables]               = useState(() => tablesCache.tables || [])
  const [taxPercentage, setTaxPercentage] = useState(() => tablesCache.tax || 0)
  const [tablesLoading, setTablesLoading] = useState(!tablesCache.tables)

  // Shared realtime orders — updates instantly when chef marks orders completed
  const { orders: allOrders, loading: ordersLoading, patchOrder, refetch } = useRealtimeOrders({
    restaurantId: restaurant?.id,
    pollInterval: 8000,
  })
  const completedOrders = useMemo(
    () => allOrders.filter((o) => o.status === 'completed'),
    [allOrders]
  )
  const loading = tablesLoading || ordersLoading
  const [settlingTableId, setSettlingTableId] = useState(null)
  const [confirmTable, setConfirmTable] = useState(null)
  const [activeOrdersCount, setActiveOrdersCount] = useState(0)
  const [selectedPayments, setSelectedPayments] = useState({})
  const [adjustments, setAdjustments] = useState({})
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingBills, setPendingBills] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [offlineOrders, setOfflineOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [busyItemId, setBusyItemId] = useState(null)
  const [addItemTableId, setAddItemTableId] = useState(null)
  const [addItemSelection, setAddItemSelection] = useState({ menuItemId: '', quantity: 1 })
  const [addItemSearch, setAddItemSearch] = useState('')
  const [addingItem, setAddingItem] = useState(false)

  const filteredMenuItems = useMemo(() => {
    const q = addItemSearch.trim().toLowerCase()
    if (!q) return menuItems
    return menuItems.filter((mi) => mi.name.toLowerCase().includes(q))
  }, [menuItems, addItemSearch])

  const closeAddItemPanel = () => {
    setAddItemTableId(null)
    setAddItemSelection({ menuItemId: '', quantity: 1 })
    setAddItemSearch('')
  }

  const selectMenuItemForAdd = (mi) => {
    setAddItemSelection((p) => ({ ...p, menuItemId: mi.id }))
    setAddItemSearch(mi.name)
  }

  useEffect(() => {
    if (!restaurant?.id) return
    supabase
      .from('menu_items')
      .select('id, name, price')
      .eq('restaurant_id', restaurant.id)
      .eq('available', true)
      .order('name')
      .then(({ data }) => setMenuItems(data || []))
  }, [restaurant?.id])

  // Optimistic: patch the order locally first so the UI reacts instantly,
  // then fire the RPC in the background. On failure, resync from the server.
  const handleItemQtyChange = async (order, item, newQty) => {
    if (busyItemId === item.id) return
    if (!navigator.onLine) { toast.error('Editing needs an internet connection'); return }
    setBusyItemId(item.id)
    const newItems = order.order_items.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
    patchOrder(order.id, { order_items: newItems, total_amount: computeOrderTotal(newItems, taxPercentage) })
    try {
      const { error } = await supabase.rpc('update_order_item_quantity', { p_item_id: item.id, p_quantity: newQty })
      if (error) throw error
    } catch (err) {
      toast.error(err.message || 'Failed to update quantity')
      refetch({ silent: true })
    } finally {
      setBusyItemId(null)
    }
  }

  const handleDeleteItem = async (order, item) => {
    if (busyItemId === item.id) return
    if (!navigator.onLine) { toast.error('Editing needs an internet connection'); return }
    setBusyItemId(item.id)
    const newItems = order.order_items.map((i) => (i.id === item.id ? { ...i, cancelled: true } : i))
    patchOrder(order.id, { order_items: newItems, total_amount: computeOrderTotal(newItems, taxPercentage) })
    try {
      const { error } = await supabase.rpc('billing_remove_item', { p_item_id: item.id })
      if (error) throw error
      toast.success(`${item.item_name} removed`)
    } catch (err) {
      toast.error(err.message || 'Failed to remove item')
      refetch({ silent: true })
    } finally {
      setBusyItemId(null)
    }
  }

  const handleAddItem = async (table) => {
    if (!addItemSelection.menuItemId || addingItem) return
    if (!navigator.onLine) { toast.error('Editing needs an internet connection'); return }
    setAddingItem(true)
    try {
      const { error } = await supabase.rpc('admin_add_billing_item', {
        p_restaurant_id: restaurant.id,
        p_table_id:      table.id,
        p_menu_item_id:  addItemSelection.menuItemId,
        p_quantity:      Math.max(1, Math.min(50, Number(addItemSelection.quantity) || 1)),
      })
      if (error) throw error
      toast.success('Item added to bill')
      closeAddItemPanel()
      refetch({ silent: true })
    } catch (err) {
      toast.error(err.message || 'Failed to add item')
    } finally {
      setAddingItem(false)
    }
  }

  const loadOfflineOrders = useCallback(async () => {
    if (!restaurant?.id) return
    const queued = await getQueuedOrders()
    setOfflineOrders(queued.filter((o) => o.restaurantId === restaurant.id))
  }, [restaurant?.id])

  useEffect(() => {
    const on  = () => { setIsOnline(true);  loadOfflineOrders() }
    const off = () => { setIsOnline(false); loadOfflineOrders() }
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    loadOfflineOrders()
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [loadOfflineOrders])

  const fetchTables = useCallback(async () => {
    if (!restaurant?.id) return
    if (!pageCache.has(tablesCacheKey)) setTablesLoading(true)
    try {
      const [tablesRes, restaurantRes] = await Promise.all([
        supabase.from('tables').select('*').eq('restaurant_id', restaurant.id).order('table_number'),
        supabase.from('restaurants').select('tax_percentage').eq('id', restaurant.id).maybeSingle(),
      ])
      const t  = tablesRes.data || []
      const tp = Number(restaurantRes.data?.tax_percentage) || 0
      if (!tablesRes.error)     setTables(t)
      if (!restaurantRes.error) setTaxPercentage(tp)
      pageCache.set(tablesCacheKey, { tables: t, tax: tp })
    } catch {
      // Offline with no cache yet — keep whatever's in state and stop loading.
    } finally {
      setTablesLoading(false)
    }
  }, [restaurant?.id, tablesCacheKey])

  useEffect(() => { fetchTables() }, [fetchTables])

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
          // p_order_id keeps this idempotent so it never duplicates an order the
          // TakeOrder page may have already synced from the same queue.
          const { error } = await supabase.rpc(order.rpc || 'admin_place_order', {
            p_restaurant_id: order.restaurantId,
            p_table_id:      order.tableId,
            p_items:         order.items,
            p_order_id:      order.orderId,
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
      fetchTables()
    }
    const remaining = await getQueuedBills()
    setPendingBills(remaining.filter((b) => b.restaurantId === restaurant.id).length)
    setSyncing(false)
  }, [restaurant?.id, fetchTables])

  useEffect(() => {
    syncBills()
    window.addEventListener('online', syncBills)
    return () => window.removeEventListener('online', syncBills)
  }, [syncBills])

  const bills = useMemo(() => {
    // Online bills — derived from the shared realtime orders (completedOrders)
    const onlineBills = tables
      .map((table) => {
        const tableOrders = completedOrders.filter((o) => o.table_id === table.id)
        const total = tableOrders.reduce((s, o) => s + Number(o.total_amount), 0)
        return { table, orders: tableOrders, total, isOffline: false }
      })
      .filter((b) => b.orders.length > 0)

    // Offline bills from IndexedDB — grouped by tableId
    const offlineByTable = {}
    for (const o of offlineOrders) {
      if (!offlineByTable[o.tableId]) offlineByTable[o.tableId] = []
      offlineByTable[o.tableId].push(o)
    }

    const offlineBills = Object.entries(offlineByTable)
      .filter(([tableId]) => !onlineBills.find((b) => b.table.id === tableId))
      .map(([tableId, queuedOrders]) => {
        const fakeTable = {
          id:           tableId,
          table_number: queuedOrders[0].tableNumber,
          restaurant_id: restaurant?.id,
        }
        return buildOfflineBill(queuedOrders, fakeTable, taxPercentage)
      })

    return [...onlineBills, ...offlineBills]
  }, [tables, completedOrders, offlineOrders, taxPercentage, restaurant?.id])

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
    // Best-effort — if this fails (e.g. no real connectivity despite
    // navigator.onLine), just skip the "still in the kitchen" warning and
    // let the settle flow itself handle online/offline.
    try {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id)
        .eq('table_id', table.id)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
      setActiveOrdersCount(count ?? 0)
    } catch {
      setActiveOrdersCount(0)
    }
    setConfirmTable(table)
  }

  const handleSettle = async () => {
    if (!confirmTable || settlingTableId) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) { setConfirmTable(null); return }

    const tableId = confirmTable.id
    const billData = bills.find((b) => b.table.id === tableId)
    const adj = getAdj(tableId)
    const { discountAmt, roundOffAmt, finalTotal } = computeFinals(billData?.total || 0, adj)
    const paymentMethod = selectedPayments[tableId] || 'other'

    // Real (already-synced) orders backing this bill, if any — hidden optimistically
    // regardless of whether the settle completes online or falls back to the queue,
    // so the card never lingers after the admin has already acted on it.
    const tableOrderIds = completedOrders.filter((o) => o.table_id === tableId).map((o) => o.id)
    const hideBill    = () => tableOrderIds.forEach((id) => patchOrder(id, { status: '_settling' }))
    const restoreBill = () => tableOrderIds.forEach((id) => patchOrder(id, { status: 'completed' }))

    // ── Offline path — no real bill number can be reserved without a server
    // round-trip, so the printed receipt shows "PREVIEW" until it syncs ───────
    const saveOffline = async () => {
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
          billNumber:   null,
        })
      }
      hideBill()
      await enqueueBill({
        restaurantId:  restaurant.id,
        tableId,
        tableNumber:   confirmTable.table_number,
        paymentMethod,
        discountAmt,
        roundOffAmt,
        finalTotal,
      })
      setPendingBills((c) => c + 1)
      toast.success(`Bill saved offline for Table ${confirmTable.table_number} — will sync when online`, { duration: 5000 })
      setSelectedPayments((prev) => { const n = { ...prev }; delete n[tableId]; return n })
      setAdjustments((prev) => { const n = { ...prev }; delete n[tableId]; return n })
      // Remove offline orders for this table since they're now billed
      for (const o of offlineOrders.filter((o) => o.tableId === tableId)) {
        await removeQueuedOrder(o.id)
      }
      await loadOfflineOrders()
    }

    setConfirmTable(null)
    setSettlingTableId(tableId)

    if (!navigator.onLine) {
      try { await saveOffline() }
      catch { restoreBill(); toast.error('Failed to save bill offline') }
      finally { setSettlingTableId(null) }
      return
    }

    // ── Online attempt: optimistic vanish before the RPC ──────────────────────
    hideBill()
    setSelectedPayments((prev) => { const n = { ...prev }; delete n[tableId]; return n })
    setAdjustments((prev) => { const n = { ...prev }; delete n[tableId]; return n })

    try {
      const { data, error } = await supabase.rpc('reset_table_billing', {
        p_restaurant_id:  restaurant.id,
        p_table_id:       tableId,
        p_payment_method: paymentMethod,
        p_discount:       discountAmt,
        p_round_off:      roundOffAmt,
      })
      if (error) throw error
      if (!data || data.length === 0) {
        restoreBill()
        toast.error('No completed orders to settle')
        return
      }
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
          billNumber:   data[0].bill_number,
        })
      }
      toast.success('Bill settled!')
      // Realtime DELETE events from the RPC will remove the orders from allOrders automatically
    } catch (err) {
      // navigator.onLine can be true on a WiFi with no real internet. If the
      // request failed for a network reason, queue it instead of losing it —
      // the bill stays hidden (already optimistically settled) either way.
      if (isNetworkError(err)) {
        try { await saveOffline() }
        catch { restoreBill(); toast.error('Failed to save bill offline') }
      } else {
        restoreBill()
        toast.error(err.message || 'Failed to settle bill')
      }
    } finally {
      setSettlingTableId(null)
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
            <p className="text-xs text-amber-600">New bills will be saved on this device and settled when internet returns. Editing existing bill items is disabled until you're back online.</p>
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
          <AnimatePresence mode="popLayout">
          {bills.map(({ table, orders: tableOrders, total, isOffline: isBillOffline }) => {
            const chosen = selectedPayments[table.id] || null
            const adj = getAdj(table.id)
            const { discountAmt, roundOffAmt, finalTotal } = computeFinals(total, adj)
            const hasAdj = discountAmt > 0 || roundOffAmt !== 0

            return (
              <motion.div
                key={table.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                className="card overflow-hidden p-0"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 bg-gray-50 border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-400" />
                    <h2 className="text-base font-bold text-gray-900 font-display">Table {table.table_number}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {isBillOffline && (
                      <span className="badge bg-orange-100 text-orange-700 flex items-center gap-1">
                        <WifiOff className="w-2.5 h-2.5" /> Offline
                      </span>
                    )}
                    <span className="badge bg-amber-100 text-amber-700">
                      {tableOrders.length} order{tableOrders.length !== 1 ? 's' : ''}
                    </span>
                  </div>
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
                        <ul className="mt-1.5 pl-3 space-y-1.5">
                          {(order.order_items || []).filter((item) => !item.cancelled).map((item) => (
                            <li key={item.id} className="flex items-center gap-2 text-xs text-gray-400">
                              <span className="flex-1 min-w-0 truncate">
                                {item.item_name}
                                {item.notes && <span className="italic text-gray-300"> — {item.notes}</span>}
                              </span>
                              {isBillOffline || !isOnline ? (
                                <span className="font-medium text-gray-500 flex-shrink-0">{item.quantity}×</span>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => item.quantity === 1
                                      ? handleDeleteItem(order, item)
                                      : handleItemQtyChange(order, item, item.quantity - 1)}
                                    disabled={busyItemId === item.id}
                                    aria-label={item.quantity === 1 ? `Remove ${item.item_name}` : `Decrease ${item.item_name} quantity`}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 active:bg-gray-100 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                                  >
                                    {item.quantity === 1
                                      ? <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      : <Minus className="w-3.5 h-3.5" />}
                                  </button>
                                  <span className="w-5 text-center text-sm font-bold text-gray-700">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleItemQtyChange(order, item, item.quantity + 1)}
                                    disabled={busyItemId === item.id}
                                    aria-label={`Increase ${item.item_name} quantity`}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 active:bg-gray-100 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>

                  {/* Add a missed item */}
                  {!isBillOffline && isOnline && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                      {addItemTableId === table.id ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search menu items…"
                              value={addItemSearch}
                              onChange={(e) => {
                                setAddItemSearch(e.target.value)
                                setAddItemSelection((p) => ({ ...p, menuItemId: '' }))
                              }}
                              className="input text-sm py-1.5 pl-8 w-full"
                            />
                          </div>

                          {addItemSearch && !addItemSelection.menuItemId && (
                            <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                              {filteredMenuItems.length === 0 ? (
                                <p className="px-3 py-2 text-xs text-gray-400">No items found</p>
                              ) : (
                                filteredMenuItems.map((mi) => (
                                  <button
                                    key={mi.id}
                                    type="button"
                                    onClick={() => selectMenuItemForAdd(mi)}
                                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors"
                                  >
                                    <span className="text-gray-700 truncate">{mi.name}</span>
                                    <span className="text-gray-400 flex-shrink-0">{cur}{Number(mi.price).toFixed(2)}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}

                          {addItemSelection.menuItemId && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500 flex-1 min-w-0 truncate">Qty</span>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                value={addItemSelection.quantity}
                                onChange={(e) => setAddItemSelection((p) => ({ ...p, quantity: e.target.value }))}
                                className="input text-sm py-1.5 w-20 flex-shrink-0"
                              />
                            </div>
                          )}

                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={closeAddItemPanel}
                              className="btn-outline text-xs py-1.5 flex-1"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddItem(table)}
                              disabled={!addItemSelection.menuItemId || addingItem}
                              className="btn-secondary text-xs py-1.5 flex-1 disabled:opacity-40"
                            >
                              {addingItem ? 'Adding…' : 'Add to Bill'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddItemTableId(table.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Item
                        </button>
                      )}
                    </div>
                  )}
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
                      onClick={() => printReceipt({ tableOrders, table, total, taxPercentage, paymentMethod: chosen, restaurant, discountAmt, roundOffAmt, finalTotal, billNumber: null })}
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
          </AnimatePresence>
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
