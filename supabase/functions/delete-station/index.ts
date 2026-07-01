import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401)

  // Accept stationId from query string (DELETE) or body (POST)
  let stationId: string | null = new URL(req.url).searchParams.get('stationId')
  if (!stationId && req.method === 'POST') {
    try { const body = await req.json(); stationId = body.stationId } catch { /* ignore */ }
  }
  if (!stationId) return jsonResponse({ error: 'stationId is required' }, 400)

  const { data: stationRow } = await adminClient
    .from('restaurant_stations')
    .select('auth_user_id, restaurant_id')
    .eq('id', stationId)
    .maybeSingle()

  if (!stationRow) return jsonResponse({ error: 'Station not found' }, 404)

  // Caller must be admin of the same restaurant
  const { data: adminRow } = await adminClient
    .from('restaurant_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('restaurant_id', stationRow.restaurant_id)
    .maybeSingle()

  if (!adminRow) return jsonResponse({ error: 'Forbidden' }, 403)

  // Deleting the auth user cascades to user_roles and restaurant_stations via FK
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(stationRow.auth_user_id)
  if (deleteError) {
    console.error('delete-station error:', deleteError)
    return jsonResponse({ error: 'Failed to delete station' }, 500)
  }

  return jsonResponse({ success: true })
})
