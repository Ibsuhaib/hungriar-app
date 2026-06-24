import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev }
      for (const restaurant of restaurants) {
        if (!next[restaurant.id]) {
          next[restaurant.id] = {
            subscription_status: restaurant.subscription_status,
            paid_until_at: toDateInputValue(restaurant.paid_until_at),
            super_admin_notes: restaurant.super_admin_notes || '',
          }
        }
      }
      return next
    })
  }, [restaurants])

  const updateForm = (restaurantId, field, value) => {
    setForms((prev) => ({ ...prev, [restaurantId]: { ...prev[restaurantId], [field]: value } }))
  }

  const handleSave = async (restaurantId) => {
    if (savingId) return
    const form = forms[restaurantId]
    if (!form) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setSavingId(restaurantId)
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          subscription_status: form.subscription_status,
          paid_until_at: form.paid_until_at ? new Date(form.paid_until_at).toISOString() : null,
          super_admin_notes: form.super_admin_notes.trim() || null,
        })
        .eq('id', restaurantId)

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
      const { error } = await supabase
        .from('restaurants')
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
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Subscription status is set manually after a developer collects payment (UPI / cash) outside the app. Use{' '}
        <span className="font-medium">Extend {EXTEND_DAYS} Days</span> after recording a payment in the Payment Log.
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : restaurants.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No restaurants yet.</p>
      ) : (
        <div className="space-y-4">
          {restaurants.map((restaurant) => {
            const form = forms[restaurant.id]
            if (!form) return null
            const isSaving = savingId === restaurant.id

            return (
              <div key={restaurant.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{restaurant.name}</h2>
                    <p className="text-xs text-gray-500">
                      /{restaurant.slug} &middot; Trial ends {formatDate(restaurant.trial_ends_at)}
                    </p>
                  </div>
                  <span className={`badge ${SUBSCRIPTION_STATUS_COLORS[restaurant.subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                    {SUBSCRIPTION_STATUS_LABELS[restaurant.subscription_status] || restaurant.subscription_status}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor={`status-${restaurant.id}`}>
                      Subscription Status
                    </label>
                    <select
                      id={`status-${restaurant.id}`}
                      className="input"
                      value={form.subscription_status}
                      onChange={(event) => updateForm(restaurant.id, 'subscription_status', event.target.value)}
                    >
                      {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`paid-until-${restaurant.id}`}>
                      Paid Until
                    </label>
                    <input
                      id={`paid-until-${restaurant.id}`}
                      type="date"
                      className="input"
                      value={form.paid_until_at}
                      onChange={(event) => updateForm(restaurant.id, 'paid_until_at', event.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor={`notes-${restaurant.id}`}>
                    Internal Notes
                  </label>
                  <textarea
                    id={`notes-${restaurant.id}`}
                    className="input"
                    rows={2}
                    maxLength={1000}
                    placeholder="Visible to super admins only - e.g. payment reference, follow-up reminders"
                    value={form.super_admin_notes}
                    onChange={(event) => updateForm(restaurant.id, 'super_admin_notes', event.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <button type="button" disabled={isSaving} onClick={() => handleSave(restaurant.id)} className="btn-primary">
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" disabled={isSaving} onClick={() => handleExtend(restaurant)} className="btn-secondary">
                    Extend {EXTEND_DAYS} Days
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
