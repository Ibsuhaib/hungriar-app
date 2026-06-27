import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { invokeEdgeFunction } from '../lib/supabase'

const SESSION_PREFIX = 'hungriar_table_session_'

/**
 * Resolves a verified { restaurantId, tableId, sessionId, ... } session for a
 * given restaurant slug.
 *
 * - If the URL has ?token=..., it is sent to validate-table-token (HMAC check).
 *   On success the session (including sessionId) is cached in localStorage and
 *   the token is stripped from the URL.
 * - Otherwise a previously cached session for this slug is used, but the
 *   sessionId is re-checked against the server every time the tab regains
 *   focus — so when the bill is settled and the table's session_id rotates,
 *   the next focus event clears the stale cache and shows "rescan" instantly.
 * - If neither is available, `error` is set so the UI can prompt the customer
 *   to rescan the QR code.
 */
export function useTableToken(restaurantSlug) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const sessionRef = useRef(null)

  // Keep ref in sync so the focus listener always sees the latest session
  useEffect(() => { sessionRef.current = session }, [session])

  const storageKey = SESSION_PREFIX + restaurantSlug

  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKey)
    setSession(null)
    setError('Your table session has ended. Please rescan the QR code on your table.')
  }, [storageKey])

  // Re-validates the current session_id against the server.
  // Called on tab focus. If the session_id has rotated (bill settled), clears cache.
  const revalidate = useCallback(async () => {
    const current = sessionRef.current
    if (!current?.token || !current?.sessionId) return
    try {
      const result = await invokeEdgeFunction('validate-table-token', { token: current.token })
      if (!result.valid) { clearSession(); return }
      if (result.sessionId !== current.sessionId) {
        // Bill was settled — session rotated
        clearSession()
      }
    } catch {
      // Network error — don't clear the session, just silently fail
    }
  }, [clearSession])

  // Re-validate every time the tab becomes visible
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') revalidate() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [revalidate])

  useEffect(() => {
    if (!restaurantSlug) return
    let cancelled = false

    async function run() {
      setLoading(true)
      setError(null)

      const token = searchParams.get('token')

      if (token) {
        try {
          const result = await invokeEdgeFunction('validate-table-token', { token })
          if (cancelled) return

          if (!result.valid) {
            setError(result.error || 'Invalid QR code. Please ask staff for a new one.')
            setSession(null)
            setLoading(false)
            return
          }

          const sessionData = {
            token,
            restaurantId: result.restaurantId,
            restaurantSlug: result.restaurantSlug,
            restaurantName: result.restaurantName,
            tableId: result.tableId,
            tableNumber: result.tableNumber,
            sessionId: result.sessionId,
          }

          localStorage.setItem(storageKey, JSON.stringify(sessionData))
          setSession(sessionData)
          setLoading(false)

          // Strip ?token= from URL so it isn't accidentally re-shared
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete('token')
          navigate({ pathname: location.pathname, search: nextParams.toString() }, { replace: true })
          return
        } catch (err) {
          if (!cancelled) {
            setError(err.message || 'Failed to validate QR code. Please try again.')
            setSession(null)
            setLoading(false)
          }
          return
        }
      }

      const cached = localStorage.getItem(storageKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (parsed.restaurantSlug === restaurantSlug) {
            if (!cancelled) {
              setSession(parsed)
              setLoading(false)
            }
            return
          }
        } catch {
          // ignore malformed cache entries
        }
      }

      if (!cancelled) {
        setError('Please scan the QR code on your table to view the menu.')
        setSession(null)
        setLoading(false)
      }
    }

    run()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug])

  return { session, loading, error, clearSession }
}
