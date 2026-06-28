import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, X, ConciergeBell, ChevronDown, Search, WifiOff, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'
import { printKOT } from '../../utils/kotPrint'
import { enqueueOrder, getQueuedOrders, removeQueuedOrder } from '../../utils/offlineQueue'

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

  const [tables, setTables]       = useState([])
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  const [selectedTableId, setSelectedTableId] = useState('')
  const [selectedCatId, setSelectedCatId]     = useState('all')
  const [search, setSearch]                   = useState('')
  const [cartOpen, setCartOpen]               = useState(false)
  const [placing, setPlacing]                 = useState(false)
  const [isOnline, setIsOnline]               = useState(navigator.onLine)
  const [pendingCount, setPendingCount]       = useState(0)
  const [syncing, setSyncing]                 = useState(false)

  const { cart, entries, totalQty, subtotal, add, remove, setNote, clear } = useCart()

  const fetchData = useCallback(async () => {
    if (!restaurant?.id) return
    setDataLoading(true)
    const [tablesRes, catsRes, itemsRes] = await Promise.all([
      supabase.from('tables').select('id, table_number').eq('restaurant_id', restaurant.id).order('table_number'),
      supabase.from('categories').select('id, name, display_order').eq('restaurant_id', restaurant.id).order('display_order'),
      supabase.from('menu_items').select('id, name, price, category_id, available').eq('restaurant_id', restaurant.id).eq('available', true).order('name'),
    ])
    if (!tablesRes.error) setTables(tablesRes.data || [])
    if (!catsRes.error)   setCategories(catsRes.data || [])
    if (!itemsRes.error)  setMenuItems(itemsRes.data || [])
    setDataLoading(false)
  }, [restaurant.id])

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
        const { error } = await supabase.rpc('admin_place_order', {
          p_restaurant_id: order.restaurantId,
          p_table_id:      order.tableId,
          p_items:         order.items,
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

    const tax = Math.round(subtotal * taxPercentage) / 100
    const totalAmount = subtotal + tax

    const items = entries.map(({ item, quantity, notes }) => ({
      menu_item_id: item.id,
      quantity,
      notes: notes || '',
    }))

    // Build a local order object for KOT (no server ID needed)
    const kotOrder = {
      id: `local-${Date.now()}`,
      order_time: new Date().toISOString(),
      total_amount: totalAmount,
      tables: { table_number: selectedTableNumber },
      order_items: entries.map(({ item, quantity, notes }) => ({
        item_name: item.name,
        quantity,
        notes: notes || '',
        cancelled: false,
      })),
    }

    if (!navigator.onLine) {
      try {
        await enqueueOrder({
          restaurantId:  restaurant.id,
          tableId:       selectedTableId,
          tableNumber:   selectedTableNumber,
          items,
          totalAmount,
        })
        setPendingCount((c) => c + 1)
        printKOT(kotOrder, restaurant?.name)
        toast.success(`Order saved offline for Table ${selectedTableNumber} — will sync when online`, { duration: 5000 })
        clear()
        setCartOpen(false)
      } catch {
        toast.error('Failed to save order offline')
      }
      setPlacing(false)
      return
    }

    try {
      const { error } = await supabase.rpc('admin_place_order', {
        p_restaurant_id: restaurant.id,
        p_table_id:      selectedTableId,
        p_items:         items,
      })
      if (error) throw error
      printKOT(kotOrder, restaurant?.name)
      toast.success(`Order placed for Table ${selectedTableNumber}!`)
      clear()
      setCartOpen(false)
    } catch (err) {
      toast.error(err.message || 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  if (dataLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="skeleton h-10 rounded-xl w-44" />
          <div className="skeleton h-10 rounded-xl flex-1" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-9 w-24 rounded-full" />)}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
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

      {/* Table selector + search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            className="input pr-9 appearance-none font-semibold text-gray-800 min-w-[160px]"
          >
            <option value="">Select table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>Table {t.table_number}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search" value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedCatId('all') }}
            placeholder="Search items…"
            className="input pl-9 w-full"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ id: 'all', name: 'All' }, ...categories].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => { setSelectedCatId(cat.id); setSearch('') }}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all
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
    </div>
  )
}
