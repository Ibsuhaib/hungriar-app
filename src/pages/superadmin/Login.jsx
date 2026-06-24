import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth, MAX_PASSWORD_LENGTH } from '../../contexts/AuthContext'

export default function Login() {
  const { signIn, signOut, user, role } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user && role === 'super_admin') {
    return <Navigate to="/superadmin" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
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
    <div className="flex min-h-screen items-center justify-center bg-sand-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-center text-2xl font-bold text-primary-600">Goana AR</h1>
        <p className="mt-1 text-center text-sm text-gray-500">Super Admin Sign In</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={MAX_PASSWORD_LENGTH}
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">Restricted area - authorised Goana AR staff only.</p>
      </div>
    </div>
  )
}
