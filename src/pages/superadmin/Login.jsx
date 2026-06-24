import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'

export default function Login() {
  const { signIn, signOut, user, role } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (user && role === 'super_admin') {
    return <Navigate to="/superadmin" replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const { role: signedInRole } = await signIn(email, password)
      if (signedInRole !== 'super_admin') {
        await signOut()
        toast.error('This account does not have super admin access.')
        return
      }
      navigate('/superadmin', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Sign in failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4"
      style={{ background: 'linear-gradient(145deg, #0f0f0f 0%, #1a1a2e 100%)' }}
    >
      {/* Subtle glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(42,157,143,0.10), transparent)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full max-w-sm"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary-400 to-secondary-600 shadow-lg shadow-secondary-900/40">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
        </div>

        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(16px)' }}
        >
          <div className="px-8 py-8">
            <h1 className="text-xl font-bold text-white text-center font-display">Super Admin</h1>
            <p className="mt-1 text-sm text-white/40 text-center">Restricted area — authorised staff only.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/60" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="block w-full rounded-xl border border-white/10 bg-white/8 px-3.5 py-2.5 text-sm text-white placeholder:text-white/25
                    focus:border-secondary-400 focus:ring-2 focus:ring-secondary-400/20 focus:outline-none transition-shadow"
                  style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                  placeholder="admin@hungriar.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/60" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    maxLength={MAX_PASSWORD_LENGTH}
                    className="block w-full rounded-xl border border-white/10 px-3.5 py-2.5 pr-11 text-sm text-white placeholder:text-white/25
                      focus:border-secondary-400 focus:ring-2 focus:ring-secondary-400/20 focus:outline-none transition-shadow"
                    style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-secondary-500 to-secondary-600
                  py-2.5 text-sm font-semibold text-white shadow-lg shadow-secondary-900/30
                  hover:from-secondary-400 hover:to-secondary-500 transition-all duration-150
                  disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {submitting ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
