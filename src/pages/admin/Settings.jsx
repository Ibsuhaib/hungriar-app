import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { uploadAsset, deleteAsset } from '../../lib/storage'
import SubscriptionBanner from '../../components/SubscriptionBanner'
import { formatDate } from '../../utils/formatters'

export default function Settings() {
  const { restaurant, user, refreshProfile } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [name, setName] = useState(restaurant?.name || '')
  const [contactEmail, setContactEmail] = useState(restaurant?.contact_email || '')
  const [currency, setCurrency] = useState(restaurant?.currency || '₹')
  const [taxPercentage, setTaxPercentage] = useState(restaurant?.tax_percentage ?? 5)
  const [logoUrl, setLogoUrl] = useState(restaurant?.logo_url || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) {
      event.target.value = ''
      return
    }

    setUploadingLogo(true)
    try {
      const url = await uploadAsset(restaurant.id, 'images', file)
      const previousUrl = logoUrl
      setLogoUrl(url)
      if (previousUrl) await deleteAsset(previousUrl)
      toast.success('Logo uploaded. Click "Save Changes" to apply it.')
    } catch (err) {
      toast.error(err.message || 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
      event.target.value = ''
    }
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    if (savingProfile) return

    const tax = Number(taxPercentage)
    if (Number.isNaN(tax) || tax < 0 || tax > 50) {
      toast.error('Tax percentage must be between 0 and 50')
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setSavingProfile(true)
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          name: name.trim(),
          contact_email: contactEmail.trim() || null,
          currency: currency.trim() || '₹',
          tax_percentage: tax,
          logo_url: logoUrl || null,
        })
        .eq('id', restaurant.id)

      if (error) throw error

      await refreshProfile()
      toast.success('Restaurant settings updated')
    } catch (err) {
      toast.error(err.message || 'Failed to save settings')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    if (changingPassword) return

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      toast.error('Password is too long')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password updated')
    } catch (err) {
      toast.error(err.message || 'Failed to update password')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <SubscriptionBanner restaurant={restaurant} />

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Restaurant Profile</h2>

        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Restaurant logo" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sand-200 text-2xl">🍽</div>
          )}
          <div>
            <label className="btn-outline cursor-pointer text-sm">
              {uploadingLogo ? 'Uploading...' : 'Change Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
            </label>
            <p className="mt-1 text-xs text-gray-400">PNG or JPG, up to 20MB.</p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Restaurant Name
            </label>
            <input id="name" className="input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="contactEmail">
              Contact Email
            </label>
            <input
              id="contactEmail"
              type="email"
              className="input"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              maxLength={255}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="currency">
                Currency Symbol
              </label>
              <input
                id="currency"
                className="input"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                maxLength={3}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="tax">
                Tax Percentage (%)
              </label>
              <input
                id="tax"
                type="number"
                min="0"
                max="50"
                step="0.01"
                className="input"
                value={taxPercentage}
                onChange={(event) => setTaxPercentage(event.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="font-medium capitalize text-gray-900">{restaurant?.subscription_status}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{restaurant?.subscription_status === 'trial' ? 'Trial Ends' : 'Paid Until'}</dt>
            <dd className="font-medium text-gray-900">
              {formatDate(restaurant?.subscription_status === 'trial' ? restaurant?.trial_ends_at : restaurant?.paid_until_at)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-gray-400">
          Subscription details are managed by the Goana AR team. Contact support to renew or change your plan.
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="newPassword">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              className="input"
              value={newPassword}
              maxLength={MAX_PASSWORD_LENGTH}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="input"
              value={confirmPassword}
              maxLength={MAX_PASSWORD_LENGTH}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" disabled={changingPassword} className="btn-primary">
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>
    </div>
  )
}
