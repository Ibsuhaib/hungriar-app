import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Banknote, Smartphone, CreditCard, Wallet,
  Plus, Trash2, Printer, ChevronDown,
  TrendingDown, ArrowRight, Sunset,
  CheckCircle2, AlertTriangle, LayoutDashboard, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_META = {
  cash:  { label: 'Cash',  Icon: Banknote,   iconBg: 'bg-gradient-to-br from-green-400 to-green-600'   },
  upi:   { label: 'UPI',   Icon: Smartphone, iconBg: 'bg-gradient-to-br from-blue-400 to-blue-600'    },
  card:  { label: 'Card',  Icon: CreditCard, iconBg: 'bg-gradient-to-br from-violet-400 to-violet-600' },
  other: { label: 'Other', Icon: Wallet,     iconBg: 'bg-gradient-to-br from-amber-400 to-amber-600'   },
}
function getMeta(method) {
  const key = (method || 'cash').toLowerCase()
  return PAYMENT_META[key] || { ...PAYMENT_META.other, label: method }
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Print ────────────────────────────────────────────────────────────────────

function printReport({ restaurantName, date, collections, expenses, netMap, totalCollected, totalExpenses, currency }) {
  const fmt = (n) => formatCurrency(n, currency)
  const row = (l, v, bold) =>
    `<tr><td style="padding:3px 0;${bold?'font-weight:700':''}">${l}</td>
     <td style="text-align:right;padding:3px 0;${bold?'font-weight:700':''}">${v}</td></tr>`

  const html = `<!DOCTYPE html><html><head><title>Day End</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:6mm 4mm;color:#111}
h1{font-size:14px;text-align:center;margin-bottom:2px}
.sub{text-align:center;color:#555;margin-bottom:8px;font-size:11px}
.sec{margin:8px 0 4px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#555;border-top:1px solid #111;padding-top:6px}
table{width:100%;border-collapse:collapse;border-bottom:1px dashed #ccc}
tr{border-bottom:1px dashed #e5e7eb}
.foot{margin-top:12px;text-align:center;font-size:10px;color:#888}</style>
</head><body>
<h1>${restaurantName}</h1>
<p class="sub">Day End Report &mdash; ${fmtDate(date)}</p>
<p class="sec">Collections</p>
<table>${collections.map(c=>row(`${getMeta(c.payment_method).label} (${c.count} bills)`,fmt(c.total))).join('')}${row('Total Collected',fmt(totalCollected),true)}</table>
<p class="sec">Expenses</p>
${expenses.length===0?'<p style="color:#888;font-size:11px;padding:4px 0">No expenses recorded.</p>':`<table>${expenses.map(e=>row(`${e.description} (${getMeta(e.payment_method).label})`,`- ${fmt(e.amount)}`)).join('')}${row('Total Expenses',`- ${fmt(totalExpenses)}`,true)}</table>`}
<p class="sec">Net Summary</p>
<table>${Object.entries(netMap).map(([m,v])=>row(getMeta(m).label+' in hand',fmt(v),true)).join('')}${row('Net Total',fmt(totalCollected-totalExpenses),true)}</table>
<p class="foot">Printed ${new Date().toLocaleString('en-IN')}</p>
</body></html>`

  const w = window.open('', '_blank', 'width=400,height=600')
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => { w.print(); w.close() }, 300)
}

// ─── Confirmation bottom sheet ────────────────────────────────────────────────

