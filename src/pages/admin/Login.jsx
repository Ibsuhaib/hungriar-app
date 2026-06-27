import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { LogIn, Phone, MessageCircle, ArrowRight, Utensils, RotateCcw, Store, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { invokeEdgeFunction } from '../../lib/supabase'

const FEATURES = [
  { icon: '🍽', title: 'Live Menu Management', desc: 'Update items, prices, and availability in real time.' },
  { icon: '📱', title: 'AR Food Previews', desc: 'Let customers view dishes in 3D before ordering.' },
  { icon: '📊', title: 'Order Analytics', desc: 'Track revenue and top sellers at a glance.' },
]

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'HungriARBot'

export default function Login() {
  const { user, role, signIn } = useAuth()
  const navigate = useNavigate()

  // step: 'phone' | 'telegram' | 'otp' | 'restaurants' | 'password'
  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [telegramLink, setTelegramLink] = useState('')
  const [restaurantList, setRestaurantList] = useState([])
  const [selectedRestaurant, setSelectedRestaurant] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (user && role === 'admin') return <Navigate to="/admin" replace />

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e?.preventDefault()
    if (!phone.trim() || submitting) return
    setSubmitting(true)
    try {
      await invokeEdgeFunction('send-otp', { phone_number: phone.trim() })
      toast.success('OTP sent to your Telegram!')
      setStep('otp')
    } catch (err) {
      if (err.message === 'telegram_not_linked' || err.status === 403) {
        const encoded = encodeURIComponent(phone.trim())
        setTelegramLink(`https://t.me/${BOT_USERNAME}?start=${encoded}`)
        setStep('telegram')
      } else {
        toast.error(err.message || 'Failed to send OTP. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 2: verify OTP → get restaurant list ─────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (!otp.trim() || submitting) return
    setSubmitting(true)
    try {
      const result = await invokeEdgeFunction('verify-otp', {
        phone_number: phone.trim(),
        code: otp.trim(),
      })

      if (!result.restaurants?.length) {
        toast.error('No restaurants found for this number. Contact support.')
        return
      }

      setRestaurantList(result.restaurants)
      setStep('restaurants')
    } catch (err) {
      toast.error(err.message || 'Invalid code. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 3: pick a restaurant → show password form ───────────────────────
  const handleSelectRestaurant = (restaurant) => {
    setSelectedRestaurant(restaurant)
    setEmail(restaurant.adminEmail)
    setPassword('')
    setStep('password')
  }

  // ── Step 4: email + password → Supabase session ──────────────────────────
  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password || submitting) return
    setSubmitting(true)
    try {
      const { role: signedInRole } = await signIn(email.trim(), password)
      if (signedInRole !== 'admin') {
        toast.error('This account does not have restaurant admin access.')
        return
      }
      navigate('/admin', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Sign in failed. Check your password.')
    } finally {
      setSubmitting(false)
    }
  }

  const slideProps = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.2 },
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div
        className="hidden lg:flex lg:w-[45%] xl:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(155deg, #1c1c1c 0%, #2d1a10 60%, #1c1c1c 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }} />
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 30% 30%, rgba(231,111,81,0.18), transparent)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg">
              <Utensils className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-white font-display">HungriAR</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight font-display mb-4">
            Restaurant<br />Management<br />Made Simple.
          </h1>
          <p className="text-white/50 text-base leading-relaxed max-w-xs">
            Manage your menu, track orders in real time, and give customers an immersive AR dining experience.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {f.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">{f.title}</p>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <Utensils className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 font-display">HungriAR</span>
          </div>

          <AnimatePresence mode="wait">

            {/* ── Step 1: Phone ─────────────────────────────────────────── */}
            {step === 'phone' && (
              <motion.div key="phone" {...slideProps}>
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 font-display">Owner Login</h2>
                  <p className="mt-1 text-sm text-gray-500">Enter your registered phone number</p>
                </div>
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="phone">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="phone" type="tel" required autoFocus className="input pl-9"
                        placeholder="9876543210" value={phone}
                        onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary w-full gap-2 py-3 text-sm">
                    {submitting
                      ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Sending…</>
                      : <><ArrowRight className="w-4 h-4" /> Send OTP via Telegram</>}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── Step 2: Link Telegram (one-time) ─────────────────────── */}
            {step === 'telegram' && (
              <motion.div key="telegram" {...slideProps}>
                <div className="mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
                    <MessageCircle className="w-7 h-7 text-blue-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 font-display">Link Telegram</h2>
                  <p className="mt-1 text-sm text-gray-500">One-time setup — done in 10 seconds</p>
                </div>
                <div className="space-y-2 mb-6">
                  {[
                    'Tap the button below to open the HungriAR bot',
                    'Press Start in Telegram',
                    'Come back here and tap "Send OTP"',
                  ].map((s, i) => (
                    <div key={i} className="flex gap-3 p-3 bg-white rounded-xl border border-gray-100">
                      <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-sm text-gray-700">{s}</p>
                    </div>
                  ))}
                </div>
                <a href={telegramLink} target="_blank" rel="noopener noreferrer"
                  className="btn-primary w-full gap-2 py-3 text-sm flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" /> Open Telegram Bot
                </a>
                <button onClick={handleSendOtp} disabled={submitting} className="btn w-full mt-3 gap-2 py-3 text-sm">
                  {submitting
                    ? <><span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" /> Checking…</>
                    : <><RotateCcw className="w-4 h-4" /> I've pressed Start — Send OTP</>}
                </button>
                <button onClick={() => setStep('phone')} className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
                  ← Back
                </button>
              </motion.div>
            )}

            {/* ── Step 3: OTP ──────────────────────────────────────────── */}
            {step === 'otp' && (
              <motion.div key="otp" {...slideProps}>
                <div className="mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
                    <MessageCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 font-display">Enter Code</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    6-digit code sent to your Telegram for <strong>{phone}</strong>
                  </p>
                </div>
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="otp">Verification code</label>
                    <input id="otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                      required autoFocus
                      className="input text-center text-2xl tracking-[0.5em] font-mono"
                      placeholder="000000" value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  </div>
                  <button type="submit" disabled={submitting || otp.length < 6}
                    className="btn-primary w-full gap-2 py-3 text-sm">
                    {submitting
                      ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Verifying…</>
                      : <><ArrowRight className="w-4 h-4" /> Verify</>}
                  </button>
                </form>
                <button onClick={() => { setStep('phone'); setOtp('') }}
                  className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
                  ← Use a different number
                </button>
              </motion.div>
            )}

            {/* ── Step 4: Restaurant picker ─────────────────────────────── */}
            {step === 'restaurants' && (
              <motion.div key="restaurants" {...slideProps}>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 font-display">Your Restaurants</h2>
                  <p className="mt-1 text-sm text-gray-500">Select a restaurant to manage</p>
                </div>
                <div className="space-y-3">
                  {restaurantList.map((r) => (
                    <button
                      key={r.restaurantId}
                      onClick={() => handleSelectRestaurant(r)}
                      className="w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <Store className="w-5 h-5 text-primary-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{r.restaurantName}</p>
                        <p className="text-xs text-gray-400 truncate">/{r.restaurantSlug}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
                <button onClick={() => { setStep('phone'); setOtp(''); setRestaurantList([]) }}
                  className="mt-5 w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
                  ← Sign in with a different number
                </button>
              </motion.div>
            )}

            {/* ── Step 5: Password for selected restaurant ──────────────── */}
            {step === 'password' && selectedRestaurant && (
              <motion.div key="password" {...slideProps}>
                <div className="mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
                    <Store className="w-7 h-7 text-primary-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 font-display">
                    {selectedRestaurant.restaurantName}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">Enter your dashboard password</p>
                </div>

                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div>
                    <label className="label" htmlFor="email">Email</label>
                    <input id="email" type="email" required className="input bg-gray-100 text-gray-500"
                      value={email} readOnly />
                  </div>
                  <div>
                    <label className="label" htmlFor="password">Password</label>
                    <div className="relative">
                      <input id="password" type={showPassword ? 'text' : 'password'}
                        required autoFocus className="input pr-11"
                        placeholder="••••••••" value={password}
                        onChange={(e) => setPassword(e.target.value)} />
                      <button type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary w-full gap-2 py-3 text-sm">
                    {submitting
                      ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Signing in…</>
                      : <><LogIn className="w-4 h-4" /> Enter Dashboard</>}
                  </button>
                </form>

                <button onClick={() => setStep('restaurants')}
                  className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
                  ← Back to restaurants
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
