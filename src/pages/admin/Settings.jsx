import { useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, CreditCard, Lock, Camera, Eye, EyeOff, ChefHat } from 'lucide-react'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { uploadAsset, deleteAsset } from '../../lib/storage'
import SubscriptionBanner from '../../components/SubscriptionBanner'
import { formatDate } from '../../utils/formatters'

const TABS = [
  { id: 'profile', label: 'Profile', icon: Building2 },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'security', label: 'Security', icon: Lock },
]

export default function Settings() {
  const { restaurant, user, refreshProfile } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [activeTab, setActiveTab] = useState('profile')

  const [name, setName] = useState(restaurant?.name || '')
  const [contactEmail, setContactEmail] = useState(restaurant?.contact_email || '')
  const [currency, setCurrency] = useState(restaurant?.currency || '₹')
  const [taxPercentage, setTaxPercentage] = useState(restaurant?.tax_percentage ?? 5)
  const [logoUrl, setLogoUrl] = useState(restaurant?.logo_url || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const [chefPin, setChefPin] = useState(restaurant?.chef_pin || '')
  const [savingPin, setSavingPin] = useState(false)

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) { e.target.value = ''; return }
    setUploadingLogo(true)
    try {
      const url = await uploadAsset(restaurant.id, 'images', file)
      const prev = logoUrl
      setLogoUrl(url)
      if (prev) await deleteAsset(prev)
      toast.success('Logo uploaded — click "Save Changes" to apply.')
    } catch (err) {
      toast.error(err.message || 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
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
      const { error } = await supabase.from('restaurants').update({
        name: name.trim(),
        contact_email: contactEmail.trim() || null,
        currency: currency.trim() || '₹',
        tax_percentage: tax,
        logo_url: logoUrl || null,
      }).eq('id', restaurant.id)
      if (error) throw error
      await refreshProfile()
      toast.success('Restaurant settings updated')
    } catch (err) {
      toast.error(err.message || 'Failed to save settings')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChefPinSubmit = async (e) => {
    e.preventDefault()
    if (savingPin) return
    const trimmed = chefPin.trim()
    if (trimmed && (trimmed.length < 4 || trimmed.length > 10)) {
      toast.error('PIN must be 4–10 characters')
      return
    }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSavingPin(true)
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ chef_pin: trimmed || null })
        .eq('id', restaurant.id)
      if (error) throw error
      await refreshProfile()
      toast.success(trimmed ? 'Chef PIN saved' : 'Chef PIN removed')
    } catch (err) {
      toast.error(err.message || 'Failed to save PIN')
    } finally {
      setSavingPin(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (changingPassword) return
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (newPassword.length > MAX_PASSWORD_LENGTH) { toast.error('Password is too long'); return }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
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
    <div className="space-y-5">
      <SubscriptionBanner restaurant={restaurant} />

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all duration-150 ${
              activeTab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'profile' && (
          <motion.section
            key="profile"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="card space-y-5"
          >
            <h2 className="text-base font-bold text-gray-900 font-display">Restaurant Profile</h2>

            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-gray-100" />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold shadow">
                    {name.charAt(0) || 'R'}
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="w-5 h-5 text-white" />
                  <input type="file" accept="image/*" className="sr-only" onChange={handleLogoChange} disabled={uploadingLogo} />
                </label>
              </div>
              <div>
                <label className="btn-outline cursor-pointer text-sm gap-2">
                  {uploadingLogo ? (
                    <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" /> Uploading…</>
                  ) : (
                    <><Camera className="w-3.5 h-3.5" /> {logoUrl ? 'Change Logo' : 'Upload Logo'}</>
                  )}
                  <input type="file" accept="image/*" className="sr-only" onChange={handleLogoChange} disabled={uploadingLogo} />
                </label>
                <p className="mt-1 text-xs text-gray-400">PNG or JPG, up to 20 MB.</p>
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="name">Restaurant Name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="contactEmail">Contact Email</label>
                <input id="contactEmail" type="email" className="input" value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)} maxLength={255} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="currency">Currency Symbol</label>
                  <input id="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} required />
                </div>
                <div>
                  <label className="label" htmlFor="tax">Tax Percentage (%)</label>
                  <input id="tax" type="number" min="0" max="50" step="0.01" className="input"
                    value={taxPercentage} onChange={(e) => setTaxPercentage(e.target.value)} required />
                </div>
              </div>
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Saving…
                  </span>
                ) : 'Save Changes'}
              </button>
            </form>
          </motion.section>
        )}

        {activeTab === 'subscription' && (
          <motion.section
            key="subscription"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="card space-y-4"
          >
            <h2 className="text-base font-bold text-gray-900 font-display">Subscription</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <dt className="text-xs text-gray-400 font-medium">Status</dt>
                <dd className="text-sm font-semibold capitalize text-gray-900 mt-1">{restaurant?.subscription_status}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <dt className="text-xs text-gray-400 font-medium">
                  {restaurant?.subscription_status === 'trial' ? 'Trial Ends' : 'Paid Until'}
                </dt>
                <dd className="text-sm font-semibold text-gray-900 mt-1">
                  {formatDate(restaurant?.subscription_status === 'trial' ? restaurant?.trial_ends_at : restaurant?.paid_until_at)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-gray-400 leading-relaxed">
              Subscription details are managed by the HungriAR team. Contact{' '}
              <a href="mailto:bgo83418@gmail.com" className="text-primary-600 underline underline-offset-2">bgo83418@gmail.com</a>{' '}
              to renew or change your plan.
            </p>
          </motion.section>
        )}

        {activeTab === 'security' && (
          <motion.section
            key="security"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="card space-y-4"
          >
            <h2 className="text-base font-bold text-gray-900 font-display">Change Password</h2>
            {/* Chef PIN */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-800">Chef View PIN</h3>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Staff use this PIN to access the kitchen-only view at{' '}
                <span className="font-mono text-gray-500">/admin/chef</span>.
                Leave blank to allow entry without a PIN.
              </p>
              <form onSubmit={handleChefPinSubmit} className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="4–10 digit PIN"
                  value={chefPin}
                  onChange={(e) => setChefPin(e.target.value)}
                  maxLength={10}
                  className="input flex-1"
                />
                <button type="submit" disabled={savingPin} className="btn-outline shrink-0">
                  {savingPin ? 'Saving…' : 'Save PIN'}
                </button>
              </form>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="newPassword">New Password</label>
                <div className="relative">
                  <input id="newPassword" type={showPw ? 'text' : 'password'} className="input pr-11"
                    value={newPassword} maxLength={MAX_PASSWORD_LENGTH}
                    onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword.length >= 6 && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      newPassword.length < 8 ? 'w-1/3 bg-red-400' :
                      newPassword.length < 12 ? 'w-2/3 bg-amber-400' : 'w-full bg-green-400'
                    }`} />
                  </div>
                )}
              </div>
              <div>
                <label className="label" htmlFor="confirmPassword">Confirm New Password</label>
                <input id="confirmPassword" type={showPw ? 'text' : 'password'} className="input"
                  value={confirmPassword} maxLength={MAX_PASSWORD_LENGTH}
                  onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
                )}
              </div>
              <button type="submit" disabled={changingPassword} className="btn-primary">
                {changingPassword ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Updating…
                  </span>
                ) : 'Update Password'}
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
