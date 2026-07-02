import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse, getClientIp, checkRateLimit } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  let phone_number: string, code: string
  try {
    const body = await req.json()
    phone_number = (body?.phone_number ?? '').trim()
    code = (body?.code ?? '').trim()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!phone_number || !code) {
    return jsonResponse(req, { error: 'phone_number and code are required' }, 400)
  }
  if (phone_number.length > 20) return jsonResponse(req, { error: 'Invalid phone number' }, 400)
  if (!/^\d{6}$/.test(code)) return jsonResponse(req, { error: 'Code must be 6 digits' }, 400)

  // Brute-force protection: cap verification attempts. Without this a 6-digit
  // code (1e6 combos) could be exhausted within the 5-minute validity window.
  // Rate limit per phone AND per client IP (1-minute sliding window).
  const ip = getClientIp(req)
  const phoneLimit = await checkRateLimit(adminClient, `otp-verify:${phone_number}`, 'customer', 8)
  if (!phoneLimit.allowed) {
    return jsonResponse(req, { error: 'Too many attempts. Please request a new code.' }, 429, {
      'Retry-After': String(phoneLimit.retryAfter),
    })
  }
  const ipLimit = await checkRateLimit(adminClient, `otp-verify-ip:${ip}`, 'customer', 30)
  if (!ipLimit.allowed) {
    return jsonResponse(req, { error: 'Too many attempts. Please slow down.' }, 429, {
      'Retry-After': String(ipLimit.retryAfter),
    })
  }

  // Atomic update: single SQL UPDATE ... WHERE ... RETURNING eliminates the
  // TOCTOU replay window without needing ORDER/LIMIT (unsupported on UPDATE).
  const { data: updated, error: updateError } = await adminClient
    .from('otp_codes')
    .update({ used: true })
    .eq('phone_number', phone_number)
    .eq('code', code)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .select('id')

  if (updateError || !updated?.length) {
    return jsonResponse(req, { error: 'Invalid or expired code.' }, 401)
  }

  // Get all restaurants linked to this phone
  const { data: links } = await adminClient
    .from('phone_restaurant_links')
    .select('restaurant_id, restaurants(id, name, slug)')
    .eq('phone_number', phone_number)

  if (!links?.length) {
    return jsonResponse(req, { error: 'No restaurants found for this phone.' }, 404)
  }

  // Get the admin email for each restaurant
  const restaurants = []
  for (const link of links) {
    const restaurant = Array.isArray(link.restaurants) ? link.restaurants[0] : link.restaurants
    if (!restaurant) continue

    const { data: adminRow } = await adminClient
      .from('restaurant_admins')
      .select('user_id')
      .eq('restaurant_id', link.restaurant_id)
      .maybeSingle()

    let adminEmail = ''
    if (adminRow?.user_id && UUID_RE.test(adminRow.user_id)) {
      const { data: { user } } = await adminClient.auth.admin.getUserById(adminRow.user_id)
      adminEmail = user?.email ?? ''
    }

    restaurants.push({
      restaurantId: link.restaurant_id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      adminEmail,
    })
  }

  return jsonResponse(req, { restaurants })
})
