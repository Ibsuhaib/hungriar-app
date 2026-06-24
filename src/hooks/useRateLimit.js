import { useRateLimitContext } from '../contexts/RateLimitContext'

/**
 * Thin accessor for RateLimitContext - exposes:
 *  - checkCustomerLimit(): Promise<boolean> (60 req/min per browser)
 *  - checkAdminLimit(userId): Promise<boolean> (120 req/min per user)
 */
export function useRateLimit() {
  return useRateLimitContext()
}
