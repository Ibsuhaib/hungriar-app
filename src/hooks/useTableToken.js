import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { invokeEdgeFunction } from '../lib/supabase'

const SESSION_PREFIX = 'hungriar_table_session_'

/**
 * Resolves a verified { restaurantId, tableId, ... } session for a given
 * restaurant slug.
 *
 * - If the URL contains ?token=..., it is sent to the validate-table-token
 *   edge function (which checks the HMAC signature + 30 day expiry). On
 *   success the session is cached in localStorage and the token is
 *   stripped from the URL.
 * - Otherwise, a previously cached (and still valid) session for this
 *   slug is reused.
 * - If neither is available, `error` is set so the UI can prompt the
 *   customer to rescan the table's QR code.
 */
export function useTableToken(restaurantSlug) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const validateToken = useCallback(async (token) => {
    return invokeEdgeFunction('validate-table-token', { token })
  }, [])

  useEffect(() => {
    if (!restaurantSlug) return
    let cancelled = false

    async function run() {
      setLoading(true)
      setError(null)

      const token = searchParams.get('token')
      const storageKey = `${SESSION_PREFIX}${restaurantSlug}`

      if (token) {
        try {
          const result = await validateToken(token)
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
            expiresAt: result.expiresAt,
          }

          localStorage.setItem(storageKey, JSON.stringify(sessionData))
          setSession(sessionData)
          setLoading(false)

          // strip ?token= from the URL so it isn't accidentally re-shared
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
          if (parsed.restaurantSlug === restaurantSlug && new Date(parsed.expiresAt).getTime() > Date.now()) {
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

    return () => {
      cancelled = true
    }
    // Intentionally only re-run when the slug changes - the token (if any)
    // is consumed once on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug])

  return { session, loading, error }
}
