import { getCorsHeaders } from './cors.ts'

export function jsonResponse(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', ...extraHeaders },
  })
}

/**
 * Best-effort client IP extraction. Supabase Edge Functions run behind a
 * proxy that sets x-forwarded-for to "client, proxy1, proxy2".
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf
  return 'unknown'
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number
}

/**
 * Calls the check_rate_limit() Postgres function (security definer) which
 * atomically increments the counter for (identifier, type) inside
 * public.rate_limits and tells us whether the request is allowed.
 */
export async function checkRateLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  identifier: string,
  type: 'customer' | 'admin',
  limit: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_type: type,
    p_limit: limit,
  })

  if (error) {
    console.error('check_rate_limit failed', error)
    // fail open so a DB hiccup never blocks legitimate traffic
    return { allowed: true, retryAfter: 0 }
  }

  return { allowed: Boolean(data?.allowed), retryAfter: Number(data?.retry_after ?? 0) }
}
