import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

const INACTIVITY_MS  = 30 * 60 * 1000   // 30 min before locking
const MAX_ATTEMPTS   = 5
const LOCKOUT_MS     = 5 * 60 * 1000

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function pinKey(userId) {
  return `hungriar_pin_${userId}`
}

function getPinHash(userId) {
  return localStorage.getItem(pinKey(userId))
}

export async function savePinHash(userId, pin) {
  const hash = await sha256(pin)
  localStorage.setItem(pinKey(userId), hash)
}

export function clearPin(userId) {
  localStorage.removeItem(pinKey(userId))
}

/**
 * Overlay that locks the admin panel after INACTIVITY_MS of no interaction.
 * Only appears if the admin has set up a PIN in Settings → Security.
 * The Supabase session stays alive underneath — this is a UI lock only.
 */
export default function PinLockScreen({ children }) {
  const { user, signOut } = useAuth()

  const [locked,      setLocked]      = useState(false)
  const [pin,         setPin]         = useState('')
  const [error,       setError]       = useState('')
  const [attempts,    setAttempts]    = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [checking,    setChecking]    = useState(false)

  const timerRef = useRef(null)

  const resetTimer = useCallback(() => {
    if (!getPinHash(user?.id)) return   // no PIN set → no auto-lock
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLocked(true), INACTIVITY_MS)
  }, [user?.id])

  // Start/restart inactivity timer on any user interaction
  useEffect(() => {
    if (!user?.id) return
    resetTimer()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    return () => {
      clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [user?.id, resetTimer])

  const isLocked = lockedUntil && Date.now() < lockedUntil

  const handleDigit = (d) => {
    if (pin.length < 6 && !checking && !isLocked) {
      setPin((p) => p + d)
      setError('')
    }
  }

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  const handleUnlock = async () => {
    if (!pin || checking || isLocked) return

    if (attempts >= MAX_ATTEMPTS) {
      const until = Date.now() + LOCKOUT_MS
      setLockedUntil(until)
      setError('Too many attempts. Wait 5 minutes.')
      setPin('')
      return
    }

    setChecking(true)
    try {
      const hash    = await sha256(pin)
      const stored  = getPinHash(user?.id)
      if (hash === stored) {
        setLocked(false)
        setPin('')
        setAttempts(0)
        setError('')
        resetTimer()
      } else {
        const n = attempts + 1
        setAttempts(n)
        if (n >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS)
          setError('Too many attempts. Locked for 5 minutes.')
        } else {
          setError(`Wrong PIN. ${MAX_ATTEMPTS - n} attempt${MAX_ATTEMPTS - n === 1 ? '' : 's'} remaining.`)
        }
        setPin('')
      }
    } finally {
      setChecking(false)
    }
  }

  const handleForgot = async () => {
    if (!window.confirm('Signing out will require the full Telegram OTP login again. Continue?')) return
    clearPin(user?.id)
    await signOut()
  }

  return (
    <>
      {children}

      <AnimatePresence>
        {locked && (
          <motion.div
            key="pin-lock"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-gray-900/95 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              className="bg-gray-800 rounded-3xl p-8 w-full max-w-xs shadow-2xl"
            >
              <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center mb-3 shadow-lg">
                  <Lock className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Session Locked</h2>
                <p className="text-sm text-gray-400 mt-1 text-center">Enter your PIN to continue</p>
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
                    disabled={!d || checking || !!isLocked}
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
                onClick={handleUnlock}
                disabled={pin.length < 4 || checking || !!isLocked}
                className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-primary-500 to-primary-600 disabled:opacity-40 transition-opacity shadow-lg"
              >
                {checking ? 'Checking…' : isLocked ? 'Locked' : 'Unlock'}
              </button>

              <button
                type="button"
                onClick={handleForgot}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-red-400 transition-colors py-2"
              >
                <LogOut className="w-3.5 h-3.5" /> Forgot PIN — sign out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
