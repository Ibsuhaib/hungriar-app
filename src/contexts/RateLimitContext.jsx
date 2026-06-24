import { createContext, useContext, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { checkRateLimit, getOrCreateCustomerId } from '../utils/rateLimiter'

const RateLimitContext = createContext(null)

/**
 * Wraps the check_rate_limit() RPC for both customer-facing flows (60
 * req/min keyed by a per-browser random id) and admin mutations (120
 * req/min keyed by the authenticated user's id).
 */
export function RateLimitProvider({ children }) {
  const customerId = useMemo(() => getOrCreateCustomerId(), [])

  const checkCustomerLimit = useCallback(async () => {
    const result = await checkRateLimit(customerId, 'customer')
    if (!result.allowed) {
      toast.error(`You're going a bit fast! Please wait ${result.retryAfter}s and try again.`)
    }
    return result.allowed
  }, [customerId])

  const checkAdminLimit = useCallback(async (userId) => {
    if (!userId) return true
    const result = await checkRateLimit(userId, 'admin')
    if (!result.allowed) {
      toast.error(`Too many requests. Please wait ${result.retryAfter}s and try again.`)
    }
    return result.allowed
  }, [])

  const value = useMemo(
    () => ({ customerId, checkCustomerLimit, checkAdminLimit }),
    [customerId, checkCustomerLimit, checkAdminLimit],
  )

  return <RateLimitContext.Provider value={value}>{children}</RateLimitContext.Provider>
}

export function useRateLimitContext() {
  const ctx = useContext(RateLimitContext)
  if (!ctx) throw new Error('useRateLimitContext must be used within RateLimitProvider')
  return ctx
}
