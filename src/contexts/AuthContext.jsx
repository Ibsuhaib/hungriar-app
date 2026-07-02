import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export const MAX_PASSWORD_LENGTH = 128

// Cache the resolved profile (role + restaurant) so a reload with no internet
// can restore it instead of failing every guard and bouncing to login.
const PROFILE_CACHE_KEY = 'hungriar_profile_cache'

function cacheProfile(userId, role, restaurantAdmin) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, role, restaurantAdmin }))
  } catch { /* storage full / unavailable — ignore */ }
}

function readCachedProfile(userId) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.userId === userId ? parsed : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null) // 'admin' | 'super_admin' | null
  const [restaurantAdmin, setRestaurantAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setRole(null)
      setRestaurantAdmin(null)
      return
    }

    // If any lookup fails (almost always: offline), fall back to the last known
    // profile so the Chef / Staff / Admin panels stay usable with no internet.
    const restoreFromCache = () => {
      const cached = readCachedProfile(currentUser.id)
      if (cached) {
        setRole(cached.role)
        setRestaurantAdmin(cached.restaurantAdmin)
        return true
      }
      return false
    }

    try {
      const { data: roleRow, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', currentUser.id)
        .maybeSingle()
      if (roleError) throw roleError

      const userRole = roleRow?.role ?? null
      let admin = null

      if (userRole === 'admin') {
        const { data: adminRow, error: adminError } = await supabase
          .from('restaurant_admins')
          .select('*, restaurants(*)')
          .eq('user_id', currentUser.id)
          .maybeSingle()
        if (adminError) throw adminError
        admin = adminRow ?? null
      } else if (userRole === 'chef' || userRole === 'staff') {
        // Station accounts: look up restaurant via restaurant_stations
        const { data: stationRow, error: stationError } = await supabase
          .from('restaurant_stations')
          .select('id, restaurant_id, role, label, restaurants(*)')
          .eq('auth_user_id', currentUser.id)
          .maybeSingle()
        if (stationError) throw stationError
        if (stationRow) {
          // Shape a compatible restaurantAdmin-like object so existing code that
          // reads restaurantAdmin.restaurant_id / restaurantAdmin.restaurants works.
          admin = {
            id: stationRow.id,
            user_id: currentUser.id,
            restaurant_id: stationRow.restaurant_id,
            restaurants: stationRow.restaurants,
            // Sentinel values so ProtectedRoute skips agreement / subscription checks
            agreement_accepted_at: '__station__',
            agreement_version: '__station__',
            isStation: true,
            stationRole: stationRow.role,
            stationLabel: stationRow.label,
          }
        }
      }

      setRole(userRole)
      setRestaurantAdmin(admin)
      cacheProfile(currentUser.id, userRole, admin)
    } catch {
      // Offline (or transient failure): keep the panels working with the last
      // known profile. Never throw — the caller relies on this settling loading.
      restoreFromCache()
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

  const signIn = useCallback(
    async (email, password) => {
      if (!email || !password) throw new Error('Email and password are required')
      if (password.length > MAX_PASSWORD_LENGTH) throw new Error('Password is too long')

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

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
    try { localStorage.removeItem(PROFILE_CACHE_KEY) } catch { /* ignore */ }
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
