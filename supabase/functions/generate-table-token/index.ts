import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, checkRateLimit } from '../_shared/utils.ts'
import { signTableToken } from '../_shared/tableToken.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TABLE_TOKEN_SECRET = Deno.env.get('TABLE_TOKEN_SECRET')!

/**
 * POST { restaurantId, tableId }
 * Auth: restaurant admin (for that restaurant) or super admin.
 * Returns { token, restaurantSlug, tableNumber }
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    if (!TABLE_TOKEN_SECRET) {
      console.error('TABLE_TOKEN_SECRET is not configured')
      return jsonResponse({ error: 'Server misconfiguration' }, 500)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt)
    if (userError || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401)
    const userId = userData.user.id

    const rateLimit = await checkRateLimit(supabaseAdmin, userId, 'admin', 120)
    if (!rateLimit.allowed) {
      return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.restaurantId !== 'string' || typeof body.tableId !== 'string') {
      return jsonResponse({ error: 'restaurantId and tableId are required' }, 400)
    }
    const { restaurantId, tableId } = body
    if (restaurantId.length > 64 || tableId.length > 64) {
      return jsonResponse({ error: 'Invalid identifiers' }, 400)
    }

    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    const isSuperAdmin = roleRow?.role === 'super_admin'

    if (!isSuperAdmin) {
      const { data: adminRow } = await supabaseAdmin
        .from('restaurant_admins')
        .select('id')
        .eq('user_id', userId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle()

      if (!adminRow) return jsonResponse({ error: 'Not authorized for this restaurant' }, 403)
    }

    const { data: tableRow, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id, table_number, restaurant_id')
      .eq('id', tableId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (tableError || !tableRow) return jsonResponse({ error: 'Table not found' }, 404)

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('slug')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) return jsonResponse({ error: 'Restaurant not found' }, 404)

    const token = await signTableToken(restaurantId, tableId, TABLE_TOKEN_SECRET)

    return jsonResponse({
      token,
      restaurantSlug: restaurant.slug,
      tableNumber: tableRow.table_number,
    })
  } catch (err) {
    console.error('generate-table-token error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
