import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Minus, Search, ShoppingCart, Loader2, Clock,
  Receipt, ConciergeBell, WifiOff, RefreshCw, CheckCircle2, Printer, PenLine, Trash2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'
import { printKOT } from '../../utils/kotPrint'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { enqueueOrder, enqueueBill, getQueuedOrders, isNetworkError, removeQueuedOrder } from '../../utils/offlineQueue'
import { pageCache } from '../../utils/pageCache'
import OrderCard from '../../components/OrderCard'
import { computeFinals, computeOrderTotal, EMPTY_ADJ, PAYMENT_METHODS, printReceipt } from './Billing'

// ─── Cart hook (same shape as TakeOrder / StaffPanel) ────────────────────────
function useCart() {
  const [cart, setCart] = useState({})
  const add = (item) =>
    setCart((prev) => ({
      ...prev,
      [item.id]: { item, quantity: (prev[item.id]?.quantity ?? 0) + 1, notes: prev[item.id]?.notes ?? '' },
    }))
  const remove = (itemId) =>
    setCart((prev) => {
      const qty = (prev[itemId]?.quantity ?? 0) - 1
      if (qty <= 0) { const next = { ...prev }; delete next[itemId]; return next }
      return { ...prev, [itemId]: { ...prev[itemId], quantity: qty } }
    })
  const clear = () => setCart({})
  const entries = Object.values(cart)
  const totalQty = entries.reduce((s, e) => s + e.quantity, 0)
  const subtotal = entries.reduce((s, e) => s + e.item.price * e.quantity, 0)
  return { cart, entries, totalQty, subtotal, add, remove, clear }
}

// Which "stage" of a table's active orders is most in need of attention —
// shown as a small badge on the occupied block so staff know at a glance
// whether the kitchen still has work to do.
const STATUS_PRIORITY = ['pending', 'preparing', 'ready', 'served']
const STATUS_META = {
  pending:   { label: 'Pending',       color: 'text-amber-700 bg-amber-100' },
  preparing: { label: 'Preparing',     color: 'text-blue-700  bg-blue-100'  },
  ready:     { label: 'Ready',         color: 'text-green-700 bg-green-100' },
  served:    { label: 'Served',        color: 'text-gray-600  bg-gray-100'  },
  completed: { label: 'Ready to Bill', color: 'text-secondary-700 bg-secondary-100' },
}
function tableOverallStatus(tableOrders) {
  for (const s of STATUS_PRIORITY) {
    if (tableOrders.some((o) => o.status === s)) return s
  }
  return tableOrders[0]?.status ?? 'pending'
}

function timeSince(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

// ─── Table blocks ─────────────────────────────────────────────────────────────

function FreeTableBlock({ table, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 active:scale-95 transition-all shadow-sm"
    >
      <span className="w-2 h-2 rounded-full bg-green-500" />
      <span className="text-base font-bold text-gray-800">Table {table.table_number}</span>
      <span className="text-[11px] text-gray-400">Tap to order</span>
    </button>
  )
}

function OccupiedTableBlock({ table, orders, currency, onClick }) {
  const itemCount = orders.reduce(
    (s, o) => s + (o.order_items || []).filter((i) => !i.cancelled).reduce((s2, i) => s2 + i.quantity, 0),
    0,
  )
  const subtotal = orders.reduce((s, o) => s + Number(o.total_amount), 0)
  const earliest = orders.reduce((min, o) => (new Date(o.order_time) < new Date(min.order_time) ? o : min), orders[0])
  const status = tableOverallStatus(orders)
  const meta = STATUS_META[status] ?? STATUS_META.pending

  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100 active:scale-95 transition-all shadow-sm p-2"
    >
      <span className="w-2 h-2 rounded-full bg-amber-500 mb-0.5" />
      <span className="text-base font-bold text-gray-800">Table {table.table_number}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
      <span className="text-[11px] text-gray-600">{itemCount} item{itemCount !== 1 ? 's' : ''} · {formatCurrency(subtotal, currency)}</span>
      <span className="text-[10px] text-gray-400 flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" /> {timeSince(earliest.order_time)}
      </span>
    </button>
  )
}

// ─── Open Order modal ─────────────────────────────────────────────────────────
// For one-off customer requests that aren't in the menu — a custom name +
// price goes straight into the cart. Never written to menu_items.

