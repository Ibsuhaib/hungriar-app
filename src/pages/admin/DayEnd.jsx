import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Banknote, Smartphone, CreditCard, Wallet,
  Plus, Trash2, Printer, ChevronDown, TrendingDown,
  CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/formatters'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_META = {
  cash:  { label: 'Cash',  Icon: Banknote,   color: 'text-green-600',  bg: 'bg-green-50',  iconBg: 'bg-gradient-to-br from-green-400 to-green-600'  },
  upi:   { label: 'UPI',   Icon: Smartphone, color: 'text-blue-600',   bg: 'bg-blue-50',   iconBg: 'bg-gradient-to-br from-blue-400 to-blue-600'   },
  card:  { label: 'Card',  Icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50', iconBg: 'bg-gradient-to-br from-violet-400 to-violet-600' },
  other: { label: 'Other', Icon: Wallet,     color: 'text-amber-600',  bg: 'bg-amber-50',  iconBg: 'bg-gradient-to-br from-amber-400 to-amber-600'  },
}

function getMeta(method) {
  const key = (method || 'cash').toLowerCase()
  return PAYMENT_META[key] || { ...PAYMENT_META.other, label: method }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Print report ─────────────────────────────────────────────────────────────

function printDayEnd({ restaurantName, date, collections, expenses, netMap, totalCollected, totalExpenses }) {
  const currency = '₹'
  const fmt = (n) => formatCurrency(n, currency)
  const line = (label, value, bold = false) =>
    `<tr style="border-bottom:1px dashed #e5e7eb">
       <td style="padding:4px 0;${bold ? 'font-weight:700' : ''}">${label}</td>
       <td style="text-align:right;padding:4px 0;${bold ? 'font-weight:700' : ''}">${value}</td>
     </tr>`

  const collectRows  = collections.map((c) => line(`${getMeta(c.payment_method).label} (${c.count} bills)`, fmt(c.total))).join('')
  const expenseRows  = expenses.map((e)    => line(`${e.description} (${getMeta(e.payment_method).label})`, `- ${fmt(e.amount)}`)).join('')
  const netRows      = Object.entries(netMap).map(([m, v]) =>
    line(getMeta(m).label + ' in hand', fmt(v), true)).join('')

  const html = `<!DOCTYPE html>
<html><head>
<title>Day End Report</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 6mm 4mm; color:#111; }
  h1   { font-size:14px; text-align:center; margin-bottom:2px; }
  .sub { text-align:center; color:#555; margin-bottom:8px; font-size:11px; }
  .section { margin:8px 0 4px; font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#555; border-top:1px solid #111; padding-top:6px; }
  table { width:100%; border-collapse:collapse; }
  .total-line { border-top:2px solid #111; margin-top:6px; padding-top:6px; font-size:13px; font-weight:700; display:flex; justify-content:space-between; }
  .footer { margin-top:12px; text-align:center; font-size:10px; color:#888; }
</style>
</head><body>
<h1>${restaurantName}</h1>
<p class="sub">Day End Report &mdash; ${fmtDate(date)}</p>

<p class="section">Collections</p>
<table>${collectRows}</table>
${line('Total Collected', fmt(totalCollected), true)}

<p class="section">Expenses</p>
${expenses.length === 0 ? '<p style="color:#888;font-size:11px;padding:4px 0">No expenses recorded.</p>'
  : `<table>${expenseRows}</table>`}
${expenses.length > 0 ? line('Total Expenses', `- ${fmt(totalExpenses)}`, true) : ''}

<p class="section">Net Summary</p>
<table>${netRows}</table>

<p class="footer">Printed ${new Date().toLocaleString('en-IN')}</p>
</body></html>`

  const w = window.open('', '_blank', 'width=400,height=600')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 300)
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DayEnd() {
  const { restaurant } = useAuth()
  const currency  = restaurant?.currency || '₹'
  const today     = todayISO()

  const [collections, setCollections]   = useState([])  // billing_history rows grouped by method for today
  const [expenses,    setExpenses]       = useState([])  // expenses for today
  const [loading,     setLoading]        = useState(true)

  const [desc,   setDesc]   = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)

  const descRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [collRes, expRes] = await Promise.all([
      // Today's collections grouped by payment method
      supabase
        .from('billing_history')
        .select('payment_method, total_amount')
        .eq('restaurant_id', restaurant.id)
        .gte('bill_date', today)
        .lt('bill_date', new Date(Date.now() + 86400000).toISOString().slice(0, 10)),

      // Today's expenses
      supabase
        .from('expenses')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('expense_date', today)
        .order('created_at'),
    ])

    if (!collRes.error) {
      // group by payment_method
      const map = {}
      for (const row of collRes.data || []) {
        const m = (row.payment_method || 'cash').toLowerCase()
        if (!map[m]) map[m] = { payment_method: m, count: 0, total: 0 }
        map[m].count++
        map[m].total += Number(row.total_amount)
      }
      setCollections(Object.values(map).sort((a, b) => b.total - a.total))
    }

    if (!expRes.error) setExpenses(expRes.data || [])
    setLoading(false)
  }, [restaurant.id, today])

  useEffect(() => { load() }, [load])

  const handleAddExpense = async (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!desc.trim() || !amt || amt <= 0) return
    setSaving(true)
    try {
      const { error } = await supabase.from('expenses').insert({
        restaurant_id:  restaurant.id,
        description:    desc.trim(),
        amount:         amt,
        payment_method: method,
        expense_date:   today,
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

  // ── Derived numbers ──────────────────────────────────────────────────────

  const totalCollected = collections.reduce((s, c) => s + c.total, 0)
  const totalExpenses  = expenses.reduce((s, e) => s + Number(e.amount), 0)

  // expenses by method
  const expByMethod = {}
  for (const ex of expenses) {
    const m = (ex.payment_method || 'cash').toLowerCase()
    expByMethod[m] = (expByMethod[m] || 0) + Number(ex.amount)
  }

  // net per method = collected - expenses (only show if collected exists)
  const netMap = {}
  for (const c of collections) {
    netMap[c.payment_method] = c.total - (expByMethod[c.payment_method] || 0)
  }
  // methods only in expenses (no income)
  for (const [m, amt] of Object.entries(expByMethod)) {
    if (!(m in netMap)) netMap[m] = -(amt)
  }

  // ── Print ────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    printDayEnd({
      restaurantName: restaurant.name || 'Restaurant',
      date:           today,
      collections,
      expenses,
      netMap,
      totalCollected,
      totalExpenses,
    })
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 rounded-xl w-48" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Day End</p>
          <p className="text-sm font-semibold text-gray-600">{fmtDate(today)}</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4" /> Print Report
        </button>
      </div>

      {/* Today's Collections */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Today's Collections</h2>
          <p className="text-xs text-gray-400 mt-0.5">Amounts received from settled bills today</p>
        </div>

        {collections.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No bills settled today yet.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {collections.map((c) => {
                const meta = getMeta(c.payment_method)
                const Icon = meta.Icon
                return (
                  <div key={c.payment_method} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center ${meta.iconBg} shadow-sm`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                      <p className="text-xs text-gray-400">{c.count} bill{c.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-base font-bold text-gray-900 tabular-nums">
                      {formatCurrency(c.total, currency)}
                    </p>
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
            <input
              ref={descRef}
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Vegetable supplier, Electricity bill…"
              maxLength={120}
              required
              className="input w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Amount</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Paid via</label>
              <div className="relative">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="input w-full appearance-none pr-8"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !desc.trim() || !amount}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Adding…' : 'Add Expense'}
          </button>
        </form>
      </div>

      {/* Today's Expenses list */}
      {expenses.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Today's Expenses</h2>
            <span className="text-xs font-bold text-rose-600">
              − {formatCurrency(totalExpenses, currency)}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            <AnimatePresence initial={false}>
              {expenses.map((ex) => {
                const meta = getMeta(ex.payment_method)
                const Icon = meta.Icon
                return (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
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
                    <button
                      type="button"
                      onClick={() => handleDelete(ex.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    >
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
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Net Summary</h2>
          <p className="text-xs text-gray-400 mt-0.5">Collections minus expenses per payment method</p>
        </div>

        {Object.keys(netMap).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data for today.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {Object.entries(netMap).map(([m, net]) => {
                const meta = getMeta(m)
                const Icon = meta.Icon
                const collected = collections.find((c) => c.payment_method === m)?.total ?? 0
                const spent     = expByMethod[m] ?? 0
                return (
                  <div key={m} className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center ${meta.iconBg} shadow-sm`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-sm font-bold text-gray-800 flex-1">{meta.label}</p>
                      <p className={`text-base font-bold tabular-nums ${net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {formatCurrency(net, currency)}
                      </p>
                    </div>
                    {/* mini breakdown */}
                    <div className="ml-11 flex items-center gap-1.5 text-xs text-gray-400">
                      <span>{formatCurrency(collected, currency)} collected</span>
                      {spent > 0 && (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          <span className="text-rose-400">− {formatCurrency(spent, currency)} expenses</span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-800">Net Total</p>
                {totalExpenses > 0 && (
                  <p className="text-xs text-gray-400">
                    {formatCurrency(totalCollected, currency)} − {formatCurrency(totalExpenses, currency)} expenses
                  </p>
                )}
              </div>
              <p className={`text-lg font-bold tabular-nums ${totalCollected - totalExpenses >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                {formatCurrency(totalCollected - totalExpenses, currency)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Encouragement footer */}
      {collections.length > 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            Great day! {collections.reduce((s, c) => s + c.count, 0)} bills settled, {formatCurrency(totalCollected, currency)} collected.
          </p>
        </div>
      )}
    </div>
  )
}
