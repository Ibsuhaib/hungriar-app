import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let phone_number: string, code: string
  try {
    const body = await req.json()
    phone_number = (body?.phone_number ?? '').trim()
    code = (body?.code ?? '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  if (!phone_number || !code) {
    return jsonResponse({ error: 'phone_number and code are required' }, 400)
  }
  if (phone_number.length > 20) return jsonResponse({ error: 'Invalid phone number' }, 400)
  if (!/^\d{6}$/.test(code)) return jsonResponse({ error: 'Code must be 6 digits' }, 400)

  // Atomic update: marks the OTP used in a single SQL statement.
  // If two concurrent requests arrive with the same code, only one UPDATE
  // will match (used=false), eliminating the TOCTOU replay window.
  const { data: updated, error: updateError } = await adminClient
    .from('otp_codes')
    .update({ used: true })
    .eq('phone_number', phone_number)
    .eq('code', code)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .select('id')

  if (updateError || !updated?.length) {
    return jsonResponse({ error: 'Invalid or expired code.' }, 401)
  }

  // Get all restaurants linked to this phone
  const { data: links } = await adminClient
    .from('phone_restaurant_links')
    .select('restaurant_id, restaurants(id, name, slug)')
    .eq('phone_number', phone_number)

  if (!links?.length) {
    return jsonResponse({ error: 'No restaurants found for this phone.' }, 404)
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

  return jsonResponse({ restaurants })
})