function OpenOrderModal({ currency, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const numericPrice = Number(price)
    if (!trimmedName || !numericPrice || numericPrice <= 0) return
    onAdd({ id: `open-${crypto.randomUUID()}`, name: trimmedName, price: numericPrice, isOpenItem: true })
    onClose()
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-[56] flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Open Order Item</h3>
              <p className="text-xs text-gray-400 mt-0.5">A custom item just for this order — not added to the menu</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 flex-shrink-0">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Item Name</label>
              <input
                type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Special combo, Custom cake…" maxLength={80} required
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Price ({currency})</label>
              <input
                type="number" min="0.01" step="0.01" value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00" required
                className="input w-full"
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim() || !price || Number(price) <= 0}
              className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-2xl text-sm font-bold transition-colors disabled:opacity-40"
            >
              Add to Cart
            </button>
          </form>
        </div>
      </motion.div>
    </>
  )
}

// ─── Menu overlay (opens for a free table, or "Add Items" on an occupied one) ─

function MenuOverlay({
  table, categories, items, cart, search, onSearch, selectedCatId, onSelectCat,
  onAdd, onRemove, totalQty, subtotal, currency, onClose, onOpenCart, onOpenOrder,
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-gray-50 flex flex-col"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
          <X className="w-5 h-5 text-gray-500" />
        </button>
        <div>
          <p className="text-sm font-bold text-gray-900">Table {table?.table_number}</p>
          <p className="text-xs text-gray-400">Add items to this order</p>
        </div>
        {totalQty > 0 && (
          <button
            type="button"
            onClick={onOpenCart}
            className="ml-auto flex items-center gap-1.5 bg-primary-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> {totalQty} · {formatCurrency(subtotal, currency)}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search" value={search} onChange={(e) => onSearch(e.target.value)}
              placeholder="Search items…" className="input pl-9 w-full"
            />
          </div>
          <button
            type="button" onClick={onOpenOrder}
            title="Add a custom item not in the menu"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-primary-300 bg-primary-50 text-sm font-semibold text-primary-600 hover:bg-primary-100 transition-colors flex-shrink-0"
          >
            <PenLine className="w-4 h-4" /> Open Order
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button" onClick={() => onSelectCat('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedCatId === 'all' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id} type="button" onClick={() => onSelectCat(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedCatId === c.id ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No items found.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((item) => {
              const qty = cart[item.id]?.quantity ?? 0
              return (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col">
                  <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 flex-1">{item.name}</p>
                  <p className="text-sm font-bold text-primary-600 mt-1">{formatCurrency(item.price, currency)}</p>
                  <div className="mt-2">
                    {qty === 0 ? (
                      <button
                        type="button" onClick={() => onAdd(item)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-xl bg-primary-50 text-primary-600 text-xs font-bold hover:bg-primary-100 transition-colors border border-primary-100"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-primary-50 rounded-xl border border-primary-100 px-1">
                        <button type="button" onClick={() => onRemove(item.id)} className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-bold text-primary-700">{qty}</span>
                        <button type="button" onClick={() => onAdd(item)} className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating cart button */}
      {totalQty > 0 && (
        <div className="fixed bottom-safe-6 inset-x-0 flex justify-center z-30 pointer-events-none">
          <button
            type="button" onClick={onOpenCart}
            className="pointer-events-auto flex items-center gap-2 bg-primary-600 text-white font-bold px-6 py-3.5 rounded-2xl shadow-xl hover:bg-primary-700 active:scale-95 transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            View Cart · {totalQty} item{totalQty !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ─── Cart bottom sheet ────────────────────────────────────────────────────────

function CartSheet({ entries, subtotal, currency, onAdd, onRemove, onClose, onPlace, placing, tableNumber, isOnline }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50" onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 inset-x-0 z-[60] bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-safe-5 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Order for Table {tableNumber}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {entries.map((e) => (
            <div key={e.item.id} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{e.quantity}× {e.item.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatCurrency(e.item.price * e.quantity, currency)}</span>
                <button type="button" onClick={() => onRemove(e.item.id)} className="text-gray-400 hover:text-red-400">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => onAdd(e.item)} className="text-gray-400 hover:text-primary-500">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-3 mb-4">
          <div className="flex justify-between text-sm font-semibold text-gray-800">
            <span>Subtotal (before tax)</span>
            <span>{formatCurrency(subtotal, currency)}</span>
          </div>
        </div>

        <button type="button" onClick={onPlace} disabled={placing} className="btn-primary w-full py-3 gap-2">
          {placing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {isOnline ? 'Placing…' : 'Saving offline…'}</>
            : `${isOnline ? 'Place Order & Print KOT' : 'Save Offline'} · ${entries.reduce((s, e) => s + e.quantity, 0)} item${entries.length !== 1 ? 's' : ''}`}
        </button>
      </motion.div>
    </>
  )
}

// ─── Order summary panel (Phase 1: read-only + bridges to Orders/Billing) ─────

function OrderSummaryPanel({
  table, orders, currency, restaurantName, onClose, onAddItems, onGoToBilling,
  onStatusChange, onQuantityChange, onCancelItem, onCancelOrder, busyItemId,
}) {
  // canBill is vacuously true on an empty array too — orders only leave this
  // list (and the table itself) once the bill is actually settled.
  const canBill = orders.every((o) => o.status === 'completed')

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50" onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 inset-x-0 z-[60] bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-safe-5 max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Table {table?.table_number}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-8 mb-4 bg-green-50 rounded-2xl border border-green-100">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-green-700">All orders completed</p>
            <p className="text-xs text-green-600 mt-0.5">Ready to bill</p>
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={onStatusChange}
                onQuantityChange={onQuantityChange}
                onCancelItem={onCancelItem}
                onCancelOrder={onCancelOrder}
                busyItemId={busyItemId}
                currency={currency}
                restaurantName={restaurantName}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button" onClick={onAddItems}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-50 text-primary-700 text-sm font-bold border border-primary-100 hover:bg-primary-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Items
          </button>
          <button
            type="button" onClick={onGoToBilling} disabled={!canBill}
            title={canBill ? 'Go to Billing to print/settle' : 'Order must be marked completed before it can be billed'}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary-600 text-white text-sm font-bold hover:bg-secondary-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Receipt className="w-4 h-4" /> {canBill ? 'Go to Bill' : 'Not ready to bill yet'}
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Bill panel — slides in from the left on larger screens (table grid stays
// visible), full-screen on mobile since discount/round-off/package
// charge/payment/cash-tendered is too much to cram into a short sheet ─────────

function BillPanel({
  table, tableOrders, currency, taxPercentage, restaurant, isOnline, checkAdminLimit, userId,
  menuItems, patchOrder, refetch, onClose, onSettled,
}) {
  const [adj, setAdj] = useState(EMPTY_ADJ)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashTendered, setCashTendered] = useState('')
  const [settling, setSettling] = useState(false)
  const [busyItemId, setBusyItemId] = useState(null)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addItemSearch, setAddItemSearch] = useState('')
  const [addItemSelection, setAddItemSelection] = useState({ menuItemId: '', quantity: 1 })
  const [addingItem, setAddingItem] = useState(false)

  const filteredMenuItems = useMemo(() => {
    const q = addItemSearch.trim().toLowerCase()
    if (!q) return menuItems
    return menuItems.filter((mi) => mi.name.toLowerCase().includes(q))
  }, [menuItems, addItemSearch])

  const closeAddItemPanel = () => {
    setAddItemOpen(false)
    setAddItemSelection({ menuItemId: '', quantity: 1 })
    setAddItemSearch('')
  }

  const selectMenuItemForAdd = (mi) => {
    setAddItemSelection((p) => ({ ...p, menuItemId: mi.id }))
    setAddItemSearch(mi.name)
  }

  // Same handlers as Billing.jsx — identical RPCs (update_order_item_quantity,
  // billing_remove_item, admin_add_billing_item), so edits made here log to
  // bill_edit_log exactly the same way and Day End reports them identically
  // regardless of which page the edit was made from.
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

  const handleAddItem = async () => {
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

  const total = tableOrders.reduce((s, o) => s + Number(o.total_amount), 0)
  const { discountAmt, roundOffAmt, packageChargeAmt, finalTotal } = computeFinals(total, adj)
  const hasAdj = discountAmt > 0 || roundOffAmt !== 0 || packageChargeAmt > 0
  const cur = currency

  const patchAdj = (patch) => setAdj((prev) => ({ ...prev, ...patch }))

  const tendered = Number(cashTendered) || 0
  const changeDue = Math.max(0, tendered - finalTotal)

  const handlePrint = () => printReceipt({
    tableOrders, table, total, taxPercentage, paymentMethod: paymentMethod || 'other',
    restaurant, discountAmt, roundOffAmt, packageChargeAmt, finalTotal, billNumber: null,
  })

  const handleSettle = async () => {
    if (!paymentMethod || settling) return
    const allowed = navigator.onLine ? await checkAdminLimit(userId) : true
    if (!allowed) return
    setSettling(true)

    const tableId = table.id
    const orderIds = tableOrders.map((o) => o.id)

    const saveOffline = async () => {
      await enqueueBill({
        restaurantId: restaurant.id, tableId, tableNumber: table.table_number,
        paymentMethod, discountAmt, roundOffAmt, packageChargeAmt, finalTotal,
        orderIds,
      })
      toast.success(`Bill saved offline for Table ${table.table_number} — will sync when online`, { duration: 5000 })
      onSettled()
    }

    if (!navigator.onLine) {
      try { await saveOffline() } catch { toast.error('Failed to save bill offline') }
      setSettling(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc('reset_table_billing', {
        p_restaurant_id:  restaurant.id,
        p_table_id:       tableId,
        p_payment_method: paymentMethod,
        p_discount:       discountAmt,
        p_round_off:      roundOffAmt,
        p_package_charge: packageChargeAmt,
      })
      if (error) throw error
      if (!data || data.length === 0) {
        toast.error('No completed orders to settle')
        setSettling(false)
        return
      }
      toast.success('Bill settled!')
      onSettled()
    } catch (err) {
      if (isNetworkError(err)) {
        try { await saveOffline() } catch { toast.error('Failed to save bill offline') }
      } else {
        toast.error(err.message || 'Failed to settle bill')
      }
    } finally {
      setSettling(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 sm:bg-black/10 z-[65]" onClick={onClose}
      />
      <motion.div
        initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-y-0 left-0 z-[70] bg-white shadow-2xl overflow-y-auto w-full sm:w-[420px]"
      >
        <div className="p-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Bill — Table {table?.table_number}</h3>
            <button type="button" onClick={onClose} aria-label="Close bill" className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="space-y-1.5 mb-4">
            {tableOrders.map((order) => (
              (order.order_items || []).filter((i) => !i.cancelled).map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="flex-1 min-w-0 truncate">{it.item_name}</span>
                  {isOnline ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => it.quantity === 1
                          ? handleDeleteItem(order, it)
                          : handleItemQtyChange(order, it, it.quantity - 1)}
                        disabled={busyItemId === it.id}
                        data-tip={it.quantity === 1 ? 'Remove item' : 'Reduce quantity'}
                        aria-label={it.quantity === 1 ? `Remove ${it.item_name}` : `Decrease ${it.item_name} quantity`}
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {it.quantity === 1 ? <Trash2 className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4" />}
                      </button>
                      <span className="w-6 text-center font-bold text-gray-800 text-sm">{it.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleItemQtyChange(order, it, it.quantity + 1)}
                        disabled={busyItemId === it.id}
                        data-tip="Add one more"
                        aria-label={`Increase ${it.item_name} quantity`}
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium text-gray-500 flex-shrink-0">{it.quantity}×</span>
                  )}
                  <span className="font-medium w-16 text-right flex-shrink-0">{formatCurrency(it.unit_price * it.quantity, cur)}</span>
                </div>
              ))
            ))}
          </div>

          {/* Add a missed item */}
          {isOnline && (
            <div className="mb-4 pt-3 border-t border-dashed border-gray-200">
              {addItemOpen ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text" autoFocus placeholder="Search menu items…"
                      value={addItemSearch}
                      onChange={(e) => { setAddItemSearch(e.target.value); setAddItemSelection((p) => ({ ...p, menuItemId: '' })) }}
                      className="input text-sm py-1.5 pl-8 w-full"
                    />
                  </div>
                  {addItemSearch && !addItemSelection.menuItemId && (
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                      {filteredMenuItems.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No items found</p>
                      ) : (
                        filteredMenuItems.map((mi) => (
                          <button
                            key={mi.id} type="button" onClick={() => selectMenuItemForAdd(mi)}
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
                        type="number" min="1" max="50" value={addItemSelection.quantity}
                        onChange={(e) => setAddItemSelection((p) => ({ ...p, quantity: e.target.value }))}
                        className="input text-sm py-1.5 w-20 flex-shrink-0"
                      />
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={closeAddItemPanel} className="btn-outline text-xs py-1.5 flex-1">Cancel</button>
                    <button
                      type="button" onClick={handleAddItem}
                      disabled={!addItemSelection.menuItemId || addingItem}
                      className="btn-secondary text-xs py-1.5 flex-1 disabled:opacity-40"
                    >
                      {addingItem ? 'Adding…' : 'Add to Bill'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button" onClick={() => setAddItemOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 text-xs font-semibold hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add a missed item
                </button>
              )}
            </div>
          )}

          <div className="border-t border-gray-100 pt-3 mb-4">
            <div className="flex justify-between text-sm font-semibold text-gray-800">
              <span>Subtotal</span>
              <span>{formatCurrency(total, cur)}</span>
            </div>
          </div>

          <div className="space-y-4 mb-4">
            {/* Discount */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Discount</p>
              <div className="flex gap-1.5">
                <button
                  type="button" onClick={() => patchAdj({ discountType: 'amount', discountValue: '' })}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border-2 transition-all flex-shrink-0
                    ${adj.discountType === 'amount' ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                >
                  {cur}
                </button>
                <button
                  type="button" onClick={() => patchAdj({ discountType: 'percent', discountValue: '' })}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border-2 transition-all flex-shrink-0
                    ${adj.discountType === 'percent' ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                >
                  %
                </button>
                <input
                  type="number" min="0" step="0.01"
                  placeholder={adj.discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                  value={adj.discountValue}
                  onChange={(e) => patchAdj({ discountValue: e.target.value })}
                  className="input text-sm py-1.5 flex-1 min-w-0"
                />
              </div>
            </div>

            {/* Round-off */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Round Off</p>
                <button
                  type="button"
                  onClick={() => {
                    const afterDiscount = total - discountAmt
                    const rounded = Math.floor(afterDiscount / 5) * 5
                    const ro = rounded - afterDiscount
                    patchAdj({ roundOff: ro === 0 ? '' : ro.toFixed(2) })
                  }}
                  className="text-[10px] text-primary-500 font-semibold hover:underline"
                >
                  Auto
                </button>
              </div>
              <input
                type="number" step="0.01" placeholder="e.g. -0.50"
                value={adj.roundOff}
                onChange={(e) => patchAdj({ roundOff: e.target.value })}
                className="input text-sm py-1.5 w-full"
              />
            </div>

            {/* Package charge */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Package Charge</p>
              <input
                type="number" min="0" step="0.01" placeholder="e.g. 10 (takeaway packaging)"
                value={adj.packageCharge}
                onChange={(e) => patchAdj({ packageCharge: e.target.value })}
                className="input text-sm py-1.5 w-full"
              />
            </div>
          </div>

          {hasAdj && (
            <div className="space-y-0.5 pb-2 mb-2 border-t border-dashed border-gray-200 pt-2">
              {discountAmt > 0 && <div className="flex justify-between text-xs text-rose-500"><span>Discount</span><span>− {formatCurrency(discountAmt, cur)}</span></div>}
              {roundOffAmt !== 0 && <div className="flex justify-between text-xs text-blue-500"><span>Round Off</span><span>{roundOffAmt >= 0 ? '+' : '−'} {formatCurrency(Math.abs(roundOffAmt), cur)}</span></div>}
              {packageChargeAmt > 0 && <div className="flex justify-between text-xs text-amber-600"><span>Package Charge</span><span>+ {formatCurrency(packageChargeAmt, cur)}</span></div>}
            </div>
          )}

          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-semibold text-gray-600">{hasAdj ? 'Final Total' : 'Total Due'}</span>
            <span className="text-xl font-bold text-primary-600">{formatCurrency(finalTotal, cur)}</span>
          </div>

          {/* Payment method */}
          <div className="space-y-2 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment method</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id} type="button" onClick={() => setPaymentMethod(m.id)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 transition-all text-[11px] font-semibold
                    ${paymentMethod === m.id ? m.active : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'}`}
                >
                  <m.icon className="w-4 h-4" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash tendered + change */}
          {paymentMethod === 'cash' && (
            <div className="space-y-1.5 mb-5 bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-gray-500 flex-shrink-0">Cash Tendered</label>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={cashTendered} onChange={(e) => setCashTendered(e.target.value)}
                  className="input text-sm py-1.5 text-right w-32"
                />
              </div>
              {tendered > 0 && (
                <div className="flex justify-between text-sm font-bold text-gray-800 pt-1 border-t border-dashed border-gray-200">
                  <span>Change Due</span>
                  <span>{formatCurrency(changeDue, cur)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={handlePrint} className="btn-outline gap-1.5 text-sm px-3">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              type="button" onClick={handleSettle}
              disabled={!paymentMethod || settling}
              className="btn-secondary flex-1 gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {settling ? 'Settling…' : isOnline ? 'Settle & Close' : 'Save Offline'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Floor() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()
  const currency = restaurant?.currency || '₹'
  const taxPercentage = Number(restaurant?.tax_percentage) || 0

  const cacheKey = `floor-${restaurant?.id}`
  const cache = pageCache.get(cacheKey) || {}
  const [tables, setTables] = useState(() => cache.tables || [])
  const [categories, setCategories] = useState(() => cache.categories || [])
  const [menuItems, setMenuItems] = useState(() => cache.menuItems || [])
  const [dataLoading, setDataLoading] = useState(!cache.tables)

  const [menuTableId, setMenuTableId] = useState(null)
  const [summaryTableId, setSummaryTableId] = useState(null)
  const [billTableId, setBillTableId] = useState(null)
  const [selectedCatId, setSelectedCatId] = useState('all')
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [openOrderModalOpen, setOpenOrderModalOpen] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const { cart, entries, totalQty, subtotal, add, remove, clear } = useCart()

  const fetchData = useCallback(async () => {
    if (!restaurant?.id) return
    if (!pageCache.has(cacheKey)) setDataLoading(true)
    try {
      const [t, c, m] = await Promise.all([
        supabase.from('tables').select('id, table_number').eq('restaurant_id', restaurant.id).order('table_number'),
        supabase.from('categories').select('id, name, display_order').eq('restaurant_id', restaurant.id).order('display_order'),
        supabase.from('menu_items').select('id, name, price, category_id, available').eq('restaurant_id', restaurant.id).eq('available', true).order('name'),
      ])
      const tt = t.data ?? [], cc = c.data ?? [], mm = m.data ?? []
      if (!t.error) setTables(tt)
      if (!c.error) setCategories(cc)
      if (!m.error) setMenuItems(mm)
      if (!t.error && !c.error && !m.error) pageCache.set(cacheKey, { tables: tt, categories: cc, menuItems: mm })
    } catch {
      // Offline — keep whatever's cached.
    } finally {
      setDataLoading(false)
    }
  }, [restaurant?.id, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const { orders, refetch, patchOrder } = useRealtimeOrders({ restaurantId: restaurant?.id, pollInterval: 5000 })

  // Same handlers as Orders.jsx / Chef.jsx — kept identical so behavior (and
  // the RPCs/tables they touch) doesn't diverge between the two views.
  const handleStatusChange = async (orderId, newStatus) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const prevStatus = orders.find((o) => o.id === orderId)?.status
    patchOrder(orderId, { status: newStatus })
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) {
      toast.error('Failed to update order status')
      if (prevStatus) patchOrder(orderId, { status: prevStatus })
    }
  }

  const [summaryBusyItemId, setSummaryBusyItemId] = useState(null)

  const handleCancelItem = async (orderId, itemId, itemName) => {
    if (!window.confirm(`Cancel "${itemName}" from this order?`)) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.rpc('cancel_order_item', { p_item_id: itemId })
    if (error) {
      toast.error('Failed to cancel item')
    } else {
      toast.success(`${itemName} cancelled`)
      refetch({ silent: true })
    }
  }

  const handleQuantityChange = async (order, item, newQty) => {
    if (summaryBusyItemId === item.id) return
    if (!navigator.onLine) { toast.error('Editing needs an internet connection'); return }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSummaryBusyItemId(item.id)
    const newItems = order.order_items.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
    patchOrder(order.id, { order_items: newItems, total_amount: computeOrderTotal(newItems, taxPercentage) })
    try {
      const { error } = await supabase.rpc('update_order_item_quantity', { p_item_id: item.id, p_quantity: newQty })
      if (error) throw error
    } catch (err) {
      toast.error(err.message || 'Failed to update quantity')
      refetch({ silent: true })
    } finally {
      setSummaryBusyItemId(null)
    }
  }

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this entire order? This cannot be undone.')) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId })
    if (error) {
      toast.error('Failed to cancel order')
    } else {
      toast.success('Order cancelled')
      refetch({ silent: true })
    }
  }

  // A table stays occupied until its bill is actually settled — not just
  // when the kitchen marks the order completed. Completed orders remain
  // here (and only leave once reset_table_billing deletes them at
  // settlement), so the table block only turns green again after billing.
  const ordersByTable = useMemo(() => {
    const map = {}
    for (const o of orders) {
      if (o.status === 'cancelled') continue
      if (!map[o.table_id]) map[o.table_id] = []
      map[o.table_id].push(o)
    }
    return map
  }, [orders])

  // Completed orders are what the bill is actually built from.
  const completedOrders = useMemo(() => orders.filter((o) => o.status === 'completed'), [orders])

  const filteredItems = useMemo(() => {
    let list = selectedCatId === 'all' ? menuItems : menuItems.filter((i) => i.category_id === selectedCatId)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q))
    }
    return list
  }, [menuItems, selectedCatId, search])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const syncQueue = useCallback(async () => {
    if (!restaurant?.id) return
    const queued = await getQueuedOrders()
    const mine = queued.filter((o) => o.restaurantId === restaurant.id)
    setPendingCount(mine.length)
    if (!navigator.onLine || mine.length === 0) return

    setSyncing(true)
    let synced = 0
    for (const order of mine) {
      try {
        const { error } = await supabase.rpc(order.rpc || 'admin_place_order', {
          p_restaurant_id: order.restaurantId,
          p_table_id:      order.tableId,
          p_items:         order.items,
          p_order_id:      order.orderId,
        })
        if (!error) { await removeQueuedOrder(order.id); synced++ }
      } catch { /* keep in queue, retry next time */ }
    }
    if (synced > 0) { toast.success(`${synced} queued order${synced > 1 ? 's' : ''} synced!`); refetch({ silent: true }) }
    const remaining = await getQueuedOrders()
    setPendingCount(remaining.filter((o) => o.restaurantId === restaurant.id).length)
    setSyncing(false)
  }, [restaurant?.id, refetch])

  useEffect(() => {
    syncQueue()
    window.addEventListener('online', syncQueue)
    return () => window.removeEventListener('online', syncQueue)
  }, [syncQueue])

  const openMenuFor = (tableId) => {
    clear()
    setSelectedCatId('all')
    setSearch('')
    setMenuTableId(tableId)
  }
  const closeMenu = () => { setMenuTableId(null); setCartOpen(false); clear() }

  const handlePlaceOrder = async () => {
    if (!entries.length || !menuTableId || placing) return
    setPlacing(true)

    const orderId = crypto.randomUUID()
    const table = tables.find((t) => t.id === menuTableId)
    // Open-order items send a custom name/price instead of a menu_item_id,
    // so the RPC never touches menu_items for them (see migration 31).
    const items = entries.map((e) => (
      e.item.isOpenItem
        ? { custom_name: e.item.name, custom_price: e.item.price, quantity: e.quantity, notes: '' }
        : { menu_item_id: e.item.id, quantity: e.quantity, notes: '' }
    ))
    const richItems = entries.map((e) => ({
      menu_item_id: e.item.isOpenItem ? null : e.item.id,
      item_name: e.item.name, unit_price: e.item.price, quantity: e.quantity, notes: '',
    }))
    const kotOrder = {
      id: orderId,
      order_time: new Date().toISOString(),
      total_amount: subtotal,
      tables: { table_number: table?.table_number },
      order_items: richItems.map((i) => ({ ...i, cancelled: false })),
    }

    const saveOffline = async () => {
      await enqueueOrder({
        orderId, rpc: 'admin_place_order', restaurantId: restaurant.id,
        tableId: menuTableId, tableNumber: table?.table_number, items, richItems,
      })
      setPendingCount((c) => c + 1)
      printKOT(kotOrder, restaurant?.name)
      toast.success(`Order saved offline for Table ${table?.table_number} — will sync when online`, { duration: 5000 })
      closeMenu()
    }

    if (!navigator.onLine) {
      try { await saveOffline() } catch { toast.error('Failed to save order offline') }
      setPlacing(false)
      return
    }

    try {
      const { error } = await supabase.rpc('admin_place_order', {
        p_restaurant_id: restaurant.id,
        p_table_id:      menuTableId,
        p_items:         items,
        p_order_id:      orderId,
      })
      if (error) throw error
      printKOT(kotOrder, restaurant?.name)
      toast.success('Order placed!')
      closeMenu()
      refetch({ silent: true })
    } catch (err) {
      if (isNetworkError(err)) {
        try { await saveOffline() } catch { toast.error('Failed to save order offline') }
      } else {
        toast.error(err.message || 'Failed to place order')
      }
    } finally {
      setPlacing(false)
    }
  }

  const menuTable = tables.find((t) => t.id === menuTableId)
  const summaryTable = tables.find((t) => t.id === summaryTableId)
  const summaryOrders = summaryTableId ? (ordersByTable[summaryTableId] || []) : []
  const billTable = tables.find((t) => t.id === billTableId)
  const billOrders = billTableId ? completedOrders.filter((o) => o.table_id === billTableId) : []

  if (dataLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-5 w-40 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square skeleton rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Floor View</h2>
        <p className="text-sm text-gray-400 mt-0.5">Tap a free table to order, or an occupied table to see its order</p>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">You are offline</p>
            <p className="text-xs text-amber-600">Orders are saved on this device and synced when internet returns.</p>
          </div>
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <RefreshCw className={`w-4 h-4 text-blue-600 flex-shrink-0 ${syncing ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-800">
              {syncing ? 'Syncing orders…' : `${pendingCount} order${pendingCount > 1 ? 's' : ''} pending sync`}
            </p>
          </div>
          {!syncing && (
            <button type="button" onClick={syncQueue} className="text-xs font-bold text-blue-600 bg-blue-100 rounded-xl px-3 py-1.5 hover:bg-blue-200 transition-colors flex-shrink-0">
              Sync now
            </button>
          )}
        </div>
      )}

      {tables.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl py-16 text-center">
          <ConciergeBell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-400">No tables configured yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map((t) => {
            const tableOrders = ordersByTable[t.id] || []
            return tableOrders.length === 0 ? (
              <FreeTableBlock key={t.id} table={t} onClick={() => openMenuFor(t.id)} />
            ) : (
              <OccupiedTableBlock
                key={t.id} table={t} orders={tableOrders} currency={currency}
                onClick={() => setSummaryTableId(t.id)}
              />
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {menuTableId && (
          <MenuOverlay
            table={menuTable} categories={categories} items={filteredItems} cart={cart}
            search={search} onSearch={setSearch}
            selectedCatId={selectedCatId} onSelectCat={setSelectedCatId}
            onAdd={add} onRemove={remove}
            totalQty={totalQty} subtotal={subtotal} currency={currency}
            onClose={closeMenu} onOpenCart={() => setCartOpen(true)}
            onOpenOrder={() => setOpenOrderModalOpen(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openOrderModalOpen && (
          <OpenOrderModal
            currency={currency}
            onClose={() => setOpenOrderModalOpen(false)}
            onAdd={add}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cartOpen && (
          <CartSheet
            entries={entries} subtotal={subtotal} currency={currency}
            onAdd={add} onRemove={remove} onClose={() => setCartOpen(false)}
            onPlace={handlePlaceOrder} placing={placing}
            tableNumber={menuTable?.table_number} isOnline={isOnline}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {summaryTableId && (
          <OrderSummaryPanel
            table={summaryTable} orders={summaryOrders} currency={currency}
            restaurantName={restaurant?.name}
            onClose={() => setSummaryTableId(null)}
            onAddItems={() => { setSummaryTableId(null); openMenuFor(summaryTableId) }}
            onGoToBilling={() => { setBillTableId(summaryTableId); setSummaryTableId(null) }}
            onStatusChange={handleStatusChange}
            onQuantityChange={handleQuantityChange}
            onCancelItem={handleCancelItem}
            onCancelOrder={handleCancelOrder}
            busyItemId={summaryBusyItemId}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {billTableId && (
          <BillPanel
            table={billTable} tableOrders={billOrders} currency={currency}
            taxPercentage={taxPercentage} restaurant={restaurant} isOnline={isOnline}
            checkAdminLimit={checkAdminLimit} userId={user?.id}
            menuItems={menuItems} patchOrder={patchOrder} refetch={refetch}
            onClose={() => setBillTableId(null)}
            onSettled={() => setBillTableId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
