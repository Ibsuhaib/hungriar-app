import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import isEmail from 'validator/lib/isEmail'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { getFingerprintHash } from '../utils/fingerprint'

const AuthContext = createContext(null)

export const MAX_PASSWORD_LENGTH = 128
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null) // 'admin' | 'super_admin' | null
  const [restaurantAdmin, setRestaurantAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  const fingerprintRef = useRef(null)

  const loadProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setRole(null)
      setRestaurantAdmin(null)
      return
    }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    const userRole = roleRow?.role ?? null
    setRole(userRole)

    if (userRole === 'admin') {
      const { data: adminRow } = await supabase
        .from('restaurant_admins')
        .select('*, restaurants(*)')
        .eq('user_id', currentUser.id)
        .maybeSingle()
      setRestaurantAdmin(adminRow ?? null)
    } else {
      setRestaurantAdmin(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      await loadProfile(data.session?.user ?? null)
      if (mounted) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      await loadProfile(newSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  // Device-fingerprint replay protection: periodically confirm this
  // browser's session is still the one recorded in admin_sessions. If a
  // newer login from elsewhere replaced it, sign out locally.
  useEffect(() => {
    if (!user || !role) return

    fingerprintRef.current = getFingerprintHash()

    const interval = setInterval(async () => {
      const { data, error } = await supabase.rpc('validate_admin_session', {
        p_fingerprint_hash: fingerprintRef.current,
      })

      if (!error && data === false) {
        toast.error('Your session has expired. Please sign in again.')
        await supabase.auth.signOut()
      }
    }, SESSION_CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [user, role])

  const signIn = useCallback(
    async (email, password) => {
      if (!isEmail(email)) {
        throw new Error('Please enter a valid email address')
      }
      if (password.length === 0) {
        throw new Error('Password is required')
      }
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw new Error('Password is too long')
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const fingerprintHash = getFingerprintHash()
      fingerprintRef.current = fingerprintHash
      await supabase.rpc('upsert_admin_session', { p_fingerprint_hash: fingerprintHash })

      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (roleRow?.role === 'admin') {
        await supabase
          .from('restaurant_admins')
          .update({ last_login_at: new Date().toISOString() })
          .eq('user_id', data.user.id)
      }

      await loadProfile(data.user)

      return { user: data.user, role: roleRow?.role ?? null }
    },
    [loadProfile],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setRole(null)
    setRestaurantAdmin(null)
  }, [])

  const acceptAgreement = useCallback(
    async (version) => {
      if (!restaurantAdmin) throw new Error('No restaurant profile found')

      const acceptedAt = new Date().toISOString()
      const { error } = await supabase
        .from('restaurant_admins')
        .update({ agreement_accepted_at: acceptedAt, agreement_version: version })
        .eq('id', restaurantAdmin.id)

      if (error) throw error

      setRestaurantAdmin((prev) =>
        prev ? { ...prev, agreement_accepted_at: acceptedAt, agreement_version: version } : prev,
      )
    },
    [restaurantAdmin],
  )

  const refreshProfile = useCallback(async () => {
    await loadProfile(user)
  }, [user, loadProfile])

  const value = {
    session,
    user,
    role,
    restaurantAdmin,
    restaurant: restaurantAdmin?.restaurants ?? null,
    loading,
    signIn,
    signOut,
    acceptAgreement,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
