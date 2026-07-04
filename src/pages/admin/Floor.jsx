import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Minus, Search, ShoppingCart, Loader2, Clock,
  ClipboardList, Receipt, ConciergeBell, WifiOff, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'
import { printKOT } from '../../utils/kotPrint'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { enqueueOrder, getQueuedOrders, removeQueuedOrder, isNetworkError } from '../../utils/offlineQueue'
import { pageCache } from '../../utils/pageCache'

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
  pending:   { label: 'Pending',   color: 'text-amber-700 bg-amber-100' },
  preparing: { label: 'Preparing', color: 'text-blue-700  bg-blue-100'  },
  ready:     { label: 'Ready',     color: 'text-green-700 bg-green-100' },
  served:    { label: 'Served',    color: 'text-gray-600  bg-gray-100'  },
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

// ─── Menu overlay (opens for a free table, or "Add Items" on an occupied one) ─

function MenuOverlay({
  table, categories, items, cart, search, onSearch, selectedCatId, onSelectCat,
  onAdd, onRemove, totalQty, subtotal, currency, onClose, onOpenCart,
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
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search" value={search} onChange={(e) => onSearch(e.target.value)}
            placeholder="Search items…" className="input pl-9 w-full"
          />
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
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-30 pointer-events-none">
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
        className="fixed bottom-0 inset-x-0 z-[60] bg-white rounded-t-3xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Order for Table {tableNumber}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
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

function OrderSummaryPanel({ table, orders, currency, onClose, onAddItems, onGoToOrders, onGoToBilling }) {
  const allItems = orders.flatMap((o) => (o.order_items || []).filter((i) => !i.cancelled))
  const subtotal = orders.reduce((s, o) => s + Number(o.total_amount), 0)
  const status = tableOverallStatus(orders)
  const meta = STATUS_META[status] ?? STATUS_META.pending
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
        className="fixed bottom-0 inset-x-0 z-[60] bg-white rounded-t-3xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-900">Table {table?.table_number}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full mb-4 ${meta.color}`}>{meta.label}</span>

        <div className="space-y-1.5 mb-4">
          {allItems.map((it) => (
            <div key={it.id} className="flex justify-between text-sm text-gray-700">
              <span>{it.quantity}× {it.item_name}</span>
              <span className="font-medium">{formatCurrency(it.unit_price * it.quantity, currency)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-3 mb-5">
          <div className="flex justify-between text-sm font-bold text-gray-900">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal, currency)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button" onClick={onAddItems}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-50 text-primary-700 text-sm font-bold border border-primary-100 hover:bg-primary-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Items
          </button>
          <button
            type="button" onClick={onGoToOrders}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-50 text-gray-700 text-sm font-bold border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            <ClipboardList className="w-4 h-4" /> View Kitchen Status
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Floor() {
  const { restaurant } = useAuth()
  const navigate = useNavigate()
  const currency = restaurant?.currency || '₹'

  const cacheKey = `floor-${restaurant?.id}`
  const cache = pageCache.get(cacheKey) || {}
  const [tables, setTables] = useState(() => cache.tables || [])
  const [categories, setCategories] = useState(() => cache.categories || [])
  const [menuItems, setMenuItems] = useState(() => cache.menuItems || [])
  const [dataLoading, setDataLoading] = useState(!cache.tables)

  const [menuTableId, setMenuTableId] = useState(null)
  const [summaryTableId, setSummaryTableId] = useState(null)
  const [selectedCatId, setSelectedCatId] = useState('all')
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
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

  const { orders, refetch } = useRealtimeOrders({ restaurantId: restaurant?.id, pollInterval: 5000 })

  const ordersByTable = useMemo(() => {
    const map = {}
    for (const o of orders) {
      if (o.status === 'completed' || o.status === 'cancelled') continue
      if (!map[o.table_id]) map[o.table_id] = []
      map[o.table_id].push(o)
    }
    return map
  }, [orders])

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
    const items = entries.map((e) => ({ menu_item_id: e.item.id, quantity: e.quantity, notes: '' }))
    const richItems = entries.map((e) => ({
      menu_item_id: e.item.id, item_name: e.item.name, unit_price: e.item.price, quantity: e.quantity, notes: '',
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
            onClose={() => setSummaryTableId(null)}
            onAddItems={() => { setSummaryTableId(null); openMenuFor(summaryTableId) }}
            onGoToOrders={() => navigate('/admin/orders')}
            onGoToBilling={() => navigate('/admin/billing')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
