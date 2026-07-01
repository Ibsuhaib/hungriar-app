import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ConciergeBell, ChevronLeft, Plus, Minus, ShoppingCart,
  X, ClipboardList, Clock, CheckCircle2, XCircle, Loader2,
  LogOut, Search,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'

// ─── Cart hook (same shape as TakeOrder) ──────────────────────────────────────
function useCart() {
  const [cart, setCart] = useState({})
  const add    = (item) => setCart((p) => ({ ...p, [item.id]: { item, quantity: (p[item.id]?.quantity ?? 0) + 1 } }))
  const remove = (id)   => setCart((p) => {
    const qty = (p[id]?.quantity ?? 0) - 1
    if (qty <= 0) { const n = { ...p }; delete n[id]; return n }
    return { ...p, [id]: { ...p[id], quantity: qty } }
  })
  const clear  = ()     => setCart({})
  const entries    = Object.values(cart)
  const totalQty   = entries.reduce((s, e) => s + e.quantity, 0)
  const subtotal   = entries.reduce((s, e) => s + e.item.price * e.quantity, 0)
  return { cart, entries, totalQty, subtotal, add, remove, clear }
}

const STATUS_META = {
  pending:    { label: 'Pending',    color: 'text-amber-600 bg-amber-50  border-amber-100' },
  preparing:  { label: 'Preparing',  color: 'text-blue-600  bg-blue-50   border-blue-100'  },
  ready:      { label: 'Ready',      color: 'text-green-600 bg-green-50  border-green-100' },
  cancelled:  { label: 'Cancelled',  color: 'text-red-500   bg-red-50    border-red-100'   },
  completed:  { label: 'Completed',  color: 'text-gray-500  bg-gray-50   border-gray-100'  },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${m.color}`}>
      {m.label}
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function StaffPanel() {
  const { restaurant, signOut } = useAuth()
  const currency = restaurant?.currency ?? '₹'

  // ── Shared data ─────────────────────────────────────────────────────────
  const [tables,     setTables]     = useState([])
  const [categories, setCategories] = useState([])
  const [menuItems,  setMenuItems]  = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  // ── Navigation state ────────────────────────────────────────────────────
  const [tab,            setTab]            = useState('order')   // 'order' | 'active'
  const [selectedTableId, setSelectedTableId] = useState('')
  const [selectedCatId,   setSelectedCatId]   = useState('all')
  const [search,          setSearch]          = useState('')
  const [cartOpen,        setCartOpen]        = useState(false)
  const [placing,         setPlacing]         = useState(false)

  const { cart, entries, totalQty, subtotal, add, remove, clear } = useCart()

  const fetchData = useCallback(async () => {
    if (!restaurant?.id) return
    setDataLoading(true)
    const [t, c, m] = await Promise.all([
      supabase.from('tables').select('id, table_number').eq('restaurant_id', restaurant.id).order('table_number'),
      supabase.from('categories').select('id, name, display_order').eq('restaurant_id', restaurant.id).order('display_order'),
      supabase.from('menu_items').select('id, name, price, category_id, available').eq('restaurant_id', restaurant.id).eq('available', true).order('name'),
    ])
    if (!t.error) setTables(t.data ?? [])
    if (!c.error) setCategories(c.data ?? [])
    if (!m.error) setMenuItems(m.data ?? [])
    setDataLoading(false)
  }, [restaurant?.id])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Active orders (realtime) ─────────────────────────────────────────────
  const { orders, loading: ordersLoading, refetch } = useRealtimeOrders({
    restaurantId: restaurant?.id,
    pollInterval: 5000,
  })

  const activeOrders = useMemo(
    () => orders
      .filter((o) => o.status !== 'completed' && o.status !== 'cancelled')
      .sort((a, b) => new Date(b.order_time) - new Date(a.order_time)),
    [orders],
  )

  // ── Filtered menu items ──────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let list = selectedCatId === 'all' ? menuItems : menuItems.filter((i) => i.category_id === selectedCatId)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((i) => i.name.toLowerCase().includes(q))
    }
    return list
  }, [menuItems, selectedCatId, search])

  // ── Place order ──────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!entries.length || !selectedTableId || placing) return
    setPlacing(true)
    try {
      const items = entries.map((e) => ({ menu_item_id: e.item.id, quantity: e.quantity, notes: '' }))
      const { error } = await supabase.rpc('staff_place_order', {
        p_restaurant_id: restaurant.id,
        p_table_id: selectedTableId,
        p_items: items,
      })
      if (error) throw error
      toast.success('Order placed!')
      clear()
      setCartOpen(false)
      setSelectedTableId('')
      setSelectedCatId('all')
      setSearch('')
      setTab('active')
      refetch({ silent: true })
    } catch (err) {
      toast.error(err.message || 'Failed to place order')
    } finally {
      setPlacing(false)
    }
  }

  // ── Cancel order ─────────────────────────────────────────────────────────
  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return
    const { error } = await supabase.rpc('staff_cancel_order', { p_order_id: orderId })
    if (error) {
      toast.error('Failed to cancel order')
    } else {
      toast.success('Order cancelled')
      refetch({ silent: true })
    }
  }

  const selectedTable = tables.find((t) => t.id === selectedTableId)

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <ConciergeBell className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">Staff Panel</p>
              <p className="text-xs text-gray-400 leading-none mt-0.5">{restaurant?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Active orders count badge */}
            {activeOrders.length > 0 && (
              <button
                type="button"
                onClick={() => setTab('active')}
                className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1"
              >
                <Clock className="w-3 h-3" />
                {activeOrders.length}
              </button>
            )}
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1.5 font-medium hover:bg-gray-200 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Sign out
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-3xl mx-auto px-4 pb-2 flex gap-1">
          {[{ id: 'order', label: 'New Order', icon: ConciergeBell }, { id: 'active', label: 'Active Orders', icon: ClipboardList }].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === id ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-4">

        {/* ── NEW ORDER TAB ───────────────────────────────────────────────── */}
        {tab === 'order' && (
          <>
            {/* Step 1: Table grid */}
            {!selectedTableId && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Select a table</p>
                {dataLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-square skeleton rounded-2xl" />
                    ))}
                  </div>
                ) : tables.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-12">No tables configured yet.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {tables.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setSelectedTableId(t.id); setSelectedCatId('all'); setSearch('') }}
                        className="aspect-square flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-gray-100 shadow-sm hover:border-primary-300 hover:shadow-md active:scale-95 transition-all"
                      >
                        <ConciergeBell className="w-6 h-6 text-primary-400 mb-1" />
                        <span className="text-xs font-bold text-gray-700">{t.table_number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Menu */}
            {selectedTableId && (
              <div>
                {/* Back + table info */}
                <div className="flex items-center gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => { setSelectedTableId(''); clear(); setCartOpen(false) }}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Tables
                  </button>
                  <span className="text-sm text-gray-400">›</span>
                  <span className="text-sm font-bold text-gray-800">Table {selectedTable?.table_number}</span>
                  {totalQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setCartOpen(true)}
                      className="ml-auto flex items-center gap-1.5 bg-primary-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" /> {totalQty}
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search items…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input pl-9 text-sm"
                  />
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setSelectedCatId('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedCatId === 'all' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
                  >
                    All
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCatId(c.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${selectedCatId === c.id ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-300'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* Items grid */}
                {dataLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-2xl" />)}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-12">No items found.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredItems.map((item) => {
                      const qty = cart[item.id]?.quantity ?? 0
                      return (
                        <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col">
                          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 flex-1">{item.name}</p>
                          <p className="text-sm font-bold text-primary-600 mt-1">{formatCurrency(item.price, currency)}</p>
                          <div className="mt-2">
                            {qty === 0 ? (
                              <button
                                type="button"
                                onClick={() => add(item)}
                                className="w-full flex items-center justify-center gap-1 py-1.5 rounded-xl bg-primary-50 text-primary-600 text-xs font-bold hover:bg-primary-100 transition-colors border border-primary-100"
                              >
                                <Plus className="w-3 h-3" /> Add
                              </button>
                            ) : (
                              <div className="flex items-center justify-between bg-primary-50 rounded-xl border border-primary-100 px-1">
                                <button type="button" onClick={() => remove(item.id)} className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg">
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-sm font-bold text-primary-700">{qty}</span>
                                <button type="button" onClick={() => add(item)} className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg">
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
            )}
          </>
        )}

        {/* ── ACTIVE ORDERS TAB ───────────────────────────────────────────── */}
        {tab === 'active' && (
          <div className="space-y-3">
            {ordersLoading && activeOrders.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-2xl" />)
            ) : activeOrders.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No active orders right now.</p>
              </div>
            ) : (
              activeOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800 text-sm">Table {order.tables?.table_number ?? '?'}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    {order.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.id)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {(order.order_items ?? [])
                      .filter((it) => it.status !== 'cancelled')
                      .map((it) => (
                        <li key={it.id} className="flex justify-between text-sm text-gray-600">
                          <span>{it.quantity}× {it.menu_item_name}</span>
                          <span className="font-medium">{formatCurrency(it.unit_price * it.quantity, currency)}</span>
                        </li>
                      ))
                    }
                  </ul>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(order.order_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Cart drawer ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div
              key="cart-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setCartOpen(false)}
            />
            <motion.div
              key="cart-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Order for Table {selectedTable?.table_number}</h3>
                <button type="button" onClick={() => setCartOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                {entries.map((e) => (
                  <div key={e.item.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{e.quantity}× {e.item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatCurrency(e.item.price * e.quantity, currency)}</span>
                      <button type="button" onClick={() => remove(e.item.id)} className="text-gray-400 hover:text-red-400">
                        <Minus className="w-3.5 h-3.5" />
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

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={placing}
                className="btn-primary w-full py-3 gap-2"
              >
                {placing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</>
                  : `Place Order (${totalQty} item${totalQty !== 1 ? 's' : ''})`}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating cart button (shown when on menu step with items) */}
      {tab === 'order' && selectedTableId && totalQty > 0 && !cartOpen && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-30 pointer-events-none">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto flex items-center gap-2 bg-primary-600 text-white font-bold px-6 py-3.5 rounded-2xl shadow-xl hover:bg-primary-700 active:scale-95 transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            View Cart · {totalQty} item{totalQty !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
