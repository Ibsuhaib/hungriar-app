import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, ChevronDown, ChevronUp, KeyRound, Trash2, Edit2, Store, Phone, CheckCircle, AlertCircle, Copy, Link, Crown, Globe, FileText, Download } from 'lucide-react'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase, invokeEdgeFunction } from '../../lib/supabase'
import { formatDate, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_COLORS } from '../../utils/formatters'
import { openAgreementPdf } from '../../legal/agreementPdf'

const EMPTY_ADD_FORM = {
  name: '', slug: '', contactEmail: '', currency: '₹', taxPercentage: '5',
  adminEmail: '', adminPassword: '', adminPhone: '',
}
const MIN_PASSWORD_LENGTH = 8
const SLUG_PATTERN = /^[a-z0-9-]+$/
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'HungriARBot'

const PLANS = [
  { key: 'starter',    label: 'Starter',    badgeClass: 'bg-slate-100 text-slate-700',  btnClass: 'border-slate-300 text-slate-700 hover:border-slate-500' },
  { key: 'standard',   label: 'Standard',   badgeClass: 'bg-blue-100 text-blue-700',    btnClass: 'border-blue-300 text-blue-700 hover:border-blue-500' },
  { key: 'ar_premium', label: 'AR Premium', badgeClass: 'bg-amber-100 text-amber-700',  btnClass: 'border-amber-300 text-amber-700 hover:border-amber-500' },
]

// Online-ordering (hungriOrder) subscription tiers — separate from the POS plan above
const ONLINE_TIERS = ['trial', 'starter', 'growth', 'pro']

function OnlineToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${checked ? 'bg-primary-600' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function PlanBadge({ plan }) {
  const cfg = PLANS.find((p) => p.key === plan)
  if (!cfg) return <span className="badge bg-red-50 text-red-500">No Plan</span>
  return <span className={`badge ${cfg.badgeClass}`}>{cfg.label}</span>
}

function slugify(v) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function TelegramStatus({ phoneNumber, telegramLinked }) {
  if (!phoneNumber) return null
  const link = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(phoneNumber)}`

  const copyLink = () => {
    navigator.clipboard.writeText(link)
    toast.success('Telegram link copied!')
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      {telegramLinked ? (
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
          <CheckCircle className="w-3.5 h-3.5" /> Telegram linked
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
          <AlertCircle className="w-3.5 h-3.5" /> Not linked yet
        </span>
      )}
      {!telegramLinked && (
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          <Copy className="w-3 h-3" /> Copy invite link
        </button>
      )}
    </div>
  )
}

export default function Restaurants() {
  const { user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [restaurants, setRestaurants] = useState([])
  const [admins, setAdmins] = useState({})
  const [agreements, setAgreements] = useState({}) // restaurant_id → latest signed agreement
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ ...EMPTY_ADD_FORM })
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [phoneTarget, setPhoneTarget] = useState(null) // { restaurantId, email, current }
  const [phoneInput, setPhoneInput] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [assigningPlan, setAssigningPlan] = useState(null) // { restaurantId, plan }
  const planAssigningRef = useRef(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [restaurantsRes, adminsRes, agreementsRes] = await Promise.all([
      supabase.from('restaurants').select('*').order('created_at', { ascending: false }),
      invokeEdgeFunction('admin-management', { action: 'list_admins' }).catch(() => ({ admins: [] })),
      supabase.from('signed_agreements').select('*').order('signed_at', { ascending: false }),
    ])
    if (!restaurantsRes.error) setRestaurants(restaurantsRes.data || [])
    const adminMap = {}
    for (const a of adminsRes?.admins || []) {
      if (!adminMap[a.restaurantId]) adminMap[a.restaurantId] = a
    }
    setAdmins(adminMap)
    // Latest signed agreement per restaurant (rows are ordered newest-first)
    const agreementMap = {}
    for (const rec of agreementsRes?.data || []) {
      if (!agreementMap[rec.restaurant_id]) agreementMap[rec.restaurant_id] = rec
    }
    setAgreements(agreementMap)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (adding) return
    const name = addForm.name.trim()
    const slug = addForm.slug.trim() || slugify(name)
    const adminEmail = addForm.adminEmail.trim()
    const adminPassword = addForm.adminPassword
    const adminPhone = addForm.adminPhone.trim()
    const taxPercentage = Number(addForm.taxPercentage)
    if (!name || !slug) { toast.error('Name and slug are required'); return }
    if (!SLUG_PATTERN.test(slug)) { toast.error('Slug: lowercase letters, numbers and hyphens only'); return }
    if (!adminEmail) { toast.error('Admin email is required'); return }
    if (adminPassword.length < MIN_PASSWORD_LENGTH || adminPassword.length > MAX_PASSWORD_LENGTH) {
      toast.error(`Admin password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`); return
    }
    if (Number.isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 50) {
      toast.error('Tax percentage must be 0–50'); return
    }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setAdding(true)
    let newId = null
    try {
      const { data: restaurant, error: rErr } = await supabase.from('restaurants').insert({
        name, slug,
        contact_email: addForm.contactEmail.trim() || null,
        currency: addForm.currency.trim() || '₹',
        tax_percentage: taxPercentage,
      }).select().single()
      if (rErr) throw rErr
      newId = restaurant.id
      await invokeEdgeFunction('admin-management', {
        action: 'create_restaurant_admin',
        email: adminEmail,
        password: adminPassword,
        restaurantId: restaurant.id,
        phoneNumber: adminPhone || undefined,
      })
      toast.success(`Restaurant created. Admin: ${adminEmail}`)
      setAddForm({ ...EMPTY_ADD_FORM })
      setShowAddForm(false)
      await fetchData()
    } catch (err) {
      if (newId) await supabase.from('restaurants').delete().eq('id', newId)
      toast.error(err.code === '23505' ? 'A restaurant with this slug already exists' : err.message || 'Failed to create restaurant')
    } finally {
      setAdding(false)
    }
  }

  const handleEditSave = async (restaurantId) => {
    if (savingId) return
    const name = editForm.name.trim()
    const slug = editForm.slug.trim()
    const taxPercentage = Number(editForm.tax_percentage)
    if (!name || !slug) { toast.error('Name and slug are required'); return }
    if (!SLUG_PATTERN.test(slug)) { toast.error('Slug: lowercase letters, numbers and hyphens only'); return }
    if (Number.isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 50) { toast.error('Tax must be 0–50'); return }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSavingId(restaurantId)
    try {
      const { error } = await supabase.from('restaurants').update({
        name, slug,
        contact_email: editForm.contact_email.trim() || null,
        currency: editForm.currency.trim() || '₹',
        tax_percentage: taxPercentage,
      }).eq('id', restaurantId)
      if (error) throw error
      toast.success('Restaurant updated')
      setEditingId(null)
      setEditForm(null)
      await fetchData()
    } catch (err) {
      toast.error(err.code === '23505' ? 'Slug already taken' : err.message || 'Failed to update')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (restaurant) => {
    if (!window.confirm(`Delete "${restaurant.name}"? This permanently removes all data.`)) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const admin = admins[restaurant.id]
    setSavingId(restaurant.id)
    try {
      const { error } = await supabase.from('restaurants').delete().eq('id', restaurant.id)
      if (error) throw error
      if (admin?.userId) {
        await invokeEdgeFunction('admin-management', { action: 'delete_restaurant_admin_user', userId: admin.userId }).catch(() => {})
      }
      toast.success('Restaurant deleted')
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to delete restaurant')
    } finally {
      setSavingId(null)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (resetting || !resetTarget) return
    if (resetPassword.length < MIN_PASSWORD_LENGTH || resetPassword.length > MAX_PASSWORD_LENGTH) {
      toast.error(`Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`); return
    }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setResetting(true)
    try {
      await invokeEdgeFunction('admin-management', { action: 'reset_password', userId: resetTarget.userId, newPassword: resetPassword })
      toast.success(`Password updated for ${resetTarget.email}`)
      setResetTarget(null)
      setResetPassword('')
    } catch (err) {
      toast.error(err.message || 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  const handleAssignPlan = async (restaurantId, plan) => {
    if (planAssigningRef.current) return
    planAssigningRef.current = true
    // Optimistic update — reflect change instantly in the UI
    const prev = restaurants.find((r) => r.id === restaurantId)?.plan ?? null
    setRestaurants((rs) => rs.map((r) => r.id === restaurantId ? { ...r, plan } : r))
    setAssigningPlan({ restaurantId, plan })
    try {
      const { error } = await supabase.from('restaurants').update({ plan }).eq('id', restaurantId)
      if (error) throw error
      toast.success(`Plan set to ${PLANS.find((p) => p.key === plan)?.label}`)
    } catch (err) {
      // Revert optimistic update on failure
      setRestaurants((rs) => rs.map((r) => r.id === restaurantId ? { ...r, plan: prev } : r))
      toast.error(err.message || 'Failed to update plan')
    } finally {
      planAssigningRef.current = false
      setAssigningPlan(null)
    }
  }

  // Online ordering fields (subscription_tier / expiry / delivery_enabled /
  // has_hungriar) — optimistic update, revert on failure. Super admin only:
  // the protect_subscription_fields trigger blocks everyone else anyway.
  const [savingOnlineId, setSavingOnlineId] = useState(null)
  const handleOnlineUpdate = async (restaurantId, patch) => {
    const prev = restaurants.find((r) => r.id === restaurantId)
    setRestaurants((rs) => rs.map((r) => (r.id === restaurantId ? { ...r, ...patch } : r)))
    setSavingOnlineId(restaurantId)
    try {
      const { error } = await supabase.from('restaurants').update(patch).eq('id', restaurantId)
      if (error) throw error
      toast.success('Online ordering settings updated')
    } catch (err) {
      if (prev) setRestaurants((rs) => rs.map((r) => (r.id === restaurantId ? prev : r)))
      toast.error(err.message || 'Failed to update')
    } finally {
      setSavingOnlineId(null)
    }
  }

  const handleSavePhone = async (e) => {
    e.preventDefault()
    if (savingPhone || !phoneTarget) return
    const phone = phoneInput.trim()
    setSavingPhone(true)
    try {
      if (!phone) {
        await invokeEdgeFunction('admin-management', { action: 'remove_owner_phone', restaurantId: phoneTarget.restaurantId })
        toast.success('Phone number removed')
      } else {
        await invokeEdgeFunction('admin-management', { action: 'set_owner_phone', restaurantId: phoneTarget.restaurantId, phoneNumber: phone })
        toast.success('Phone number saved')
      }
      setPhoneTarget(null)
      setPhoneInput('')
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to save phone number')
    } finally {
      setSavingPhone(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''}</p>
        <button type="button" onClick={() => setShowAddForm((v) => !v)} className="btn-primary gap-2">
          <Plus className="w-4 h-4" /> Add Restaurant
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="card space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 font-display">New Restaurant</h2>
              <button type="button" onClick={() => { setShowAddForm(false); setAddForm({ ...EMPTY_ADD_FORM }) }}
                className="btn btn-ghost btn-sm p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="add-name">Restaurant Name</label>
                  <input id="add-name" className="input" value={addForm.name} maxLength={120} required
                    onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor="add-slug">Slug (URL identifier)</label>
                  <input id="add-slug" className="input" placeholder={addForm.name ? slugify(addForm.name) : 'auto-generated'}
                    value={addForm.slug} maxLength={80}
                    onChange={(e) => setAddForm((p) => ({ ...p, slug: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="add-email">Contact Email</label>
                  <input id="add-email" type="email" className="input" value={addForm.contactEmail}
                    onChange={(e) => setAddForm((p) => ({ ...p, contactEmail: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor="add-currency">Currency</label>
                  <input id="add-currency" className="input" value={addForm.currency} maxLength={5}
                    onChange={(e) => setAddForm((p) => ({ ...p, currency: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor="add-tax">Tax %</label>
                  <input id="add-tax" type="number" min="0" max="50" step="0.01" className="input"
                    value={addForm.taxPercentage} onChange={(e) => setAddForm((p) => ({ ...p, taxPercentage: e.target.value }))} />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="label mb-3">Owner Login</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="add-admin-email">Email</label>
                    <input id="add-admin-email" type="email" className="input" value={addForm.adminEmail} required
                      onChange={(e) => setAddForm((p) => ({ ...p, adminEmail: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="add-admin-pw">Password</label>
                    <input id="add-admin-pw" type="text" className="input" value={addForm.adminPassword}
                      maxLength={MAX_PASSWORD_LENGTH} required
                      onChange={(e) => setAddForm((p) => ({ ...p, adminPassword: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="label" htmlFor="add-admin-phone">
                    Owner Phone Number
                    <span className="ml-1 text-gray-400 font-normal">(for Telegram OTP login)</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="add-admin-phone"
                      type="tel"
                      className="input pl-9"
                      placeholder="9876543210"
                      value={addForm.adminPhone}
                      onChange={(e) => setAddForm((p) => ({ ...p, adminPhone: e.target.value }))}
                    />
                  </div>
                  <p className="label-hint mt-1.5">
                    After saving, share <strong>t.me/{BOT_USERNAME}</strong> with the owner — they press Start once to link their Telegram, then log in via OTP.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={adding} className="btn-primary">
                  {adding ? (
                    <span className="flex gap-2 items-center">
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Creating…
                    </span>
                  ) : 'Create Restaurant'}
                </button>
                <button type="button" onClick={() => { setShowAddForm(false); setAddForm({ ...EMPTY_ADD_FORM }) }} className="btn-outline">Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restaurants list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : restaurants.length === 0 ? (
        <div className="card py-14 text-center bg-gray-50">
          <Store className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No restaurants yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {restaurants.map((restaurant) => {
            const admin = admins[restaurant.id]
            const isEditing = editingId === restaurant.id
            const isSaving = savingId === restaurant.id
            const isExpanded = expandedId === restaurant.id

            return (
              <motion.div key={restaurant.id} layout className="card overflow-hidden p-0">
                {/* Restaurant row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : restaurant.id)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex-shrink-0 shadow-sm">
                    <span className="text-white font-bold text-sm">{restaurant.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-sm">{restaurant.name}</p>
                    <p className="text-xs text-gray-400">/{restaurant.slug} · {admin?.email || 'No admin'}</p>
                  </div>
                  <PlanBadge plan={restaurant.plan} />
                  <span className={`badge flex-shrink-0 hidden sm:inline-flex ${SUBSCRIPTION_STATUS_COLORS[restaurant.subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                    {SUBSCRIPTION_STATUS_LABELS[restaurant.subscription_status] || restaurant.subscription_status}
                  </span>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 border-t border-gray-100">
                        {isEditing ? (
                          <div className="pt-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div><label className="label" htmlFor={`en-${restaurant.id}`}>Name</label>
                                <input id={`en-${restaurant.id}`} className="input" value={editForm.name} maxLength={120}
                                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
                              <div><label className="label" htmlFor={`es-${restaurant.id}`}>Slug</label>
                                <input id={`es-${restaurant.id}`} className="input" value={editForm.slug} maxLength={80}
                                  onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value }))} /></div>
                            </div>
                            <div><label className="label" htmlFor={`ee-${restaurant.id}`}>Contact Email</label>
                              <input id={`ee-${restaurant.id}`} type="email" className="input" value={editForm.contact_email}
                                onChange={(e) => setEditForm((p) => ({ ...p, contact_email: e.target.value }))} /></div>
                            <div className="grid grid-cols-2 gap-3">
                              <div><label className="label" htmlFor={`ec-${restaurant.id}`}>Currency</label>
                                <input id={`ec-${restaurant.id}`} className="input" value={editForm.currency} maxLength={5}
                                  onChange={(e) => setEditForm((p) => ({ ...p, currency: e.target.value }))} /></div>
                              <div><label className="label" htmlFor={`et-${restaurant.id}`}>Tax %</label>
                                <input id={`et-${restaurant.id}`} type="number" min="0" max="50" step="0.01" className="input"
                                  value={editForm.tax_percentage} onChange={(e) => setEditForm((p) => ({ ...p, tax_percentage: e.target.value }))} /></div>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" disabled={isSaving} onClick={() => handleEditSave(restaurant.id)} className="btn-primary text-sm">
                                {isSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button type="button" onClick={() => { setEditingId(null); setEditForm(null) }} className="btn-outline text-sm">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-4 space-y-3">
                            <dl className="grid grid-cols-2 gap-2 text-sm">
                              <div className="col-span-1">
                                <dt className="text-xs text-gray-400">Contact</dt>
                                <dd className="text-gray-700 truncate">{restaurant.contact_email || '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-400">Currency / Tax</dt>
                                <dd className="text-gray-700">{restaurant.currency} · {restaurant.tax_percentage}%</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-400">Trial Ends</dt>
                                <dd className="text-gray-700">{formatDate(restaurant.trial_ends_at)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-400">Paid Until</dt>
                                <dd className="text-gray-700">{formatDate(restaurant.paid_until_at)}</dd>
                              </div>
                            </dl>

                            {/* Signed agreement status */}
                            {(() => {
                              const agr = agreements[restaurant.id]
                              return (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {agr ? (
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">
                                          Agreement v{agr.agreement_version} — signed by {agr.signer_name}
                                        </p>
                                        <p className="text-xs text-gray-400">{formatDate(agr.signed_at)}</p>
                                      </div>
                                    ) : (
                                      <span className="flex items-center gap-1.5 text-sm text-amber-600 font-medium">
                                        <AlertCircle className="w-3.5 h-3.5" /> No signed agreement yet
                                      </span>
                                    )}
                                  </div>
                                  {agr && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const ok = openAgreementPdf({ record: agr, restaurantName: restaurant.name })
                                        if (!ok) toast.error('Allow pop-ups to open the agreement')
                                      }}
                                      className="btn btn-ghost btn-sm gap-1 text-xs text-primary-600 flex-shrink-0"
                                    >
                                      <Download className="w-3 h-3" /> PDF
                                    </button>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Admin Account section */}
                            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-3">
                              <p className="text-xs font-medium text-gray-500">Admin Account</p>
                              {admin ? (
                                <>
                                  {/* Email + password reset */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-700 truncate flex-1">{admin.email}</span>
                                    <button type="button"
                                      onClick={() => { setResetTarget(admin); setResetPassword('') }}
                                      className="btn btn-ghost btn-sm gap-1 text-xs flex-shrink-0 text-primary-600">
                                      <KeyRound className="w-3 h-3" /> Reset Password
                                    </button>
                                  </div>

                                  <AnimatePresence>
                                    {resetTarget?.userId === admin?.userId && resetTarget && (
                                      <motion.form
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        onSubmit={handleResetPassword}
                                        className="space-y-2 overflow-hidden"
                                      >
                                        <label className="label text-xs" htmlFor={`rp-${restaurant.id}`}>New password</label>
                                        <input id={`rp-${restaurant.id}`} type="text" className="input" value={resetPassword}
                                          onChange={(e) => setResetPassword(e.target.value)} maxLength={MAX_PASSWORD_LENGTH} autoFocus />
                                        <div className="flex gap-2">
                                          <button type="submit" disabled={resetting} className="btn-primary text-xs py-1.5 px-3">
                                            {resetting ? 'Saving…' : 'Set Password'}
                                          </button>
                                          <button type="button" onClick={() => setResetTarget(null)} className="btn-outline text-xs py-1.5 px-3">Cancel</button>
                                        </div>
                                      </motion.form>
                                    )}
                                  </AnimatePresence>

                                  {/* Phone number + Telegram status */}
                                  <div className="border-t border-gray-200 pt-3">
                                    <div className="flex items-center gap-2">
                                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="text-sm text-gray-700 flex-1 truncate">
                                        {admin.phoneNumber || <span className="text-gray-400 italic">No phone set</span>}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPhoneTarget({ restaurantId: restaurant.id, email: admin.email, current: admin.phoneNumber })
                                          setPhoneInput(admin.phoneNumber ?? '')
                                          setResetTarget(null)
                                        }}
                                        className="btn btn-ghost btn-sm gap-1 text-xs flex-shrink-0 text-primary-600"
                                      >
                                        <Edit2 className="w-3 h-3" /> {admin.phoneNumber ? 'Edit' : 'Set Phone'}
                                      </button>
                                    </div>

                                    {admin.phoneNumber && (
                                      <TelegramStatus
                                        phoneNumber={admin.phoneNumber}
                                        telegramLinked={admin.telegramLinked}
                                      />
                                    )}
                                  </div>

                                  <AnimatePresence>
                                    {phoneTarget?.restaurantId === restaurant.id && phoneTarget && (
                                      <motion.form
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        onSubmit={handleSavePhone}
                                        className="space-y-2 overflow-hidden"
                                      >
                                        <label className="label text-xs" htmlFor={`ph-${restaurant.id}`}>
                                          Phone number (leave blank to remove)
                                        </label>
                                        <div className="relative">
                                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                          <input
                                            id={`ph-${restaurant.id}`}
                                            type="tel"
                                            className="input pl-9"
                                            placeholder="9876543210"
                                            value={phoneInput}
                                            onChange={(e) => setPhoneInput(e.target.value)}
                                            autoFocus
                                          />
                                        </div>
                                        {phoneInput.trim() && (
                                          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
                                            <Link className="w-3 h-3 flex-shrink-0" />
                                            Share this with the owner:{' '}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const link = `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(phoneInput.trim())}`
                                                navigator.clipboard.writeText(link)
                                                toast.success('Link copied!')
                                              }}
                                              className="text-primary-600 font-medium hover:underline"
                                            >
                                              Copy Telegram invite link
                                            </button>
                                          </div>
                                        )}
                                        <div className="flex gap-2">
                                          <button type="submit" disabled={savingPhone} className="btn-primary text-xs py-1.5 px-3">
                                            {savingPhone ? 'Saving…' : 'Save'}
                                          </button>
                                          <button type="button" onClick={() => { setPhoneTarget(null); setPhoneInput('') }} className="btn-outline text-xs py-1.5 px-3">Cancel</button>
                                        </div>
                                      </motion.form>
                                    )}
                                  </AnimatePresence>
                                </>
                              ) : (
                                <p className="text-xs text-gray-400">No admin account linked.</p>
                              )}
                            </div>

                            {/* ── Plan Assignment ── */}
                            <div className="rounded-xl bg-gray-50 px-4 py-3">
                              <div className="flex items-center gap-2 mb-3">
                                <Crown className="w-3.5 h-3.5 text-amber-500" />
                                <p className="text-xs font-semibold text-gray-700">Subscription Plan</p>
                                {restaurant.plan && <PlanBadge plan={restaurant.plan} />}
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                {PLANS.map((p) => {
                                  const isThisOne = assigningPlan?.restaurantId === restaurant.id && assigningPlan?.plan === p.key
                                  const isAnyBusy = assigningPlan?.restaurantId === restaurant.id
                                  return (
                                    <button
                                      key={p.key}
                                      type="button"
                                      disabled={isAnyBusy}
                                      onClick={() => handleAssignPlan(restaurant.id, p.key)}
                                      className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-all flex items-center gap-1.5 ${
                                        restaurant.plan === p.key
                                          ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                                          : `bg-white ${p.btnClass}`
                                      }`}
                                    >
                                      {isThisOne && (
                                        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                      )}
                                      {p.label}
                                    </button>
                                  )
                                })}
                              </div>
                              {!restaurant.plan && (
                                <p className="text-[11px] text-red-500 mt-2">⚠ No plan assigned — restaurant features are locked.</p>
                              )}
                            </div>

                            {/* ── Online Ordering (hungriOrder) ── */}
                            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-3">
                              <div className="flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-primary-500" />
                                <p className="text-xs font-semibold text-gray-700">Online Ordering (hungriOrder)</p>
                                {savingOnlineId === restaurant.id && (
                                  <span className="w-3 h-3 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin" />
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="label text-xs" htmlFor={`ot-${restaurant.id}`}>Subscription Tier</label>
                                  <select
                                    id={`ot-${restaurant.id}`}
                                    className="input text-sm py-1.5 capitalize"
                                    value={restaurant.subscription_tier || 'trial'}
                                    disabled={savingOnlineId === restaurant.id}
                                    onChange={(e) => handleOnlineUpdate(restaurant.id, { subscription_tier: e.target.value })}
                                  >
                                    {ONLINE_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="label text-xs" htmlFor={`oe-${restaurant.id}`}>Subscription Expiry</label>
                                  <input
                                    id={`oe-${restaurant.id}`}
                                    type="date"
                                    className="input text-sm py-1.5"
                                    value={restaurant.subscription_expiry ? String(restaurant.subscription_expiry).slice(0, 10) : ''}
                                    disabled={savingOnlineId === restaurant.id}
                                    onChange={(e) => handleOnlineUpdate(restaurant.id, {
                                      subscription_expiry: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null,
                                    })}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                                  <OnlineToggle
                                    checked={!!restaurant.delivery_enabled}
                                    disabled={savingOnlineId === restaurant.id}
                                    onChange={() => handleOnlineUpdate(restaurant.id, { delivery_enabled: !restaurant.delivery_enabled })}
                                  />
                                  Online ordering enabled
                                </label>
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                                  <OnlineToggle
                                    checked={restaurant.has_hungriar !== false}
                                    disabled={savingOnlineId === restaurant.id}
                                    onChange={() => handleOnlineUpdate(restaurant.id, { has_hungriar: restaurant.has_hungriar === false })}
                                  />
                                  Has hungriAR POS
                                </label>
                              </div>
                              <p className="text-[11px] text-gray-400">
                                "Has hungriAR POS" off = online-only restaurant using the standalone hungriOrder admin.
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <button type="button"
                                onClick={() => {
                                  setEditingId(restaurant.id)
                                  setExpandedId(restaurant.id)
                                  setEditForm({ name: restaurant.name, slug: restaurant.slug, contact_email: restaurant.contact_email || '', currency: restaurant.currency, tax_percentage: String(restaurant.tax_percentage) })
                                }}
                                className="btn-outline text-xs gap-1"><Edit2 className="w-3 h-3" /> Edit</button>
                              <button type="button" disabled={isSaving} onClick={() => handleDelete(restaurant)}
                                className="btn-danger text-xs gap-1"><Trash2 className="w-3 h-3" /> {isSaving ? 'Deleting…' : 'Delete'}</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