function ConfirmModal({ activeOrderCount, totalCollected, totalExpenses, netTotal, currency, onConfirm, onCancel, loading }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pb-8 pt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <Sunset className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">End Day?</h2>
              <p className="text-xs text-gray-400">Dashboard resets fresh for tomorrow</p>
            </div>
            <button type="button" onClick={onCancel} className="ml-auto p-1.5 rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {activeOrderCount > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 font-medium">
                <span className="font-bold">{activeOrderCount} active order{activeOrderCount !== 1 ? 's' : ''}</span> will be cancelled. Settle them first if needed.
              </p>
            </div>
          )}

          <div className="space-y-1.5 mb-5 bg-gray-50 rounded-2xl px-4 py-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Total Collected</span>
              <span className="font-semibold">{formatCurrency(totalCollected, currency)}</span>
            </div>
            {totalExpenses > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Total Expenses</span>
                <span className="font-semibold text-rose-500">− {formatCurrency(totalExpenses, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-dashed border-gray-200">
              <span>Net Total</span>
              <span>{formatCurrency(netTotal, currency)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onCancel}
              className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? 'Closing…' : 'Confirm End Day'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

// ─── Closed success screen ────────────────────────────────────────────────────

function ClosedScreen({ closeRecord, currency, onGoToDashboard, onPrint, collections, expenses, netMap, totalCollected, totalExpenses, restaurantName, today }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl space-y-5"
    >
      {/* Hero */}
      <div className="card text-center py-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1, damping: 18 }}
          className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center mx-auto mb-4 shadow-xl"
        >
          <Sunset className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-900 font-display">Day Closed!</h2>
        <p className="text-sm text-gray-500 mt-1">{fmtDate(closeRecord.close_date)}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-2xl px-3 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Collected</p>
            <p className="text-base font-bold text-gray-900 tabular-nums">{formatCurrency(closeRecord.total_collected, currency)}</p>
          </div>
          <div className="bg-rose-50 rounded-2xl px-3 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Expenses</p>
            <p className="text-base font-bold text-rose-600 tabular-nums">− {formatCurrency(closeRecord.total_expenses, currency)}</p>
          </div>
          <div className="bg-green-50 rounded-2xl px-3 py-3">
            <p className="text-xs text-gray-400 mb-0.5">Net</p>
            <p className="text-base font-bold text-green-700 tabular-nums">{formatCurrency(closeRecord.net_total, currency)}</p>
          </div>
        </div>
      </div>

      {/* Net per method */}
      {Object.keys(netMap).length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900">Cash in Hand</p>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(netMap).map(([m, net]) => {
              const meta = getMeta(m)
              const Icon = meta.Icon
              const expensed = expenses.filter(e => (e.payment_method||'cash').toLowerCase() === m).reduce((s,e)=>s+Number(e.amount),0)
              const col = collections.find(c=>c.payment_method===m)?.total ?? 0
              return (
                <div key={m} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${meta.iconBg} shadow-sm flex-shrink-0`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                    {expensed > 0 && (
                      <p className="text-xs text-gray-400">{formatCurrency(col, currency)} − {formatCurrency(expensed, currency)}</p>
                    )}
                  </div>
                  <p className={`text-sm font-bold tabular-nums ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatCurrency(net, currency)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4" /> Print Report
        </button>
        <button
          type="button"
          onClick={onGoToDashboard}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold transition-colors shadow-sm"
        >
          <LayoutDashboard className="w-4 h-4" /> Go to Dashboard
        </button>
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DayEnd() {
  const { restaurant } = useAuth()
  const navigate  = useNavigate()
  const currency  = restaurant?.currency || '₹'
  const today     = todayISO()

  const [collections,  setCollections]  = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [closeRecord,  setCloseRecord]  = useState(null)  // today's day_close row, if exists
  const [activeOrders, setActiveOrders] = useState(0)
  const [loading,      setLoading]      = useState(true)

  const [desc,   setDesc]   = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)

  const [showConfirm, setShowConfirm] = useState(false)
  const [closing,     setClosing]     = useState(false)

  const descRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    const [collRes, expRes, closeRes, activeRes] = await Promise.all([
      supabase
        .from('billing_history')
        .select('payment_method, total_amount')
        .eq('restaurant_id', restaurant.id)
        .gte('bill_date', today)
        .lt('bill_date', tomorrow),
      supabase
        .from('expenses')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('expense_date', today)
        .order('created_at'),
      supabase
        .from('day_closes')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('close_date', today)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurant.id)
        .in('status', ['pending', 'preparing', 'served']),
    ])

    if (!collRes.error) {
      const map = {}
      for (const row of collRes.data || []) {
        const m = (row.payment_method || 'cash').toLowerCase()
        if (!map[m]) map[m] = { payment_method: m, count: 0, total: 0 }
        map[m].count++
        map[m].total += Number(row.total_amount)
      }
      setCollections(Object.values(map).sort((a, b) => b.total - a.total))
    }
    if (!expRes.error)   setExpenses(expRes.data || [])
    if (!closeRes.error) setCloseRecord(closeRes.data || null)
    if (!activeRes.error) setActiveOrders(activeRes.count ?? 0)
    setLoading(false)
  }, [restaurant.id, today])

  useEffect(() => { load() }, [load])

  // ── Derived ──────────────────────────────────────────────────────────────

  const totalCollected = collections.reduce((s, c) => s + c.total, 0)
  const totalExpenses  = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const netTotal       = totalCollected - totalExpenses

  const expByMethod = {}
  for (const ex of expenses) {
    const m = (ex.payment_method || 'cash').toLowerCase()
    expByMethod[m] = (expByMethod[m] || 0) + Number(ex.amount)
  }
  const netMap = {}
  for (const c of collections) netMap[c.payment_method] = c.total - (expByMethod[c.payment_method] || 0)
  for (const [m, amt] of Object.entries(expByMethod)) if (!(m in netMap)) netMap[m] = -amt

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddExpense = async (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!desc.trim() || !amt || amt <= 0) return
    setSaving(true)
    try {
      const { error } = await supabase.from('expenses').insert({
        restaurant_id: restaurant.id, description: desc.trim(),
        amount: amt, payment_method: method, expense_date: today,
      })
      if (error) throw error
      toast.success('Expense added')
      setDesc(''); setAmount('')
      descRef.current?.focus()
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to add expense')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Removed')
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  const handleEndDay = async () => {
    setClosing(true)
    try {
      // Cancel all remaining active orders first
      const { error: cancelError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('restaurant_id', restaurant.id)
        .in('status', ['pending', 'preparing', 'served'])
      if (cancelError) throw cancelError

      const { error } = await supabase.rpc('close_day', {
        p_restaurant_id:   restaurant.id,
        p_close_date:      today,
        p_total_collected: totalCollected,
        p_total_expenses:  totalExpenses,
        p_net_total:       netTotal,
        p_summary_json:    {
          collections,
          expense_count: expenses.length,
          net_map:       netMap,
        },
      })
      if (error) throw error
      toast.success('Day closed! Dashboard is now fresh.')
      setShowConfirm(false)
      navigate('/admin')
    } catch (err) {
      toast.error(err.message || 'Failed to close day')
    } finally {
      setClosing(false)
    }
  }

  const handlePrint = () => printReport({
    restaurantName: restaurant.name || 'Restaurant',
    date: today, collections, expenses, netMap,
    totalCollected, totalExpenses, currency,
  })

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex justify-between">
          <div className="skeleton h-8 w-40 rounded-xl" />
          <div className="skeleton h-9 w-32 rounded-xl" />
        </div>
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    )
  }

  // ── Already closed today ───────────────────────────────────────────────────

  if (closeRecord) {
    return (
      <div className="max-w-2xl space-y-4">
        <ClosedScreen
          closeRecord={closeRecord}
          currency={currency}
          onGoToDashboard={() => navigate('/admin')}
          onPrint={handlePrint}
          collections={collections}
          expenses={expenses}
          netMap={netMap}
          totalCollected={totalCollected}
          totalExpenses={totalExpenses}
          restaurantName={restaurant.name || 'Restaurant'}
          today={today}
        />
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-700 font-medium">
            Expense panel resets fresh tomorrow. Come back then to start a new day.
          </p>
        </div>
      </div>
    )
  }

  // ── Normal day-end view ────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-2xl pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Day End</p>
          <p className="text-sm font-semibold text-gray-600">{fmtDate(today)}</p>
        </div>
        <button
          type="button" onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4" /> Print Report
        </button>
      </div>

      {/* Today's Collections */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Today's Collections</h2>
          <p className="text-xs text-gray-400 mt-0.5">From settled bills today</p>
        </div>
        {collections.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No bills settled today yet.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {collections.map((c) => {
                const meta = getMeta(c.payment_method); const Icon = meta.Icon
                return (
                  <div key={c.payment_method} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center ${meta.iconBg} shadow-sm`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                      <p className="text-xs text-gray-400">{c.count} bill{c.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-base font-bold text-gray-900 tabular-nums">{formatCurrency(c.total, currency)}</p>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-600">Total Collected</p>
              <p className="text-base font-bold text-gray-900">{formatCurrency(totalCollected, currency)}</p>
            </div>
          </>
        )}
      </div>

      {/* Add Expense */}
      <div className="card">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Add Expense</h2>
        <form onSubmit={handleAddExpense} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
            <input ref={descRef} type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Vegetable supplier, Electricity bill…" maxLength={120} required className="input w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Amount</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" min="0.01" step="0.01" required className="input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Paid via</label>
              <div className="relative">
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="input w-full appearance-none pr-8">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
          <button type="submit" disabled={saving || !desc.trim() || !amount}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="w-4 h-4" />
            {saving ? 'Adding…' : 'Add Expense'}
          </button>
        </form>
      </div>

      {/* Expenses list */}
      {expenses.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Today's Expenses</h2>
            <span className="text-xs font-bold text-rose-600">− {formatCurrency(totalExpenses, currency)}</span>
          </div>
          <div className="divide-y divide-gray-50">
            <AnimatePresence initial={false}>
              {expenses.map((ex) => {
                const meta = getMeta(ex.payment_method); const Icon = meta.Icon
                return (
                  <motion.div key={ex.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center ${meta.iconBg} shadow-sm`}>
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{ex.description}</p>
                      <p className="text-xs text-gray-400">{meta.label}</p>
                    </div>
                    <p className="text-sm font-bold text-rose-600 tabular-nums flex-shrink-0">
                      − {formatCurrency(ex.amount, currency)}
                    </p>
                    <button type="button" onClick={() => handleDelete(ex.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Net Summary */}
      {Object.keys(netMap).length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Net Summary</h2>
            <p className="text-xs text-gray-400 mt-0.5">Cash in hand after expenses</p>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(netMap).map(([m, net]) => {
              const meta = getMeta(m); const Icon = meta.Icon
              const col = collections.find((c) => c.payment_method === m)?.total ?? 0
              const spent = expByMethod[m] ?? 0
              return (
                <div key={m} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center ${meta.iconBg} shadow-sm`}>
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <p className="text-sm font-bold text-gray-800 flex-1">{meta.label}</p>
                    <p className={`text-base font-bold tabular-nums ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {formatCurrency(net, currency)}
                    </p>
                  </div>
                  {spent > 0 && (
                    <div className="ml-11 flex items-center gap-1.5 text-xs text-gray-400">
                      <span>{formatCurrency(col, currency)} collected</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-rose-400">− {formatCurrency(spent, currency)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-800">Net Total</p>
              {totalExpenses > 0 && <p className="text-xs text-gray-400">{formatCurrency(totalCollected, currency)} − {formatCurrency(totalExpenses, currency)}</p>}
            </div>
            <p className={`text-lg font-bold tabular-nums ${netTotal >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
              {formatCurrency(netTotal, currency)}
            </p>
          </div>
        </div>
      )}

      {/* ── Sticky End Day bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold text-base shadow-lg shadow-rose-200 hover:opacity-90 transition-opacity"
          >
            <Sunset className="w-5 h-5" />
            End Day
          </button>
        </div>
      </div>

      {/* Confirmation bottom sheet */}
      <AnimatePresence>
        {showConfirm && (
          <ConfirmModal
            activeOrderCount={activeOrders}
            totalCollected={totalCollected}
            totalExpenses={totalExpenses}
            netTotal={netTotal}
            currency={currency}
            onConfirm={handleEndDay}
            onCancel={() => setShowConfirm(false)}
            loading={closing}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
