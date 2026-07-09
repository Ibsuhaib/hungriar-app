import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Users, Bike, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const MAX_ATTEMPTS   = 5
const LOCKOUT_MS     = 5 * 60 * 1000
const ROLE_META = {
  chef:     { icon: ChefHat, label: 'Chef Station', color: 'from-orange-400 to-orange-600' },
  staff:    { icon: Users,   label: 'Staff Station', color: 'from-primary-400 to-primary-600' },
  delivery: { icon: Bike,    label: 'Delivery Station', color: 'from-purple-400 to-purple-600' },
}

export default function StationLogin() {
  const { stationId } = useParams()
  const navigate      = useNavigate()
  const { user, role, loading } = useAuth()

  const [pin,         setPin]         = useState('')
  const [error,       setError]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [attempts,    setAttempts]    = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [stationRole, setStationRole] = useState(null)   // fetched from DB
  const [fetching,    setFetching]    = useState(true)

  // Redirect already-authenticated station users to the right panel
  useEffect(() => {
    if (!loading && user) {
      if (role === 'chef')     navigate('/admin/chef', { replace: true })
      if (role === 'staff')    navigate('/staff',      { replace: true })
      if (role === 'delivery') navigate('/delivery',   { replace: true })
      if (role === 'admin')    navigate('/admin',      { replace: true })
    }
  }, [loading, user, role, navigate])

  // Fetch the station's role via a public SECURITY DEFINER function
  // (anon users can't read restaurant_stations directly via RLS)
  useEffect(() => {
    if (!stationId) return
    supabase
      .rpc('get_station_role', { p_station_id: stationId })
      .then(({ data }) => {
        // data is { role, label } or null if station doesn't exist
        setStationRole(data?.role ?? 'staff')  // default icon if lookup fails
        setFetching(false)
      })
  }, [stationId])

  const isLocked = lockedUntil && Date.now() < lockedUntil

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pin || submitting || isLocked) return

    if (attempts >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS
      setLockedUntil(until)
      setError('Too many incorrect attempts. Try again in 5 minutes.')
      setPin('')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const email = `station-${stationId}@internal.hungriar.app`
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pin })

      if (signInError) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        if (newAttempts >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS)
          setError('Too many incorrect attempts. Locked for 5 minutes.')
        } else {
          setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`)
        }
        setPin('')
        return
      }

      // AuthContext will load the profile and redirect via the useEffect above
      setAttempts(0)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDigit = (d) => {
    if (pin.length < 6 && !submitting && !isLocked) {
      const next = pin + d
      setPin(next)
      setError('')
    }
  }

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  const meta = ROLE_META[stationRole ?? 'staff'] ?? ROLE_META.staff
  const Icon = meta.icon

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-3xl p-8 w-full max-w-xs shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta.color} flex items-center justify-center mb-4 shadow-lg`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">{meta.label}</h1>
          <p className="text-sm text-gray-400 mt-1 text-center">Enter your PIN to access this station</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-150 ${
                i < pin.length ? 'bg-primary-400 scale-110' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-red-400 text-center mb-4"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Dial pad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => d === '⌫' ? handleBackspace() : d ? handleDigit(d) : null}
              disabled={!d || submitting || !!isLocked}
              className={`h-14 rounded-2xl text-xl font-semibold transition-all ${
                d === '⌫'
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : d
                  ? 'bg-gray-700 text-white hover:bg-gray-600 active:scale-95'
                  : 'invisible'
              } disabled:opacity-40`}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={pin.length < 4 || submitting || !!isLocked}
          className={`w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r ${meta.color} disabled:opacity-40 transition-opacity shadow-lg flex items-center justify-center gap-2`}
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
            : isLocked
            ? 'Locked'
            : 'Enter'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-4">
          PIN is set by the restaurant manager
        </p>
      </motion.div>
    </div>
  )
}
