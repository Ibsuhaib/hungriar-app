import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, Utensils } from 'lucide-react'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'

const FEATURES = [
  { icon: '🍽', title: 'Live Menu Management', desc: 'Update items, prices, and availability in real time.' },
  { icon: '📱', title: 'AR Food Previews', desc: 'Let customers view dishes in 3D before ordering.' },
  { icon: '📊', title: 'Order Analytics', desc: 'Track revenue and top sellers at a glance.' },
]

export default function Login() {
  const { signIn, signOut, user, role } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (user && role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const { role: signedInRole } = await signIn(email, password)

      if (signedInRole !== 'admin') {
        await signOut()
        toast.error('This account does not have restaurant admin access.')
        return
      }

      navigate('/admin', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Sign in failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel — hidden on mobile */}
      <div
        className="hidden lg:flex lg:w-[45%] xl:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(155deg, #1c1c1c 0%, #2d1a10 60%, #1c1c1c 100%)' }}
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 30% 30%, rgba(231,111,81,0.18), transparent)' }}
        />

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
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
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

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 font-display">Sign in</h2>
            <p className="mt-1 text-sm text-gray-500">Restaurant Admin Portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                placeholder="you@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                  className="input pr-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full mt-2 gap-2 py-3 text-sm"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Forgot your password or need an account?{' '}
            <span className="font-medium text-gray-500">Contact HungriAR support.</span>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
