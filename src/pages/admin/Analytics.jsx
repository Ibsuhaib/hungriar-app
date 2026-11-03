import { useCallback, useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  TrendingUp, ShoppingBag, DollarSign, Award,
  Banknote, Smartphone, CreditCard, Wallet,
  Tag, RotateCcw, TrendingDown, HandCoins, X, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, invokeEdgeFunction } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../utils/formatters'

const CHART_COLORS = ['#e76f51', '#2a9d8f', '#f4a261', '#264653', '#e9c46a', '#a8dadc']

const PAYMENT_META = {
  cash:  { label: 'Cash',  Icon: Banknote,   bg: 'bg-green-50',   icon: 'bg-gradient-to-br from-green-400 to-green-600',   text: 'text-green-700'  },
  upi:   { label: 'UPI',   Icon: Smartphone, bg: 'bg-blue-50',    icon: 'bg-gradient-to-br from-blue-400 to-blue-600',     text: 'text-blue-700'   },
  card:  { label: 'Card',  Icon: CreditCard, bg: 'bg-violet-50',  icon: 'bg-gradient-to-br from-violet-400 to-violet-600', text: 'text-violet-700' },
  other: { label: 'Other', Icon: Wallet,     bg: 'bg-amber-50',   icon: 'bg-gradient-to-br from-amber-400 to-amber-600',   text: 'text-amber-700'  },
}
function getMeta(method) {
  const key = (method || 'cash').toLowerCase()
  return PAYMENT_META[key] || { ...PAYMENT_META.other, label: method }
}

// ─── Collect bottom sheet ─────────────────────────────────────────────────────

