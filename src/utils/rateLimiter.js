import { supabase } from '../lib/supabase'

const LIMITS = {
  customer: 60, // requests per minute per browser/IP-derived identifier
  admin: 120, // requests per minute per authenticated user
}

const CUSTOMER_ID_KEY = 'hungriar_customer_id'

/**
 * Returns (and lazily creates) a random, persistent identifier for this
 * browser. Used to key the `rate_limits` table for anonymous customer
 * requests since the client cannot read its own public IP.
 */
export function getOrCreateCustomerId() {
  let id = localStorage.getItem(CUSTOMER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CUSTOMER_ID_KEY, id)
  }
  return id
}

/**
 * checkRateLimit(identifier, type) -> { allowed, retryAfter }
 *
 * Calls the check_rate_limit() Postgres function which atomically tracks
 * a sliding 1-minute window per (identifier, type) inside public.rate_limits.
 * 'customer' is capped at 60 req/min, 'admin' at 120 req/min.
 */
export async function checkRateLimit(identifier, type) {
  if (!identifier) return { allowed: true, retryAfter: 0 }

  const limit = LIMITS[type] ?? LIMITS.customer

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_type: type,
      p_limit: limit,
    })

    if (error) {
      console.error('Rate limit check failed', error)
      return { allowed: true, retryAfter: 0 }
    }

    return { allowed: Boolean(data?.allowed), retryAfter: Number(data?.retry_after ?? 0) }
  } catch (err) {
    console.error('Rate limit check failed', err)
    return { allowed: true, retryAfter: 0 }
  }
}
