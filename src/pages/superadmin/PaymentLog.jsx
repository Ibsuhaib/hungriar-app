import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { PlusCircle, Receipt, Info } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../utils/formatters'

const METHOD_LABELS = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
}

const METHOD_COLORS = {
  upi: 'bg-violet-50 text-violet-700 border border-violet-100',
  cash: 'bg-green-50 text-green-700 border border-green-100',
  bank_transfer: 'bg-blue-50 text-blue-700 border border-blue-100',
  other: 'bg-gray-100 text-gray-600 border border-gray-200',
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function emptyForm() {
  return { restaurant_id: '', amount: '', payment_date: todayString(), method: 'upi', receipt_number: '', notes: '' }
}

export default function PaymentLog() {
  const { user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [payments, setPayments] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [paymentsRes, restaurantsRes] = await Promise.all([
      supabase
        .from('subscription_payments')
        .select('*, restaurants(name, slug)')
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('restaurants').select('id, name').order('name'),
    ])
    if (!paymentsRes.error) setPayments(paymentsRes.data || [])
    if (!restaurantsRes.error) setRestaurants(restaurantsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    const amount = Number(form.amount)
    if (!form.restaurant_id) { toast.error('Select a restaurant'); return }
    if (Number.isNaN(amount) || amount < 0) { toast.error('Enter a valid amount'); return }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSaving(true)
    try {
      const { error } = await supabase.from('subscription_payments').insert({
        restaurant_id: form.restaurant_id,
        amount,
        payment_date: form.payment_date || todayString(),
        method: form.method,
        receipt_number: form.receipt_number.trim() || null,
        notes: form.notes.trim() || null,
      })
      if (error) throw error
      toast.success('Payment recorded')
      setForm(emptyForm())
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Record form */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50">
            <PlusCircle className="w-4 h-4 text-primary-600" />
          </div>
          <h2 className="text-base font-bold text-gray-900 font-display">Record Payment</h2>
        </div>

        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            This only logs the payment. Go to <span className="font-semibold">Subscriptions</span> and click
            <span className="font-semibold"> Extend 30 Days</span> to actually activate access.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pay-restaurant">Restaurant</label>
              <select id="pay-restaurant" className="input" required value={form.restaurant_id}
                onChange={(e) => setField('restaurant_id', e.target.value)}>
                <option value="">Select a restaurant…</option>
                {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pay-amount">Amount (₹)</label>
              <input id="pay-amount" type="number" min="0" step="0.01" required className="input"
                value={form.amount} onChange={(e) => setField('amount', e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="pay-date">Date</label>
              <input id="pay-date" type="date" required className="input"
                value={form.payment_date} onChange={(e) => setField('payment_date', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pay-method">Method</label>
              <select id="pay-method" className="input" value={form.method}
                onChange={(e) => setField('method', e.target.value)}>
                {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pay-receipt">Receipt #</label>
              <input id="pay-receipt" className="input" maxLength={100} placeholder="Optional"
                value={form.receipt_number} onChange={(e) => setField('receipt_number', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="pay-notes">Notes</label>
            <textarea id="pay-notes" className="input resize-none" rows={2} maxLength={500}
              placeholder="Optional — e.g., UPI transaction ID, contact name"
              value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
          </div>

          <button type="submit" disabled={saving} className="btn-primary gap-2">
            {saving
              ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <PlusCircle className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </form>
      </div>

      {/* Payment log table */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Receipt className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Payment History</h2>
          {!loading && (
            <span className="ml-auto badge bg-gray-100 text-gray-600 text-xs">{payments.length} records</span>
          )}
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Restaurant</th>
                  <th className="text-right">Amount</th>
                  <th>Method</th>
                  <th>Receipt #</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment, i) => (
                  <motion.tr key={payment.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}>
                    <td className="whitespace-nowrap">{formatDate(payment.payment_date)}</td>
                    <td className="font-medium text-gray-900">{payment.restaurants?.name ?? '—'}</td>
                    <td className="text-right font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(payment.amount, '₹')}
                    </td>
                    <td>
                      <span className={`badge-sm ${METHOD_COLORS[payment.method] || METHOD_COLORS.other}`}>
                        {METHOD_LABELS[payment.method] || payment.method}
                      </span>
                    </td>
                    <td className="text-gray-500">{payment.receipt_number || '—'}</td>
                    <td className="text-gray-400 max-w-[200px] truncate" title={payment.notes || ''}>
                      {payment.notes || '—'}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
