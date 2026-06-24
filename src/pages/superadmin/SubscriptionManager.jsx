import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { CalendarDays, Zap, Save, Info } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { formatDate, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_COLORS } from '../../utils/formatters'

const EXTEND_DAYS = 30

function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export default function SubscriptionManager() {
  const { user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [restaurants, setRestaurants] = useState([])
  const [forms, setForms] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('restaurants').select('*').order('name')
    if (!error) setRestaurants(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev }
      for (const r of restaurants) {
        if (!next[r.id]) {
          next[r.id] = {
            subscription_status: r.subscription_status,
            paid_until_at: toDateInputValue(r.paid_until_at),
            super_admin_notes: r.super_admin_notes || '',
          }
        }
      }
      return next
    })
  }, [restaurants])

  const updateForm = (id, field, value) =>
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const handleSave = async (restaurantId) => {
    if (savingId) return
    const form = forms[restaurantId]
    if (!form) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSavingId(restaurantId)
    try {
      const { error } = await supabase.from('restaurants').update({
        subscription_status: form.subscription_status,
        paid_until_at: form.paid_until_at ? new Date(form.paid_until_at).toISOString() : null,
        super_admin_notes: form.super_admin_notes.trim() || null,
      }).eq('id', restaurantId)
      if (error) throw error
      toast.success('Subscription updated')
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to update subscription')
    } finally {
      setSavingId(null)
    }
  }

  const handleExtend = async (restaurant) => {
    if (savingId) return
    const now = new Date()
    const currentPaidUntil = restaurant.paid_until_at ? new Date(restaurant.paid_until_at) : null
    const base = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now
    const newPaidUntil = new Date(base.getTime() + EXTEND_DAYS * 24 * 60 * 60 * 1000)
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSavingId(restaurant.id)
    try {
      const { error } = await supabase.from('restaurants')
        .update({ subscription_status: 'active', paid_until_at: newPaidUntil.toISOString() })
        .eq('id', restaurant.id)
      if (error) throw error
      setForms((prev) => ({
        ...prev,
        [restaurant.id]: {
          ...prev[restaurant.id],
          subscription_status: 'active',
          paid_until_at: toDateInputValue(newPaidUntil.toISOString()),
        },
      }))
      toast.success(`Extended by ${EXTEND_DAYS} days`)
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to extend subscription')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Subscription status is set manually after collecting payment (UPI / cash) outside the app.
          Use <span className="font-semibold">Extend {EXTEND_DAYS} Days</span> after recording a payment in the Payment Log.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
      ) : restaurants.length === 0 ? (
        <div className="card py-12 text-center bg-gray-50">
          <p className="text-sm text-gray-500">No restaurants yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {restaurants.map((restaurant) => {
            const form = forms[restaurant.id]
            if (!form) return null
            const isSaving = savingId === restaurant.id

            return (
              <motion.div
                key={restaurant.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="card space-y-4"
              >
                <div className="flex items-start gap-3 justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 font-display">{restaurant.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      /{restaurant.slug} · Trial ends {formatDate(restaurant.trial_ends_at)}
                    </p>
                  </div>
                  <span className={`badge flex-shrink-0 ${SUBSCRIPTION_STATUS_COLORS[restaurant.subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                    {SUBSCRIPTION_STATUS_LABELS[restaurant.subscription_status] || restaurant.subscription_status}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`status-${restaurant.id}`}>Subscription Status</label>
                    <select id={`status-${restaurant.id}`} className="input" value={form.subscription_status}
                      onChange={(e) => updateForm(restaurant.id, 'subscription_status', e.target.value)}>
                      {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`paid-${restaurant.id}`}>
                      <CalendarDays className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                      Paid Until
                    </label>
                    <input id={`paid-${restaurant.id}`} type="date" className="input" value={form.paid_until_at}
                      onChange={(e) => updateForm(restaurant.id, 'paid_until_at', e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor={`notes-${restaurant.id}`}>Internal Notes</label>
                  <textarea id={`notes-${restaurant.id}`} className="input resize-none" rows={2}
                    maxLength={1000} placeholder="Payment reference, follow-up reminders…"
                    value={form.super_admin_notes}
                    onChange={(e) => updateForm(restaurant.id, 'super_admin_notes', e.target.value)} />
                </div>

                <div className="flex gap-2">
                  <button type="button" disabled={isSaving} onClick={() => handleSave(restaurant.id)}
                    className="btn-primary gap-2">
                    {isSaving
                      ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      : <Save className="w-3.5 h-3.5" />}
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" disabled={isSaving} onClick={() => handleExtend(restaurant)}
                    className="btn-secondary gap-2">
                    <Zap className="w-3.5 h-3.5" />
                    Extend {EXTEND_DAYS} Days
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
