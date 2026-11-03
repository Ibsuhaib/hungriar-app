import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse, getClientIp, checkRateLimit } from '../_shared/utils.ts'
import { verifyTableToken } from '../_shared/tableToken.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TABLE_TOKEN_SECRET = Deno.env.get('TABLE_TOKEN_SECRET')!

/**
 * POST { token }
 * Public endpoint (no auth) - rate limited per IP.
 * Returns { valid, restaurantId, restaurantSlug, restaurantName, tableId, tableNumber, expiresAt }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  try {
    if (!TABLE_TOKEN_SECRET) {
      console.error('TABLE_TOKEN_SECRET is not configured')
      return jsonResponse(req, { error: 'Server misconfiguration' }, 500)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const ip = getClientIp(req)

    const rateLimit = await checkRateLimit(supabaseAdmin, ip, 'customer', 60)
    if (!rateLimit.allowed) {
      return jsonResponse(req, { error: 'Too many requests, please slow down' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.token !== 'string' || body.token.length === 0 || body.token.length > 1000) {
      return jsonResponse(req, { valid: false, error: 'Token is required' }, 400)
    }

    const result = await verifyTableToken(body.token, TABLE_TOKEN_SECRET)
    if (!result.valid) {
      return jsonResponse(req, { valid: false, error: 'Invalid QR code. Please ask staff for a new one.' })
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id, slug, name, subscription_status')
      .eq('id', result.restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant || restaurant.subscription_status === 'inactive') {
      return jsonResponse(req, { valid: false, error: 'This restaurant is currently unavailable.' })
    }

    const { data: table, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id, table_number, session_id, qr_valid_after')
      .eq('id', result.tableId)
      .eq('restaurant_id', result.restaurantId)
      .maybeSingle()

    if (tableError || !table) {
      return jsonResponse(req, { valid: false, error: 'Table not found.' })
    }

    // Rejected here as well as in place-order, so a revoked code fails the
    // moment it is scanned instead of after the customer fills a cart.
    if (table.qr_valid_after && result.issuedAt! * 1000 < Date.parse(table.qr_valid_after) - 5000) {
      return jsonResponse(req, { valid: false, error: 'This QR code is no longer valid. Please ask staff for help.' })
    }

    return jsonResponse(req, {
      valid: true,
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      tableId: table.id,
      tableNumber: table.table_number,
      sessionId: table.session_id,
    })
  } catch (err) {
    console.error('validate-table-token error', err)
    return jsonResponse(req, { valid: false, error: 'Internal server error' }, 500)
  }
})
