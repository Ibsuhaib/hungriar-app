import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase, invokeEdgeFunction } from '../../lib/supabase'
import { formatDate, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_COLORS } from '../../utils/formatters'

const EMPTY_ADD_FORM = {
  name: '',
  slug: '',
  contactEmail: '',
  currency: '₹',
  taxPercentage: '5',
  adminEmail: '',
  adminPassword: '',
}

const MIN_PASSWORD_LENGTH = 8
const SLUG_PATTERN = /^[a-z0-9-]+$/

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function Restaurants() {
  const { user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [restaurants, setRestaurants] = useState([])
  const [admins, setAdmins] = useState({})
  const [loading, setLoading] = useState(true)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ ...EMPTY_ADD_FORM })
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [restaurantsRes, adminsRes] = await Promise.all([
      supabase.from('restaurants').select('*').order('created_at', { ascending: false }),
      invokeEdgeFunction('admin-management', { action: 'list_admins' }).catch(() => ({ admins: [] })),
    ])

    if (!restaurantsRes.error) setRestaurants(restaurantsRes.data || [])

    const adminMap = {}
    for (const admin of adminsRes?.admins || []) {
      if (!adminMap[admin.restaurantId]) adminMap[admin.restaurantId] = admin
    }
    setAdmins(adminMap)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleAddSubmit = async (event) => {
    event.preventDefault()
    if (adding) return

    const name = addForm.name.trim()
    const slug = addForm.slug.trim() || slugify(name)
    const adminEmail = addForm.adminEmail.trim()
    const adminPassword = addForm.adminPassword
    const taxPercentage = Number(addForm.taxPercentage)

    if (!name || !slug) {
      toast.error('Name and slug are required')
      return
    }
    if (!SLUG_PATTERN.test(slug)) {
      toast.error('Slug can only contain lowercase letters, numbers and hyphens')
      return
    }
    if (!adminEmail) {
      toast.error('Admin email is required')
      return
    }
    if (adminPassword.length < MIN_PASSWORD_LENGTH || adminPassword.length > MAX_PASSWORD_LENGTH) {
      toast.error(`Admin password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`)
      return
    }
    if (Number.isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 50) {
      toast.error('Tax percentage must be between 0 and 50')
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setAdding(true)
    let newRestaurantId = null
    try {
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .insert({
          name,
          slug,
          contact_email: addForm.contactEmail.trim() || null,
          currency: addForm.currency.trim() || '₹',
          tax_percentage: taxPercentage,
        })
        .select()
        .single()

      if (restaurantError) throw restaurantError
      newRestaurantId = restaurant.id

      await invokeEdgeFunction('admin-management', {
        action: 'create_restaurant_admin',
        email: adminEmail,
        password: adminPassword,
        restaurantId: restaurant.id,
      })

      toast.success(`Restaurant created. Admin login: ${adminEmail}`)
      setAddForm({ ...EMPTY_ADD_FORM })
      setShowAddForm(false)
      await fetchData()
    } catch (err) {
      if (newRestaurantId) {
        await supabase.from('restaurants').delete().eq('id', newRestaurantId)
      }
      if (err.code === '23505') {
        toast.error('A restaurant with this slug already exists')
      } else {
        toast.error(err.message || 'Failed to create restaurant')
      }
    } finally {
      setAdding(false)
    }
  }

  const openEditForm = (restaurant) => {
    setEditingId(restaurant.id)
    setEditForm({
      name: restaurant.name,
      slug: restaurant.slug,
      contact_email: restaurant.contact_email || '',
      currency: restaurant.currency,
      tax_percentage: String(restaurant.tax_percentage),
    })
  }

  const closeEditForm = () => {
    setEditingId(null)
    setEditForm(null)
  }

  const handleEditSave = async (restaurantId) => {
    if (savingId) return

    const name = editForm.name.trim()
    const slug = editForm.slug.trim()
    const taxPercentage = Number(editForm.tax_percentage)

    if (!name || !slug) {
      toast.error('Name and slug are required')
      return
    }
    if (!SLUG_PATTERN.test(slug)) {
      toast.error('Slug can only contain lowercase letters, numbers and hyphens')
      return
    }
    if (Number.isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 50) {
      toast.error('Tax percentage must be between 0 and 50')
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setSavingId(restaurantId)
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          name,
          slug,
          contact_email: editForm.contact_email.trim() || null,
          currency: editForm.currency.trim() || '₹',
          tax_percentage: taxPercentage,
        })
        .eq('id', restaurantId)

      if (error) throw error

      toast.success('Restaurant updated')
      closeEditForm()
      await fetchData()
    } catch (err) {
      if (err.code === '23505') toast.error('A restaurant with this slug already exists')
      else toast.error(err.message || 'Failed to update restaurant')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (restaurant) => {
    if (
      !window.confirm(
        `Delete "${restaurant.name}"? This permanently removes its menu, tables, orders and history. This cannot be undone.`,
      )
    ) {
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const admin = admins[restaurant.id]
    setSavingId(restaurant.id)
    try {
      const { error } = await supabase.from('restaurants').delete().eq('id', restaurant.id)
      if (error) throw error

      if (admin?.userId) {
        await invokeEdgeFunction('admin-management', {
          action: 'delete_restaurant_admin_user',
          userId: admin.userId,
        }).catch(() => {})
      }

      toast.success('Restaurant deleted')
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to delete restaurant')
    } finally {
      setSavingId(null)
    }
  }

  const openResetForm = (admin) => {
    setResetTarget(admin)
    setResetPassword('')
  }

  const handleResetPassword = async (event) => {
    event.preventDefault()
    if (resetting || !resetTarget) return

    if (resetPassword.length < MIN_PASSWORD_LENGTH || resetPassword.length > MAX_PASSWORD_LENGTH) {
      toast.error(`Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`)
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setResetting(true)
    try {
      await invokeEdgeFunction('admin-management', {
        action: 'reset_password',
        userId: resetTarget.userId,
        newPassword: resetPassword,
      })
      toast.success(`Password updated for ${resetTarget.email}`)
      setResetTarget(null)
      setResetPassword('')
    } catch (err) {
      toast.error(err.message || 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{restaurants.length} restaurant{restaurants.length === 1 ? '' : 's'} on Goana AR</p>
        {!showAddForm && (
          <button type="button" onClick={() => setShowAddForm(true)} className="btn-primary">
            + Add Restaurant
          </button>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">New Restaurant</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="add-name">
                Restaurant Name
              </label>
              <input
                id="add-name"
                className="input"
                value={addForm.name}
                onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                maxLength={120}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="add-slug">
                Slug (used in QR links)
              </label>
              <input
                id="add-slug"
                className="input"
                placeholder={addForm.name ? slugify(addForm.name) : 'auto-generated from name'}
                value={addForm.slug}
                onChange={(event) => setAddForm((prev) => ({ ...prev, slug: event.target.value }))}
                maxLength={80}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="add-contact-email">
                Contact Email
              </label>
              <input
                id="add-contact-email"
                type="email"
                className="input"
                value={addForm.contactEmail}
                onChange={(event) => setAddForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="add-currency">
                Currency Symbol
              </label>
              <input
                id="add-currency"
                className="input"
                value={addForm.currency}
                onChange={(event) => setAddForm((prev) => ({ ...prev, currency: event.target.value }))}
                maxLength={5}
              />
            </div>
            <div>
              <label className="label" htmlFor="add-tax">
                Tax %
              </label>
              <input
                id="add-tax"
                type="number"
                min="0"
                max="50"
                step="0.01"
                className="input"
                value={addForm.taxPercentage}
                onChange={(event) => setAddForm((prev) => ({ ...prev, taxPercentage: event.target.value }))}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">Restaurant Admin Login</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="add-admin-email">
                  Admin Email
                </label>
                <input
                  id="add-admin-email"
                  type="email"
                  className="input"
                  value={addForm.adminEmail}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, adminEmail: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="add-admin-password">
                  Admin Password
                </label>
                <input
                  id="add-admin-password"
                  type="text"
                  className="input"
                  value={addForm.adminPassword}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, adminPassword: event.target.value }))}
                  maxLength={MAX_PASSWORD_LENGTH}
                  required
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Share this email and password with the restaurant owner. They can change the password later from Settings.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={adding} className="btn-primary">
              {adding ? 'Creating...' : 'Create Restaurant'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setAddForm({ ...EMPTY_ADD_FORM })
              }}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      ) : restaurants.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No restaurants yet. Add the first one above.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {restaurants.map((restaurant) => {
            const admin = admins[restaurant.id]
            const isEditing = editingId === restaurant.id
            const isSaving = savingId === restaurant.id

            return (
              <div key={restaurant.id} className="card space-y-3">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor={`edit-name-${restaurant.id}`}>
                          Name
                        </label>
                        <input
                          id={`edit-name-${restaurant.id}`}
                          className="input"
                          value={editForm.name}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                          maxLength={120}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`edit-slug-${restaurant.id}`}>
                          Slug
                        </label>
                        <input
                          id={`edit-slug-${restaurant.id}`}
                          className="input"
                          value={editForm.slug}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, slug: event.target.value }))}
                          maxLength={80}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label" htmlFor={`edit-email-${restaurant.id}`}>
                        Contact Email
                      </label>
                      <input
                        id={`edit-email-${restaurant.id}`}
                        type="email"
                        className="input"
                        value={editForm.contact_email}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, contact_email: event.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label" htmlFor={`edit-currency-${restaurant.id}`}>
                          Currency
                        </label>
                        <input
                          id={`edit-currency-${restaurant.id}`}
                          className="input"
                          value={editForm.currency}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, currency: event.target.value }))}
                          maxLength={5}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`edit-tax-${restaurant.id}`}>
                          Tax %
                        </label>
                        <input
                          id={`edit-tax-${restaurant.id}`}
                          type="number"
                          min="0"
                          max="50"
                          step="0.01"
                          className="input"
                          value={editForm.tax_percentage}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, tax_percentage: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={isSaving} onClick={() => handleEditSave(restaurant.id)} className="btn-primary">
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button type="button" onClick={closeEditForm} className="btn-outline">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">{restaurant.name}</h2>
                        <p className="text-xs text-gray-500">/{restaurant.slug}</p>
                      </div>
                      <span className={`badge ${SUBSCRIPTION_STATUS_COLORS[restaurant.subscription_status] || 'bg-gray-100 text-gray-600'}`}>
                        {SUBSCRIPTION_STATUS_LABELS[restaurant.subscription_status] || restaurant.subscription_status}
                      </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div>
                        <dt className="text-xs text-gray-400">Contact</dt>
                        <dd className="truncate">{restaurant.contact_email || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-400">Currency / Tax</dt>
                        <dd>{restaurant.currency} &middot; {restaurant.tax_percentage}%</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-400">Trial Ends</dt>
                        <dd>{formatDate(restaurant.trial_ends_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-400">Paid Until</dt>
                        <dd>{formatDate(restaurant.paid_until_at)}</dd>
                      </div>
                    </dl>

                    <div className="border-t pt-2 text-sm">
                      <p className="text-xs text-gray-400">Admin Login</p>
                      {admin ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-gray-700">{admin.email}</span>
                          <button type="button" onClick={() => openResetForm(admin)} className="text-xs font-medium text-primary-600 hover:underline">
                            Reset Password
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-400">No admin account linked</p>
                      )}
                    </div>

                    {resetTarget?.userId === admin?.userId && resetTarget && (
                      <form onSubmit={handleResetPassword} className="space-y-2 rounded-lg bg-sand-100 p-3">
                        <label className="label" htmlFor={`reset-password-${restaurant.id}`}>
                          New password for {resetTarget.email}
                        </label>
                        <input
                          id={`reset-password-${restaurant.id}`}
                          type="text"
                          className="input"
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          maxLength={MAX_PASSWORD_LENGTH}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button type="submit" disabled={resetting} className="btn-primary px-3 py-1.5 text-xs">
                            {resetting ? 'Saving...' : 'Set Password'}
                          </button>
                          <button type="button" onClick={() => setResetTarget(null)} className="btn-outline px-3 py-1.5 text-xs">
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => openEditForm(restaurant)} className="btn-outline px-3 py-1.5 text-xs">
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleDelete(restaurant)}
                        className="btn-danger px-3 py-1.5 text-xs"
                      >
                        {isSaving ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
