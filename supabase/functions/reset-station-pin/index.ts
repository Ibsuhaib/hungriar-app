import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401)

  let body: { stationId?: string; pin?: string }
  try { body = await req.json() }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }

  const { stationId, pin } = body
  if (!stationId || !pin) return jsonResponse({ error: 'stationId and pin are required' }, 400)
  if (!/^\d{4,6}$/.test(pin)) return jsonResponse({ error: 'PIN must be 4–6 digits' }, 400)

  const { data: stationRow } = await adminClient
    .from('restaurant_stations')
    .select('auth_user_id, restaurant_id')
    .eq('id', stationId)
    .maybeSingle()

  if (!stationRow) return jsonResponse({ error: 'Station not found' }, 404)

  const { data: adminRow } = await adminClient
    .from('restaurant_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('restaurant_id', stationRow.restaurant_id)
    .maybeSingle()

  if (!adminRow) return jsonResponse({ error: 'Forbidden' }, 403)

  // Updating password automatically invalidates all existing sessions for that user
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    stationRow.auth_user_id,
    { password: pin }
  )

  if (updateError) {
    console.error('reset-station-pin error:', updateError)
    return jsonResponse({ error: 'Failed to reset PIN' }, 500)
  }

  return jsonResponse({ success: true })
})