function CollectSheet({ method, netAmount, currency, onClose, onSave, saving }) {
  const meta = getMeta(method)
  const Icon = meta.Icon
  const [amount, setAmount] = useState(netAmount > 0 ? String(Math.floor(netAmount)) : '')
  const [note,   setNote]   = useState(`${meta.label} collection`)

  const handleSubmit = (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    onSave({ method, amount: amt, note: note.trim() || `${meta.label} collection` })
  }

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
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl pb-safe"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.icon} shadow-sm flex-shrink-0`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-bold text-gray-900">Collect {meta.label}</h2>
              <p className="text-xs text-gray-400">
                Net available: <span className="font-semibold text-gray-600">{formatCurrency(netAmount, currency)}</span>
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Amount to Collect</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                autoFocus
                className="input w-full text-lg font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Note</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                className="input w-full"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !amount || Number(amount) <= 0}
              className="w-full py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
            >
              {saving ? 'Recording…' : `Record ${meta.label} Collection`}
            </button>
          </form>
        </div>
      </motion.div>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-gray-900 px-3 py-2.5 shadow-lg">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {currency ? formatCurrency(entry.value, currency) : entry.value}
        </p>
      ))}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className={`card flex items-center gap-4 ${color.bg}`}>
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${color.icon} shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium opacity-70 ${color.text}`}>{label}</p>
        <p className={`text-xl font-bold leading-none mt-0.5 font-display truncate ${color.text}`}>{value}</p>
        {sub && <p className={`text-xs mt-0.5 opacity-60 ${color.text}`}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { restaurant } = useAuth()
  const currency = restaurant?.currency || '₹'

  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [periodStart,  setPeriodStart]  = useState(null)  // ISO string or null (all-time)

  // Collect sheet state
  const [collectMethod, setCollectMethod] = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [collectingAll, setCollectingAll] = useState(false)

  // Fetch latest reset + analytics, both scoped to current period
  const loadAnalytics = useCallback(async () => {
    // 1. find the latest reset for this restaurant
    const { data: resets } = await supabase
      .from('collection_resets')
      .select('reset_at')
      .eq('restaurant_id', restaurant.id)
      .order('reset_at', { ascending: false })
      .limit(1)

    const from = resets?.[0]?.reset_at ?? null
    setPeriodStart(from)

    // 2. call analytics RPC with optional from-date
    const { data: result, error: rpcError } = await supabase.rpc('get_restaurant_analytics', {
      p_restaurant_id: restaurant.id,
      p_from:          from,
    })
    if (rpcError) setError(rpcError.message)
    else { setData(result); setError(null) }
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const handleCollect = async ({ method, amount, note }) => {
    setSaving(true)
    try {
      const { error: insErr } = await supabase.from('expenses').insert({
        restaurant_id:  restaurant.id,
        description:    note,
        amount,
        payment_method: method,
        expense_date:   new Date().toISOString().slice(0, 10),
        category:       'collection',
      })
      if (insErr) throw insErr
      // Best-effort: notify the owner's Telegram that money was collected.
      // Fire-and-forget — never blocks or fails the collection flow.
      invokeEdgeFunction('send-collection-report', {
        restaurantId:   restaurant.id,
        restaurantName: restaurant.name,
        currency,
        paymentMethod:  method,
        amount,
        note,
      }).catch(() => {})
      toast.success(`${getMeta(method).label} collection recorded`)
      setCollectMethod(null)
      await loadAnalytics()
    } catch (err) {
      toast.error(err.message || 'Failed to record collection')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card py-12 text-center">
        <p className="text-gray-500">Failed to load analytics data.</p>
      </div>
    )
  }

  const dailyChartData = (data.daily_orders || []).map((d) => ({
    date: formatDate(d.date).slice(0, 6),
    orders: d.count,
  }))

  const topItemsData = (data.top_items || []).slice(0, 5).map((item) => ({
    name: item.name.length > 16 ? item.name.slice(0, 14) + '…' : item.name,
    qty: item.total_quantity,
    revenue: Number(item.total_revenue),
  }))

  const pieData = topItemsData.map((item) => ({ name: item.name, value: item.revenue }))

  const paymentBreakdown    = data.payment_breakdown    || []
  const expenseBreakdown    = data.expense_breakdown    || []
  const collectionBreakdown = data.collection_breakdown || []
  const totalDiscount       = Number(data.total_discount       || 0)
  const totalRoundOff       = Number(data.total_round_off      || 0)
  const totalPackageCharge  = Number(data.total_package_charge || 0)
  const discountCount       = Number(data.discount_count       || 0)

  const collectedByMethod  = Object.fromEntries(paymentBreakdown.map((r) => [r.payment_method, r]))
  const expenseByMethod    = Object.fromEntries(expenseBreakdown.map((r) => [r.payment_method, r.total]))
  const collectionByMethod = Object.fromEntries(collectionBreakdown.map((r) => [r.payment_method, r.total]))
  const allMethods         = [...new Set([
    ...paymentBreakdown.map((r) => r.payment_method),
    ...expenseBreakdown.map((r) => r.payment_method),
    ...collectionBreakdown.map((r) => r.payment_method),
  ])]

  // what's physically in the restaurant right now per payment method
  const netByMethod = Object.fromEntries(
    allMethods.map((m) => [
      m,
      (collectedByMethod[m]?.total ?? 0) - (expenseByMethod[m] ?? 0) - (collectionByMethod[m] ?? 0),
    ])
  )
  // Only settled bills have a known payment method, so this is the true
  // collectible total — matches the sum of the per-method rows above exactly.
  const totalInRestaurant = Object.values(netByMethod).reduce((s, v) => s + v, 0)
  // Revenue from completed-but-unsettled kitchen orders — real money owed,
  // but not yet in any drawer/bank bucket, and can still shrink via a
  // discount, an item removal, or a cancellation before it's billed.
  const settledRevenue     = paymentBreakdown.reduce((s, r) => s + Number(r.total || 0), 0)
  const awaitingSettlement = Math.max(0, Number(data.total_revenue || 0) - settledRevenue)

  const handleCollectAll = async () => {
    const totalToCollect = Object.values(netByMethod).reduce((s, v) => s + Math.max(0, v), 0)
    const msg = totalToCollect > 0
      ? `Collect everything and start a new period?\n\nThis records a collection of ${formatCurrency(totalToCollect, currency)} across all payment methods (so it stays auditable), then resets balances to ₹0.`
      : 'Nothing to collect right now. Start a new period anyway?'
    if (!window.confirm(msg)) return

    setCollectingAll(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const rows = Object.entries(netByMethod)
        .filter(([, net]) => net > 0)
        .map(([m, net]) => ({
          restaurant_id:  restaurant.id,
          description:    `${getMeta(m).label} collection (collect everything)`,
          amount:         net,
          payment_method: m,
          expense_date:   today,
          category:       'collection',
        }))

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('expenses').insert(rows)
        if (insErr) throw insErr
        // Best-effort Telegram notification per method, mirroring the single-Collect flow.
        for (const row of rows) {
          invokeEdgeFunction('send-collection-report', {
            restaurantId:   restaurant.id,
            restaurantName: restaurant.name,
            currency,
            paymentMethod:  row.payment_method,
            amount:         row.amount,
            note:           row.description,
          }).catch(() => {})
        }
      }

      const { error: resetErr } = await supabase
        .from('collection_resets')
        .insert({ restaurant_id: restaurant.id })
      if (resetErr) throw resetErr

      toast.success(
        totalToCollect > 0
          ? `Collected ${formatCurrency(totalToCollect, currency)} — new period started`
          : 'New period started'
      )
      loadAnalytics()
    } catch (err) {
      toast.error('Failed — ' + (err.message || 'unknown error'))
    } finally {
      setCollectingAll(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={ShoppingBag} label="Total Orders" value={data.total_orders}
          color={{ bg: 'bg-primary-50', icon: 'bg-gradient-to-br from-primary-400 to-primary-600', text: 'text-primary-700' }}
        />
        <StatCard
          icon={DollarSign} label="Total Revenue" value={formatCurrency(data.total_revenue, currency)}
          color={{ bg: 'bg-secondary-50', icon: 'bg-gradient-to-br from-secondary-400 to-secondary-600', text: 'text-secondary-700' }}
        />
      </div>

      {/* Payment breakdown + Collect */}
      {(paymentBreakdown.length > 0 || expenseBreakdown.length > 0 || collectionBreakdown.length > 0 || periodStart) && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gray-900 font-display">Register Balance</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Money sitting in the restaurant right now — resets only when you collect it.
                {periodStart && <> Since {formatDate(periodStart)}.</>}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCollectAll}
              disabled={collectingAll}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium hover:bg-green-50 hover:border-green-100 hover:text-green-600 transition-colors flex-shrink-0 disabled:opacity-50"
              title="Record a collection for every method's current balance, then start a new period"
            >
              <RefreshCw className={`w-3 h-3 ${collectingAll ? 'animate-spin' : ''}`} /> {collectingAll ? 'Collecting…' : 'Collect All'}
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {allMethods.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-2">🎉</p>
                <p className="text-sm font-medium text-gray-500">New period started</p>
                <p className="text-xs text-gray-400 mt-0.5">All balances are ₹0 — new bills will appear here.</p>
              </div>
            )}
            {allMethods.map((m) => {
              const meta         = getMeta(m)
              const Icon         = meta.Icon
              const collected    = collectedByMethod[m] || { count: 0, total: 0 }
              const expensed     = expenseByMethod[m]    || 0
              const collectedOut = collectionByMethod[m] || 0
              const net          = netByMethod[m]

              return (
                <div key={m} className="px-4 py-3">
                  {/* Method + total revenue from bills */}
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center ${meta.icon} shadow-sm`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                      <p className="text-xs text-gray-400">{collected.count} bill{collected.count !== 1 ? 's' : ''} collected</p>
                    </div>
                    <p className="text-base font-bold text-gray-900 tabular-nums">
                      {formatCurrency(collected.total, currency)}
                    </p>
                  </div>

                  {/* Deductions + in-restaurant amount */}
                  <div className="ml-12 mt-2 space-y-1.5">
                    {expensed > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-rose-400 flex items-center gap-1">
                          <TrendingDown className="w-3 h-3" /> Business expenses
                        </span>
                        <span className="text-rose-400 font-medium tabular-nums">− {formatCurrency(expensed, currency)}</span>
                      </div>
                    )}
                    {collectedOut > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-500 flex items-center gap-1">
                          <HandCoins className="w-3 h-3" /> Already collected by you
                        </span>
                        <span className="text-amber-500 font-medium tabular-nums">− {formatCurrency(collectedOut, currency)}</span>
                      </div>
                    )}

                    {net > 0 ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-green-700">In restaurant right now</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-green-700 tabular-nums">{formatCurrency(net, currency)}</span>
                          <button
                            type="button"
                            onClick={() => setCollectMethod(m)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-500 transition-colors"
                          >
                            <HandCoins className="w-3 h-3" /> Collect
                          </button>
                        </div>
                      </div>
                    ) : net < 0 ? (
                      <div className="flex items-center gap-1.5 bg-red-50 rounded-xl px-3 py-2 text-xs text-red-600">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Overspent by {formatCurrency(Math.abs(net), currency)} — check your entries
                      </div>
                    ) : (collected.total > 0 || expensed > 0 || collectedOut > 0) ? (
                      <div className="flex items-center justify-between text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
                        <span>All collected — nothing left in restaurant</span>
                        <span className="font-semibold">₹0</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* What's in the restaurant total */}
          <div className="border-t border-gray-200 px-4 py-3 bg-green-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">Total in restaurant right now</p>
                <p className="text-xs text-gray-500 mt-0.5">Sum of every payment method above — this is what's actually collectible.</p>
              </div>
              <p className="text-lg font-bold text-green-700 tabular-nums">
                {formatCurrency(totalInRestaurant, currency)}
              </p>
            </div>
          </div>

          {/* Revenue for completed orders not yet billed — real, but not physically collectible yet */}
          {awaitingSettlement > 0 && (
            <div className="border-t border-amber-100 px-4 py-3 bg-amber-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-amber-800">Awaiting settlement</p>
                  <p className="text-xs text-amber-600 mt-0.5">Kitchen has completed orders not yet billed — can still change before settling.</p>
                </div>
                <p className="text-lg font-bold text-amber-700 tabular-nums">
                  {formatCurrency(awaitingSettlement, currency)}
                </p>
              </div>
            </div>
          )}

          {/* Discount + Round-off */}
          <div className="border-t border-gray-100 grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-3 py-3 flex items-center gap-2">
              <div className="w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-rose-400 to-rose-600 shadow-sm">
                <Tag className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Discount</p>
                <p className="text-sm font-bold text-rose-600 tabular-nums">− {formatCurrency(totalDiscount, currency)}</p>
                {discountCount > 0 && <p className="text-[11px] text-gray-400">{discountCount} bills</p>}
              </div>
            </div>
            <div className="px-3 py-3 flex items-center gap-2">
              <div className="w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
                <RotateCcw className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Round-Off</p>
                <p className="text-sm font-bold text-amber-600 tabular-nums">
                  {totalRoundOff >= 0 ? '' : '− '}{formatCurrency(Math.abs(totalRoundOff), currency)}
                </p>
                <p className="text-[11px] text-gray-400">{totalRoundOff <= 0 ? 'saved for customers' : 'added'}</p>
              </div>
            </div>
            <div className="px-3 py-3 flex items-center gap-2">
              <div className="w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 shadow-sm">
                <Wallet className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Package Charge</p>
                <p className="text-sm font-bold text-orange-600 tabular-nums">+ {formatCurrency(totalPackageCharge, currency)}</p>
              </div>
            </div>
          </div>

          <p className="px-4 py-2.5 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
            This is cumulative across all days. For today's profit/loss only, see Day End.
          </p>
        </div>
      )}

      {/* Daily orders chart */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-primary-500" />
          <h2 className="text-base font-bold text-gray-900 font-display">Orders — Last 7 Days</h2>
        </div>
        {dailyChartData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyChartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="orders" stroke="#e76f51" strokeWidth={2.5}
                dot={{ fill: '#e76f51', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#d3552f' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top items bar chart */}
      {topItemsData.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Award className="w-4 h-4 text-secondary-500" />
            <h2 className="text-base font-bold text-gray-900 font-display">Top Selling Items</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topItemsData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="qty" name="Qty sold" fill="#e76f51" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue pie chart */}
      {pieData.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-bold text-gray-900 font-display">Revenue Distribution</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value, currency)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1">
              {pieData.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-gray-600 truncate flex-1">{item.name}</span>
                  <span className="font-semibold text-gray-900 flex-shrink-0">{formatCurrency(item.value, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Item breakdown table */}
      {topItemsData.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 font-display">Item Breakdown</h2>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty Sold</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_items || []).map((item) => (
                <tr key={item.name}>
                  <td className="font-medium text-gray-800">{item.name}</td>
                  <td className="text-right">{item.total_quantity}</td>
                  <td className="text-right font-semibold text-gray-900">{formatCurrency(item.total_revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Collect bottom sheet */}
      <AnimatePresence>
        {collectMethod && (
          <CollectSheet
            method={collectMethod}
            netAmount={netByMethod[collectMethod] ?? 0}
            currency={currency}
            onClose={() => setCollectMethod(null)}
            onSave={handleCollect}
            saving={saving}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
