/**
 * CORS handling for the public + admin edge functions.
 *
 * The browser sends the JWT / apikey in headers (never cookies), so these
 * endpoints are not vulnerable to classic credentialed CSRF. Even so, we
 * restrict the allowed origin to an explicit production allowlist instead of
 * a blanket "*" so only the real front-end domain(s) can call the API from a
 * browser.
 *
 * Configure via the `ALLOWED_ORIGINS` edge-function secret, e.g.
 *   supabase secrets set ALLOWED_ORIGINS="https://hungriar.app,https://www.hungriar.app"
 *
 * When ALLOWED_ORIGINS is unset (local development) we fall back to "*" so the
 * dev server on any localhost port keeps working.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function resolveAllowOrigin(requestOrigin: string | null): string {
  if (ALLOWED_ORIGINS.length === 0) return '*' // not configured → permissive (dev)
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin
  return ALLOWED_ORIGINS[0] // default to the primary production origin
}

/** Per-request CORS headers that echo an allow-listed Origin. */
export function getCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowOrigin(req.headers.get('Origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
