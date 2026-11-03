import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse, checkRateLimit } from '../_shared/utils.ts'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse(req, { error: 'Missing authorization' }, 401)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return jsonResponse(req, { error: 'Invalid session' }, 401)

  const rateLimit = await checkRateLimit(adminClient, userData.user.id, 'admin', 120)
  if (!rateLimit.allowed) {
    return jsonResponse(req, { error: 'Too many requests' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
  }

  let body: { restaurantId?: string; role?: string; label?: string; pin?: string }
  try { body = await req.json() }
  catch { return jsonResponse(req, { error: 'Invalid JSON' }, 400) }

  const { restaurantId, role, label = '', pin } = body

  if (!restaurantId || !role || !pin) {
    return jsonResponse(req, { error: 'restaurantId, role, and pin are required' }, 400)
  }
  if (!['chef', 'staff', 'delivery'].includes(role)) {
    return jsonResponse(req, { error: 'role must be chef, staff or delivery' }, 400)
  }
  if (!/^\d{6}$/.test(pin)) {
    return jsonResponse(req, { error: 'PIN must be 6 digits' }, 400)
  }

  // Verify the caller is an admin of this restaurant
  const { data: adminRow } = await adminClient
    .from('restaurant_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (!adminRow) return jsonResponse(req, { error: 'Forbidden' }, 403)

  // Generate station UUID first — used in both the email and the table row
  const stationId   = crypto.randomUUID()
  const stationEmail = `station-${stationId}@internal.hungriar.app`

  // Create the Supabase auth user (email+PIN, no OTP)
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: stationEmail,
    password: pin,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    console.error('create-station auth error:', authError)
    return jsonResponse(req, { error: 'Failed to create station account' }, 500)
  }

  const authUserId = authData.user.id

  try {
    const { error: roleError } = await adminClient
      .from('user_roles')
      .insert({ user_id: authUserId, role })

    if (roleError) throw roleError

    const { error: stationError } = await adminClient
      .from('restaurant_stations')
      .insert({ id: stationId, restaurant_id: restaurantId, auth_user_id: authUserId, role, label: label.trim() })

    if (stationError) throw stationError
  } catch (err) {
    // Roll back: remove the orphaned auth user
    await adminClient.auth.admin.deleteUser(authUserId)
    console.error('create-station db error:', err)
    return jsonResponse(req, { error: 'Failed to set up station' }, 500)
  }

  return jsonResponse(req, { stationId, role, label: label.trim() })
})
