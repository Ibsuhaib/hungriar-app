import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Building2, CreditCard, Lock, Camera, Eye, EyeOff, Users, Plus, Trash2, RotateCcw, QrCode, Copy, ChevronDown, ChevronUp, Shield, Globe, ExternalLink } from 'lucide-react'
import QRCodeStyling from 'qr-code-styling'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase, invokeEdgeFunction } from '../../lib/supabase'
import { uploadAsset, deleteAsset } from '../../lib/storage'
import SubscriptionBanner from '../../components/SubscriptionBanner'
import { formatDate } from '../../utils/formatters'
import { savePinHash, clearPin } from '../../components/PinLockScreen'

const TABS = [
  { id: 'profile',      label: 'Profile',      icon: Building2 },
  { id: 'online',       label: 'Online Ordering', icon: Globe },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'security',     label: 'Security',     icon: Lock },
  { id: 'stations',     label: 'Stations',     icon: Users },
]

const WEEK_DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

const STOREFRONT_BASE_URL = import.meta.env.VITE_HUNGRIORDER_URL || 'https://hungriorder.com'

export default function Settings() {
  const { restaurant, user, refreshProfile } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [activeTab, setActiveTab] = useState('profile')

  const [name, setName] = useState(restaurant?.name || '')
  const [contactEmail, setContactEmail] = useState(restaurant?.contact_email || '')
  const [currency, setCurrency] = useState(restaurant?.currency || '₹')
  const [taxPercentage, setTaxPercentage] = useState(restaurant?.tax_percentage ?? 5)
  const [logoUrl, setLogoUrl] = useState(restaurant?.logo_url || '')
  const [address, setAddress] = useState(restaurant?.address || '')
  const [phone, setPhone] = useState(restaurant?.phone || '')
  const [gstin, setGstin] = useState(restaurant?.gstin || '')
  const [fssaiLicenseNo, setFssaiLicenseNo] = useState(restaurant?.fssai_license_no || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // ── Online Ordering state ────────────────────────────────────────────────
  const [deliveryEnabled, setDeliveryEnabled]   = useState(!!restaurant?.delivery_enabled)
  const [coverImageUrl, setCoverImageUrl]       = useState(restaurant?.cover_image_url || '')
  const [description, setDescription]           = useState(restaurant?.description || '')
  const [cuisineTags, setCuisineTags]           = useState((restaurant?.cuisine_tags || []).join(', '))
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(restaurant?.delivery_radius_km ?? 5)
  const [minOrderAmount, setMinOrderAmount]     = useState(restaurant?.min_order_amount ?? 0)
  const [deliveryFee, setDeliveryFee]           = useState(restaurant?.delivery_fee ?? 0)
  const [openingHours, setOpeningHours]         = useState(restaurant?.opening_hours || {})
  const [latitude, setLatitude]                 = useState(restaurant?.latitude ?? '')
  const [longitude, setLongitude]               = useState(restaurant?.longitude ?? '')
  const [locating, setLocating]                 = useState(false)
  const [savingOnline, setSavingOnline]         = useState(false)
  const [uploadingCover, setUploadingCover]     = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // ── Stations state ──────────────────────────────────────────────────────
  const [stations,       setStations]       = useState([])
  const [stationsLoading, setStationsLoading] = useState(false)
  const [newRole,        setNewRole]        = useState('chef')
  const [newLabel,       setNewLabel]       = useState('')
  const [newPin,         setNewPin]         = useState('')
  const [creating,       setCreating]       = useState(false)
  const [expandedQr,     setExpandedQr]     = useState(null) // stationId
  const [deletingId,     setDeletingId]     = useState(null)
  const [resetPinId,     setResetPinId]     = useState(null)
  const [resetPinValue,  setResetPinValue]  = useState('')
  const [resettingPin,   setResettingPin]   = useState(false)

  // ── Manager PIN lock ─────────────────────────────────────────────────────
  const [lockPin,        setLockPin]        = useState('')
  const [savingLockPin,  setSavingLockPin]  = useState(false)
  const lockPinSet = user?.id ? !!localStorage.getItem(`hungriar_pin_${user.id}`) : false

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
        address: address.trim() || null,
        phone: phone.trim() || null,
        gstin: gstin.trim() || null,
        fssai_license_no: fssaiLicenseNo.trim() || null,
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

  const handleCoverChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) { e.target.value = ''; return }
    setUploadingCover(true)
    try {
      const url = await uploadAsset(restaurant.id, 'images', file)
      const prev = coverImageUrl
      setCoverImageUrl(url)
      if (prev) await deleteAsset(prev)
      toast.success('Cover image uploaded — click "Save Online Settings" to apply.')
    } catch (err) {
      toast.error(err.message || 'Failed to upload cover image')
    } finally {
      setUploadingCover(false)
      e.target.value = ''
    }
  }

  // Capture the restaurant's coordinates from this device (use it at the
  // restaurant!). Customers use them to find the nearest restaurants.
  const handleCaptureLocation = () => {
    if (!navigator.geolocation) { toast.error('Location is not supported on this device'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6))
        setLongitude(pos.coords.longitude.toFixed(6))
        setLocating(false)
        toast.success('Location captured — click "Save Online Settings" to apply.')
      },
      () => {
        setLocating(false)
        toast.error('Could not get location. Allow location access and try again.')
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const handleOnlineSubmit = async (e) => {
    e.preventDefault()
    if (savingOnline) return
    const radius = Number(deliveryRadiusKm)
    const minOrder = Number(minOrderAmount)
    const fee = Number(deliveryFee)
    if (Number.isNaN(radius) || radius < 0) { toast.error('Delivery radius must be 0 or more'); return }
    if (Number.isNaN(minOrder) || minOrder < 0) { toast.error('Minimum order amount must be 0 or more'); return }
    if (Number.isNaN(fee) || fee < 0) { toast.error('Delivery fee must be 0 or more'); return }
    const lat = latitude === '' ? null : Number(latitude)
    const lng = longitude === '' ? null : Number(longitude)
    if ((lat === null) !== (lng === null)) { toast.error('Set both latitude and longitude, or leave both empty'); return }
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) { toast.error('Latitude must be between -90 and 90'); return }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) { toast.error('Longitude must be between -180 and 180'); return }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setSavingOnline(true)
    try {
      const tags = cuisineTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
      const hours = Object.fromEntries(
        Object.entries(openingHours).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v),
      )
      const { error } = await supabase.from('restaurants').update({
        delivery_enabled: deliveryEnabled,
        cover_image_url: coverImageUrl || null,
        description: description.trim() || null,
        cuisine_tags: tags,
        delivery_radius_km: Math.round(radius),
        min_order_amount: minOrder,
        delivery_fee: fee,
        opening_hours: hours,
        latitude: lat,
        longitude: lng,
      }).eq('id', restaurant.id)
      if (error) throw error
      await refreshProfile()
      toast.success('Online ordering settings updated')
    } catch (err) {
      toast.error(err.message || 'Failed to save settings')
    } finally {
      setSavingOnline(false)
    }
  }

  const storefrontUrl = `${STOREFRONT_BASE_URL}/r/${restaurant?.slug}`

  const fetchStations = useCallback(async () => {
    if (!restaurant?.id) return
    setStationsLoading(true)
    const { data } = await supabase
      .from('restaurant_stations')
      .select('id, role, label, created_at')
      .eq('restaurant_id', restaurant.id)
      .order('created_at')
    setStations(data ?? [])
    setStationsLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    if (activeTab === 'stations') fetchStations()
  }, [activeTab, fetchStations])

  const handleCreateStation = async (e) => {
    e.preventDefault()
    if (creating) return
    if (!/^\d{4,6}$/.test(newPin)) { toast.error('PIN must be 4–6 digits'); return }
    setCreating(true)
    try {
      const { stationId, role, label } = await invokeEdgeFunction('create-station', {
        restaurantId: restaurant.id,
        role: newRole,
        label: newLabel.trim(),
        pin: newPin,
      })
      toast.success(`${role === 'chef' ? 'Chef' : role === 'delivery' ? 'Delivery' : 'Staff'} station created!`)
      setNewLabel('')
      setNewPin('')
      setStations((prev) => [...prev, { id: stationId, role, label, created_at: new Date().toISOString() }])
    } catch (err) {
      toast.error(err.message || 'Failed to create station')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteStation = async (stationId) => {
    if (!window.confirm('Delete this station? The device will be logged out immediately.')) return
    setDeletingId(stationId)
    try {
      await invokeEdgeFunction('delete-station', { stationId }, { method: 'POST' })
      toast.success('Station deleted')
      setStations((prev) => prev.filter((s) => s.id !== stationId))
      if (expandedQr === stationId) setExpandedQr(null)
    } catch (err) {
      toast.error(err.message || 'Failed to delete station')
    } finally {
      setDeletingId(null)
    }
  }

  const handleResetPin = async (e) => {
    e.preventDefault()
    if (resettingPin || !resetPinId) return
    if (!/^\d{4,6}$/.test(resetPinValue)) { toast.error('PIN must be 4–6 digits'); return }
    setResettingPin(true)
    try {
      await invokeEdgeFunction('reset-station-pin', { stationId: resetPinId, pin: resetPinValue })
      toast.success('PIN reset — existing session invalidated')
      setResetPinId(null)
      setResetPinValue('')
    } catch (err) {
      toast.error(err.message || 'Failed to reset PIN')
    } finally {
      setResettingPin(false)
    }
  }

  const handleSaveLockPin = async (e) => {
    e.preventDefault()
    if (!/^\d{4,6}$/.test(lockPin)) { toast.error('Lock PIN must be 4–6 digits'); return }
    setSavingLockPin(true)
    try {
      await savePinHash(user?.id, lockPin)
      setLockPin('')
      toast.success('Lock PIN saved — screen will auto-lock after 30 min of inactivity')
    } catch {
      toast.error('Failed to save PIN')
    } finally {
      setSavingLockPin(false)
    }
  }

  const handleClearLockPin = () => {
    if (!window.confirm('Remove the lock PIN? The screen will no longer auto-lock.')) return
    clearPin(user?.id)
    toast.success('Lock PIN removed')
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

              <div className="pt-2 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Business Details for Bills</h3>
                <p className="text-xs text-gray-400 -mt-2 mb-3 leading-relaxed">
                  Shown on printed bills when filled in. Leave blank to omit a line.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="label" htmlFor="address">Restaurant Address</label>
                    <textarea id="address" className="input resize-none" rows={2} maxLength={300}
                      placeholder="123 MG Road, Bengaluru 560001"
                      value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label" htmlFor="phone">Phone Number</label>
                      <input id="phone" type="tel" className="input" maxLength={20}
                        placeholder="98765 43210"
                        value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div>
                      <label className="label" htmlFor="gstin">GSTIN</label>
                      <input id="gstin" className="input" maxLength={20}
                        placeholder="29ABCDE1234F1Z5"
                        value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="fssai">FSSAI License No.</label>
                    <input id="fssai" className="input" maxLength={20}
                      placeholder="12345678901234"
                      value={fssaiLicenseNo} onChange={(e) => setFssaiLicenseNo(e.target.value)} />
                  </div>
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

        {activeTab === 'online' && (
          <motion.section
            key="online"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="card space-y-5"
          >
            <div>
              <h2 className="text-base font-bold text-gray-900 font-display">Online Ordering</h2>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Give your restaurant an online storefront where customers place delivery and takeaway
                orders. Orders arrive live on the Orders page under the Delivery/Takeaway tabs.
              </p>
            </div>

            {/* Enable toggle */}
            <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-gray-800">Enable Online Ordering</p>
                <p className="text-xs text-gray-400 mt-0.5">Turn your public storefront on or off</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={deliveryEnabled}
                onClick={() => setDeliveryEnabled((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${deliveryEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${deliveryEnabled ? 'translate-x-5' : ''}`} />
              </button>
            </label>

            {/* Storefront URL (slug is managed by the HungriAR team) */}
            <div>
              <label className="label">Your Store URL</label>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                <span className="text-xs text-gray-600 font-mono break-all flex-1">{storefrontUrl}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(storefrontUrl).then(() => toast.success('Store URL copied!'))}
                  className="shrink-0 text-gray-400 hover:text-primary-600"
                  title="Copy URL"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a href={storefrontUrl} target="_blank" rel="noreferrer" className="shrink-0 text-gray-400 hover:text-primary-600" title="Open storefront">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="label-hint mt-1.5">
                The URL name (<span className="font-mono">{restaurant?.slug}</span>) is set by the HungriAR team —
                contact support to change it.
              </p>
            </div>

            <form onSubmit={handleOnlineSubmit} className="space-y-4">
              {/* Cover image */}
              <div>
                <label className="label">Cover Image</label>
                {coverImageUrl && (
                  <img src={coverImageUrl} alt="Storefront cover" className="w-full h-32 object-cover rounded-xl mb-2 ring-1 ring-gray-100" />
                )}
                <label className="btn-outline cursor-pointer text-sm gap-2 inline-flex">
                  {uploadingCover ? (
                    <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" /> Uploading…</>
                  ) : (
                    <><Camera className="w-3.5 h-3.5" /> {coverImageUrl ? 'Change Cover' : 'Upload Cover'}</>
                  )}
                  <input type="file" accept="image/*" className="sr-only" onChange={handleCoverChange} disabled={uploadingCover} />
                </label>
              </div>

              <div>
                <label className="label" htmlFor="online-desc">Description</label>
                <textarea id="online-desc" className="input resize-none" rows={3} maxLength={500}
                  placeholder="Tell customers about your restaurant…"
                  value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div>
                <label className="label" htmlFor="online-tags">Cuisine Tags</label>
                <input id="online-tags" className="input" maxLength={200}
                  placeholder="e.g. north-indian, chinese, biryani (comma-separated)"
                  value={cuisineTags} onChange={(e) => setCuisineTags(e.target.value)} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label" htmlFor="online-radius">Delivery Radius (km)</label>
                  <input id="online-radius" type="number" min="0" step="1" className="input"
                    value={deliveryRadiusKm} onChange={(e) => setDeliveryRadiusKm(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="online-min">Min Order ({restaurant?.currency || '₹'})</label>
                  <input id="online-min" type="number" min="0" step="0.01" className="input"
                    value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="online-fee">Delivery Fee ({restaurant?.currency || '₹'})</label>
                  <input id="online-fee" type="number" min="0" step="0.01" className="input"
                    value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
                </div>
              </div>

              {/* Restaurant location — powers "nearest restaurants" on the storefront */}
              <div>
                <label className="label">Restaurant Location</label>
                <p className="label-hint mb-2">
                  Customers see the nearest restaurants first, and your delivery radius is measured
                  from this point. Tap the button while you're at the restaurant.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    disabled={locating}
                    className="btn-outline text-sm gap-2"
                  >
                    {locating ? (
                      <><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" /> Locating…</>
                    ) : (
                      <>📍 {latitude ? 'Update Location' : 'Capture Current Location'}</>
                    )}
                  </button>
                  {latitude && longitude ? (
                    <a
                      href={`https://maps.google.com/?q=${latitude},${longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-600 underline underline-offset-2"
                    >
                      {Number(latitude).toFixed(4)}, {Number(longitude).toFixed(4)} — view on map
                    </a>
                  ) : (
                    <span className="text-xs text-amber-600">Not set — your restaurant won't appear in "nearest" sorting</span>
                  )}
                </div>
              </div>

              {/* Opening hours */}
              <div>
                <label className="label">Opening Hours</label>
                <p className="label-hint mb-2">Format: 09:00-22:00 · leave a day blank if hours vary or you're closed</p>
                <div className="space-y-1.5">
                  {WEEK_DAYS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 w-20 flex-shrink-0">{label}</span>
                      <input
                        type="text"
                        className="input text-sm py-1.5 flex-1"
                        placeholder="09:00-22:00"
                        maxLength={11}
                        value={openingHours[key] || ''}
                        onChange={(e) => setOpeningHours((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={savingOnline} className="btn-primary">
                {savingOnline ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Saving…
                  </span>
                ) : 'Save Online Settings'}
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
              <a href="mailto:hungriar.app@gmail.com" className="text-primary-600 underline underline-offset-2">hungriar.app@gmail.com</a>{' '}
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
            {/* Manager PIN lock */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-800">Session Lock PIN</h3>
                {lockPinSet && (
                  <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">Active</span>
                )}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Locks the admin panel after 30 minutes of inactivity. You'll enter this PIN to resume without signing out.
                Your Supabase session stays active — this is a screen lock only.
              </p>
              <form onSubmit={handleSaveLockPin} className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder={lockPinSet ? 'Set a new PIN to change' : '4–6 digit PIN'}
                  value={lockPin}
                  onChange={(e) => setLockPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="input flex-1"
                />
                <button type="submit" disabled={savingLockPin} className="btn-outline shrink-0">
                  {savingLockPin ? 'Saving…' : lockPinSet ? 'Update PIN' : 'Set PIN'}
                </button>
              </form>
              {lockPinSet && (
                <button
                  type="button"
                  onClick={handleClearLockPin}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Remove lock PIN
                </button>
              )}
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
        {activeTab === 'stations' && (
          <motion.section
            key="stations"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Create station form */}
            <div className="card space-y-4">
              <h2 className="text-base font-bold text-gray-900 font-display">Add Station</h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                A station is a tablet or screen for your chef or waiter. They scan the QR code and enter the PIN
                you set here — no Telegram OTP required. Deleting a station immediately revokes access.
              </p>
              <form onSubmit={handleCreateStation} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Role</label>
                    <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                      <option value="chef">Chef</option>
                      <option value="staff">Staff (waiter)</option>
                      <option value="delivery">Delivery Boy</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Label (optional)</label>
                    <input className="input" placeholder="e.g. Kitchen 1" maxLength={50}
                      value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">PIN (4–6 digits)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    className="input"
                    placeholder="Enter a numeric PIN"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                  />
                </div>
                <button type="submit" disabled={creating} className="btn-primary gap-2">
                  {creating
                    ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Creating…</>
                    : <><Plus className="w-3.5 h-3.5" /> Create Station</>}
                </button>
              </form>
            </div>

            {/* Station list */}
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Your Stations</h3>
              {stationsLoading ? (
                <div className="space-y-2">
                  {[1,2].map((i) => <div key={i} className="h-14 skeleton rounded-xl" />)}
                </div>
              ) : stations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No stations yet.</p>
              ) : (
                <div className="space-y-2">
                  {stations.map((s) => (
                    <div key={s.id} className="border border-gray-100 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold ${s.role === 'chef' ? 'bg-orange-400' : s.role === 'delivery' ? 'bg-purple-500' : 'bg-primary-500'}`}>
                          {s.role === 'chef' ? '👨‍🍳' : s.role === 'delivery' ? '🛵' : '🧑‍💼'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-none">
                            {s.label || (s.role === 'chef' ? 'Chef Station' : s.role === 'delivery' ? 'Delivery Station' : 'Staff Station')}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 capitalize">{s.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedQr(expandedQr === s.id ? null : s.id)}
                          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          {expandedQr === s.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          title="Reset PIN"
                          onClick={() => { setResetPinId(s.id); setResetPinValue('') }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete station"
                          disabled={deletingId === s.id}
                          onClick={() => handleDeleteStation(s.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* QR panel */}
                      <AnimatePresence>
                        {expandedQr === s.id && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <StationQR stationId={s.id} />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Reset PIN panel */}
                      <AnimatePresence>
                        {resetPinId === s.id && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <form onSubmit={handleResetPin} className="px-4 pb-4 flex gap-2 border-t border-gray-100 pt-3">
                              <input
                                type="password"
                                inputMode="numeric"
                                placeholder="New 4–6 digit PIN"
                                value={resetPinValue}
                                maxLength={6}
                                onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="input flex-1 text-sm"
                                autoFocus
                              />
                              <button type="submit" disabled={resettingPin} className="btn-primary text-sm py-2 px-4 shrink-0">
                                {resettingPin ? 'Saving…' : 'Reset'}
                              </button>
                              <button type="button" onClick={() => setResetPinId(null)} className="btn-outline text-sm py-2 px-3 shrink-0">
                                Cancel
                              </button>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Inline QR renderer for a station ────────────────────────────────────────
function StationQR({ stationId }) {
  const canvasRef = useRef(null)
  const qrRef     = useRef(null)
  const loginUrl  = `${window.location.origin}/station/${stationId}`

  useEffect(() => {
    if (!canvasRef.current) return
    qrRef.current = new QRCodeStyling({
      width: 160, height: 160,
      data: loginUrl,
      dotsOptions:          { type: 'square', color: '#111827' },
      cornersSquareOptions: { type: 'square', color: '#111827' },
      cornersDotOptions:    { type: 'square', color: '#111827' },
      backgroundOptions:    { color: '#ffffff' },
    })
    qrRef.current.append(canvasRef.current)
  }, [loginUrl])

  const handleCopy = () => {
    navigator.clipboard.writeText(loginUrl).then(() => toast.success('Login URL copied!'))
  }

  return (
    <div className="px-4 pb-4 border-t border-gray-100 pt-4 flex flex-col sm:flex-row items-start gap-4">
      <div className="bg-white border border-gray-100 rounded-xl p-2 shadow-sm">
        <div ref={canvasRef} />
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-xs text-gray-500 font-medium">Login URL</p>
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
          <span className="text-xs text-gray-600 font-mono break-all flex-1">{loginUrl}</span>
          <button type="button" onClick={handleCopy} className="shrink-0 text-gray-400 hover:text-primary-600">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          Print or share the QR code. The device scans it and enters the PIN you set.
        </p>
      </div>
    </div>
  )
}
