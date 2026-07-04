import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, X, ConciergeBell, ChevronLeft, Search, WifiOff, RefreshCw, PenLine } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'
import { printKOT } from '../../utils/kotPrint'
import { enqueueOrder, getQueuedOrders, removeQueuedOrder, isNetworkError } from '../../utils/offlineQueue'
import { pageCache } from '../../utils/pageCache'

// ─── Cart hook ────────────────────────────────────────────────────────────────

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

  const setNote = (itemId, notes) =>
    setCart((prev) => prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], notes } } : prev)

  const clear = () => setCart({})

  const entries = Object.values(cart)
  const totalQty = entries.reduce((s, e) => s + e.quantity, 0)
  const subtotal = entries.reduce((s, e) => s + e.item.price * e.quantity, 0)

  return { cart, entries, totalQty, subtotal, add, remove, setNote, clear }
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({ item, qty, onAdd, onRemove, currency }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
      <div className="flex-1 px-3 pt-3 pb-2">
        <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 min-h-[2.5rem]">{item.name}</p>
        <p className="text-sm font-bold text-primary-600 mt-1">{formatCurrency(item.price, currency)}</p>
      </div>
      <div className="px-3 pb-3">
        {qty === 0 ? (
          <button
            type="button"
            onClick={() => onAdd(item)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-primary-50 text-primary-600 text-xs font-bold hover:bg-primary-100 transition-colors border border-primary-100"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        ) : (
          <div className="flex items-center justify-between bg-primary-600 rounded-xl px-1 py-0.5">
            <button type="button" onClick={() => onRemove(item.id)}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 rounded-lg transition-colors">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-white text-sm font-bold tabular-nums">{qty}</span>
            <button type="button" onClick={() => onAdd(item)}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Open Order modal ─────────────────────────────────────────────────────────
// For one-off customer requests that aren't in the menu — a custom name +
// price goes straight into the cart. Never written to menu_items.

function OpenOrderModal({ currency, onClose, onAdd }) {
  const [name, setName]   = useState('')
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
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
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

// ─── Cart sheet ───────────────────────────────────────────────────────────────

function CartSheet({ entries, subtotal, taxPercentage, currency, onRemove, onAdd, onSetNote, onClose, onPlace, placing, selectedTable }) {
  const tax = Math.round(subtotal * taxPercentage) / 100
  const total = subtotal + tax

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">Order Summary</h2>
          {selectedTable && (
            <span className="text-xs font-bold bg-primary-100 text-primary-700 px-3 py-1 rounded-full">
              Table {selectedTable}
            </span>
          )}
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
          {entries.map(({ item, quantity, notes }) => (
            <div key={item.id} className="space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{formatCurrency(item.price, currency)} × {quantity}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-1 py-0.5">
                    <button type="button" onClick={() => onRemove(item.id)}
                      className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-500 rounded-lg">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold text-gray-900 w-5 text-center tabular-nums">{quantity}</span>
                    <button type="button" onClick={() => onAdd(item)}
                      className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-primary-600 rounded-lg">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-gray-900 w-16 text-right">
                    {formatCurrency(item.price * quantity, currency)}
                  </span>
                </div>
              </div>
              <input
                type="text" value={notes}
                onChange={(e) => onSetNote(item.id, e.target.value)}
                placeholder="Note (e.g. no onions)…" maxLength={200}
                className="w-full text-xs border border-gray-200 bg-gray-50 rounded-lg px-3 py-1.5 text-gray-600 placeholder-gray-300 focus:outline-none focus:border-primary-300 transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 space-y-3 flex-shrink-0">
          <div className="space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{formatCurrency(subtotal, currency)}</span>
            </div>
            {taxPercentage > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax ({taxPercentage}%)</span><span>{formatCurrency(tax, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-dashed border-gray-200">
              <span>Total</span><span>{formatCurrency(total, currency)}</span>
            </div>
          </div>
          {!selectedTable && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-center">
              Select a table before placing the order
            </p>
          )}
          <button
            type="button" onClick={onPlace}
            disabled={placing || !selectedTable || entries.length === 0}
            className="w-full bg-primary-600 hover:bg-primary-500 text-white py-3 rounded-2xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {placing
              ? (navigator.onLine ? 'Placing order…' : 'Saving offline…')
              : navigator.onLine
                ? `Place Order · ${formatCurrency(total, currency)}`
                : `Save Offline · ${formatCurrency(total, currency)}`
            }
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TakeOrder() {
  const { restaurant } = useAuth()
  const currency = restaurant?.currency || '₹'
  const taxPercentage = Number(restaurant?.tax_percentage) || 0

  const toCacheKey = `takeorder-${restaurant?.id}`
  const toCache    = pageCache.get(toCacheKey) || {}

  const [tables, setTables]           = useState(() => toCache.tables || [])
  const [categories, setCategories]   = useState(() => toCache.categories || [])
  const [menuItems, setMenuItems]     = useState(() => toCache.menuItems || [])
  const [dataLoading, setDataLoading] = useState(!toCache.tables)

  const [selectedTableId, setSelectedTableId] = useState('')
  const [selectedCatId, setSelectedCatId]     = useState('all')
  const [search, setSearch]                   = useState('')
  const [cartOpen, setCartOpen]               = useState(false)
  const [openOrderModalOpen, setOpenOrderModalOpen] = useState(false)
  const [placing, setPlacing]                 = useState(false)
  const [isOnline, setIsOnline]               = useState(navigator.onLine)
  const [pendingCount, setPendingCount]       = useState(0)
  const [syncing, setSyncing]                 = useState(false)

  const { cart, entries, totalQty, subtotal, add, remove, setNote, clear } = useCart()

  const fetchData = useCallback(async () => {
    if (!restaurant?.id) return
    if (!pageCache.has(toCacheKey)) setDataLoading(true)
    const [tablesRes, catsRes, itemsRes] = await Promise.all([
      supabase.from('tables').select('id, table_number').eq('restaurant_id', restaurant.id).order('table_number'),
      supabase.from('categories').select('id, name, display_order').eq('restaurant_id', restaurant.id).order('display_order'),
      supabase.from('menu_items').select('id, name, price, category_id, available').eq('restaurant_id', restaurant.id).eq('available', true).order('name'),
    ])
    const t = tablesRes.data   || []
    const c = catsRes.data     || []
    const m = itemsRes.data    || []
    if (!tablesRes.error) setTables(t)
    if (!catsRes.error)   setCategories(c)
    if (!itemsRes.error)  setMenuItems(m)
    pageCache.set(toCacheKey, { tables: t, categories: c, menuItems: m })
    setDataLoading(false)
  }, [restaurant.id, toCacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  // Track online/offline state
  useEffect(() => {
    const setOnline  = () => setIsOnline(true)
    const setOffline = () => setIsOnline(false)
    window.addEventListener('online',  setOnline)
    window.addEventListener('offline', setOffline)
    return () => {
      window.removeEventListener('online',  setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  // Load pending count + sync when online
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
        // p_order_id makes replay idempotent — re-syncing an already-placed
        // order is a server-side no-op instead of a duplicate.
        const { error } = await supabase.rpc(order.rpc || 'admin_place_order', {
          p_restaurant_id: order.restaurantId,
          p_table_id:      order.tableId,
          p_items:         order.items,
          p_order_id:      order.orderId,
        })
        if (!error) { await removeQueuedOrder(order.id); synced++ }
      } catch { /* keep in queue, retry next time */ }
    }
    if (synced > 0) toast.success(`${synced} queued order${synced > 1 ? 's' : ''} synced to server!`)
    const remaining = await getQueuedOrders()
    setPendingCount(remaining.filter((o) => o.restaurantId === restaurant.id).length)
    setSyncing(false)
  }, [restaurant?.id])

  useEffect(() => {
    syncQueue()
    window.addEventListener('online', syncQueue)
    return () => window.removeEventListener('online', syncQueue)
  }, [syncQueue])

  // Items for the selected category + search
  const filteredItems = useMemo(() => {
    let list = selectedCatId === 'all' ? menuItems : menuItems.filter((i) => i.category_id === selectedCatId)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q))
    }
    return list
  }, [menuItems, selectedCatId, search])

  const selectedTableNumber = tables.find((t) => t.id === selectedTableId)?.table_number

  const handlePlaceOrder = async () => {
    if (!selectedTableId || entries.length === 0 || placing) return
    setPlacing(true)

    // Stable client-generated id so an offline order that later syncs (via this
    // page or the Billing page) can never be inserted twice.
    const orderId = crypto.randomUUID()

    const tax = Math.round(subtotal * taxPercentage) / 100
    const totalAmount = subtotal + tax

    // items for Supabase RPC — open-order items send a custom name/price
    // instead of a menu_item_id, so the RPC never touches menu_items for them.
    const items = entries.map(({ item, quantity, notes }) => (
      item.isOpenItem
        ? { custom_name: item.name, custom_price: item.price, quantity, notes: notes || '' }
        : { menu_item_id: item.id, quantity, notes: notes || '' }
    ))

    // richItems includes name + price for offline display in Billing page
    const richItems = entries.map(({ item, quantity, notes }) => ({
      menu_item_id: item.isOpenItem ? null : item.id,
      item_name:    item.name,
      unit_price:   item.price,
      quantity,
      notes: notes || '',
    }))

    // Build a local order object for KOT
    const kotOrder = {
      id: orderId,
      order_time: new Date().toISOString(),
      total_amount: totalAmount,
      tables: { table_number: selectedTableNumber },
      order_items: richItems.map((i) => ({ ...i, cancelled: false })),
    }

    // Save to the on-device queue (used both when known-offline and when a live
    // request fails because the internet is actually down despite navigator.onLine).
    const saveOffline = async () => {
      await enqueueOrder({
        orderId,                    // stable id → idempotent replay
        rpc:           'admin_place_order',
        restaurantId:  restaurant.id,
        tableId:       selectedTableId,
        tableNumber:   selectedTableNumber,
        items,        // for Supabase sync
        richItems,    // for offline billing display
        totalAmount,
      })
      setPendingCount((c) => c + 1)
      printKOT(kotOrder, restaurant?.name)
      toast.success(`Order saved offline for Table ${selectedTableNumber} — will sync when online`, { duration: 5000 })
      clear()
      setCartOpen(false)
    }

    if (!navigator.onLine) {
      try { await saveOffline() } catch { toast.error('Failed to save order offline') }
      setPlacing(false)
      return
    }

    try {
      const { error } = await supabase.rpc('admin_place_order', {
        p_restaurant_id: restaurant.id,
        p_table_id:      selectedTableId,
        p_items:         items,
        p_order_id:      orderId,
      })
      if (error) throw error
      printKOT(kotOrder, restaurant?.name)
      toast.success(`Order placed for Table ${selectedTableNumber}!`)
      clear()
      setCartOpen(false)
    } catch (err) {
      // navigator.onLine can be true on a WiFi with no real internet. If the
      // request failed for a network reason, queue it instead of losing it —
      // idempotent p_order_id makes the later replay safe.
      if (isNetworkError(err)) {
        try { await saveOffline() } catch { toast.error('Failed to save order offline') }
      } else {
        toast.error(err.message || 'Failed to place order')
      }
    } finally {
      setPlacing(false)
    }
  }

  if (dataLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-5 w-40 rounded-lg" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-28">

      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">You are offline</p>
            <p className="text-xs text-amber-600">Orders will be saved on this device and synced when internet returns.</p>
          </div>
        </div>
      )}

      {/* Pending sync banner */}
      {isOnline && pendingCount > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <RefreshCw className={`w-4 h-4 text-blue-600 flex-shrink-0 ${syncing ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-800">
              {syncing ? 'Syncing orders…' : `${pendingCount} order${pendingCount > 1 ? 's' : ''} pending sync`}
            </p>
            <p className="text-xs text-blue-600">These were taken while offline and are being synced now.</p>
          </div>
          {!syncing && (
            <button type="button" onClick={syncQueue} className="text-xs font-bold text-blue-600 bg-blue-100 rounded-xl px-3 py-1.5 hover:bg-blue-200 transition-colors flex-shrink-0">
              Sync now
            </button>
          )}
        </div>
      )}

      {selectedTableId === '' ? (
        /* ── Step 1: pick a table ──────────────────────────────────────── */
        <>
          <div>
            <h2 className="text-base font-bold text-gray-900">Select a Table</h2>
            <p className="text-sm text-gray-400 mt-0.5">Tap a table to start taking its order</p>
          </div>
          {tables.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl py-16 text-center">
              <ConciergeBell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">No tables yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTableId(t.id)}
                  className="aspect-square flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-gray-200 bg-white hover:border-primary-400 hover:bg-primary-50 active:scale-95 transition-all shadow-sm"
                >
                  <ConciergeBell className="w-5 h-5 text-gray-300" />
                  <span className="text-base font-bold text-gray-800">Table {t.table_number}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ── Step 2: browse menu for the selected table ───────────────── */
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={() => { setSelectedTableId(''); setSelectedCatId('all'); setSearch(''); clear() }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" /> Table {selectedTableNumber}
            </button>

            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="search" value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedCatId('all') }}
                placeholder="Search items…"
                className="input pl-9 w-full"
              />
            </div>

            <button
              type="button"
              onClick={() => setOpenOrderModalOpen(true)}
              title="Add a custom item not in the menu"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-primary-300 bg-primary-50 text-sm font-semibold text-primary-600 hover:bg-primary-100 transition-colors flex-shrink-0"
            >
              <PenLine className="w-4 h-4" /> Open Order
            </button>
          </div>

          {/* Category grid — every category visible at once, no side scroll */}
          <div className="flex flex-wrap gap-2">
            {[{ id: 'all', name: 'All' }, ...categories].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setSelectedCatId(cat.id); setSearch('') }}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all
                  ${selectedCatId === cat.id
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300 hover:text-primary-600'
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          {filteredItems.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl py-16 text-center">
              <ConciergeBell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-400">No items found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  qty={cart[item.id]?.quantity ?? 0}
                  onAdd={add}
                  onRemove={remove}
                  currency={currency}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Floating cart bar */}
      <AnimatePresence>
        {totalQty > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed bottom-4 left-4 right-4 z-30 max-w-3xl mx-auto"
          >
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="w-full flex items-center justify-between gap-3 bg-primary-600 text-white rounded-2xl px-5 py-3.5 shadow-xl shadow-primary-900/30 hover:bg-primary-500 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-white/20 rounded-xl flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold">
                  {totalQty} item{totalQty !== 1 ? 's' : ''}
                  {selectedTableNumber && ` · Table ${selectedTableNumber}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">
                  {formatCurrency(subtotal + Math.round(subtotal * taxPercentage) / 100, currency)}
                </span>
                <span className="text-xs bg-white/20 rounded-lg px-2 py-0.5 font-semibold">Review →</span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart sheet */}
      <AnimatePresence>
        {cartOpen && (
          <CartSheet
            entries={entries}
            subtotal={subtotal}
            taxPercentage={taxPercentage}
            currency={currency}
            onAdd={add}
            onRemove={remove}
            onSetNote={setNote}
            onClose={() => setCartOpen(false)}
            onPlace={handlePlaceOrder}
            placing={placing}
            selectedTable={selectedTableNumber}
          />
        )}
      </AnimatePresence>

      {/* Open Order modal */}
      <AnimatePresence>
        {openOrderModalOpen && (
          <OpenOrderModal
            currency={currency}
            onClose={() => setOpenOrderModalOpen(false)}
            onAdd={add}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
