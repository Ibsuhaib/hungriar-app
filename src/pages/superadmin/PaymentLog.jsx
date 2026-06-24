import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const amount = Number(form.amount)
    if (!form.restaurant_id) {
      toast.error('Select a restaurant')
      return
    }
    if (Number.isNaN(amount) || amount < 0) {
      toast.error('Enter a valid amount')
      return
    }

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
      <form onSubmit={handleSubmit} className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
        <p className="text-sm text-gray-500">
          Log a payment collected outside the app (UPI / cash / bank transfer). This does not change the subscription status -
          use Subscriptions to extend access after recording a payment here.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="payment-restaurant">
              Restaurant
            </label>
            <select
              id="payment-restaurant"
              className="input"
              value={form.restaurant_id}
              onChange={(event) => setForm((prev) => ({ ...prev, restaurant_id: event.target.value }))}
              required
            >
              <option value="">Select a restaurant</option>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payment-amount">
              Amount
            </label>
            <input
              id="payment-amount"
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="payment-date">
              Date
            </label>
            <input
              id="payment-date"
              type="date"
              className="input"
              value={form.payment_date}
              onChange={(event) => setForm((prev) => ({ ...prev, payment_date: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="payment-method">
              Method
            </label>
            <select
              id="payment-method"
              className="input"
              value={form.method}
              onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payment-receipt">
              Receipt #
            </label>
            <input
              id="payment-receipt"
              className="input"
              value={form.receipt_number}
              onChange={(event) => setForm((prev) => ({ ...prev, receipt_number: event.target.value }))}
              maxLength={100}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="payment-notes">
            Notes
          </label>
          <textarea
            id="payment-notes"
            className="input"
            rows={2}
            maxLength={500}
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Record Payment'}
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No payments recorded yet.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Restaurant</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Receipt #</th>
                <th className="px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-2 text-gray-700">{formatDate(payment.payment_date)}</td>
                  <td className="px-4 py-2 text-gray-700">{payment.restaurants?.name ?? '-'}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(payment.amount, '₹')}</td>
                  <td className="px-4 py-2 text-gray-700">{METHOD_LABELS[payment.method] || payment.method}</td>
                  <td className="px-4 py-2 text-gray-700">{payment.receipt_number || '-'}</td>
                  <td className="px-4 py-2 text-gray-500">{payment.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
