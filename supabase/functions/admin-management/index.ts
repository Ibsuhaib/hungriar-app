import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, checkRateLimit } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}
function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && EMAIL_RE.test(v) && v.length <= 254
}

/**
 * POST { action: string, ... }  — super_admin only.
 *
 * Actions:
 *  list_admins                  — all restaurant_admins with email, phone, Telegram status
 *  reset_password               — { userId, newPassword }
 *  create_restaurant_admin      — { email, password, restaurantId, phoneNumber? }
 *  delete_restaurant_admin_user — { userId }
 *  set_owner_phone              — { userId, phoneNumber }  upsert phone number
 *  remove_owner_phone           — { userId }              unlink phone number
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt)
    if (userError || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401)
    const callerId = userData.user.id

    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .maybeSingle()

    if (roleRow?.role !== 'super_admin') return jsonResponse({ error: 'Forbidden' }, 403)

    const rateLimit = await checkRateLimit(supabaseAdmin, callerId, 'admin', 120)
    if (!rateLimit.allowed) {
      return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.action !== 'string') return jsonResponse({ error: 'action is required' }, 400)

    // ── list_admins ──────────────────────────────────────────────────────────
    if (body.action === 'list_admins') {
      const { data: restaurantAdmins, error } = await supabaseAdmin
        .from('restaurant_admins')
        .select('id, user_id, restaurant_id, agreement_accepted_at, agreement_version, last_login_at, restaurants(name, slug)')

      if (error) {
        console.error('list_admins query error', error)
        return jsonResponse({ error: 'Failed to load admins' }, 500)
      }

      // Bulk-fetch phone numbers per restaurant
      const restaurantIds = (restaurantAdmins ?? []).map((a) => a.restaurant_id)
      const { data: phoneRows } = await supabaseAdmin
        .from('phone_restaurant_links')
        .select('restaurant_id, phone_number')
        .in('restaurant_id', restaurantIds)

      const phoneMap: Record<string, string> = {}
      for (const p of phoneRows ?? []) phoneMap[p.restaurant_id] = p.phone_number

      // Bulk-fetch Telegram linking status
      const linkedPhones = Object.values(phoneMap).filter(Boolean)
      const { data: telegramRows } = linkedPhones.length
        ? await supabaseAdmin.from('telegram_accounts').select('phone_number').in('phone_number', linkedPhones)
        : { data: [] }

      const telegramLinkedSet = new Set((telegramRows ?? []).map((t) => t.phone_number))

      const result = []
      for (const row of restaurantAdmins ?? []) {
        let email = 'unknown'
        let lastSignInAt: string | null = null
        const { data: userResult } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
        if (userResult?.user) {
          email = userResult.user.email ?? 'unknown'
          lastSignInAt = userResult.user.last_sign_in_at ?? null
        }

        const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants
        const phoneNumber = phoneMap[row.restaurant_id] ?? null

        result.push({
          id: row.id,
          userId: row.user_id,
          email,
          restaurantId: row.restaurant_id,
          restaurantName: restaurant?.name ?? '',
          restaurantSlug: restaurant?.slug ?? '',
          agreementAcceptedAt: row.agreement_accepted_at,
          agreementVersion: row.agreement_version,
          lastLoginAt: row.last_login_at,
          lastSignInAt,
          phoneNumber,
          telegramLinked: phoneNumber ? telegramLinkedSet.has(phoneNumber) : false,
        })
      }

      return jsonResponse({ admins: result })
    }

    // ── reset_password ───────────────────────────────────────────────────────
    if (body.action === 'reset_password') {
      if (typeof body.userId !== 'string' || typeof body.newPassword !== 'string') {
        return jsonResponse({ error: 'userId and newPassword are required' }, 400)
      }
      if (body.newPassword.length < MIN_PASSWORD_LENGTH || body.newPassword.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse({ error: `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters` }, 400)
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(body.userId, { password: body.newPassword })
      if (error) {
        console.error('reset_password error', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ success: true })
    }

    // ── create_restaurant_admin ──────────────────────────────────────────────
    if (body.action === 'create_restaurant_admin') {
      if (!isValidEmail(body.email) || typeof body.password !== 'string' || !isValidUUID(body.restaurantId)) {
        return jsonResponse({ error: 'Valid email, password and restaurantId (UUID) are required' }, 400)
      }
      if (body.password.length < MIN_PASSWORD_LENGTH || body.password.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse({ error: `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters` }, 400)
      }

      const { data: restaurant, error: restaurantError } = await supabaseAdmin
        .from('restaurants').select('id').eq('id', body.restaurantId).maybeSingle()
      if (restaurantError || !restaurant) return jsonResponse({ error: 'Restaurant not found' }, 404)

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: body.email, password: body.password, email_confirm: true,
      })
      if (createError || !created?.user) {
        return jsonResponse({ error: createError?.message || 'Failed to create admin user' }, 500)
      }

      const newUserId = created.user.id

      const { error: roleError } = await supabaseAdmin
        .from('user_roles').insert({ user_id: newUserId, role: 'admin' })
      if (roleError) {
        console.error('role insert error', roleError)
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        return jsonResponse({ error: 'Failed to assign admin role' }, 500)
      }

      const { error: linkError } = await supabaseAdmin
        .from('restaurant_admins').insert({ user_id: newUserId, restaurant_id: body.restaurantId })
      if (linkError) {
        console.error('restaurant link error', linkError)
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        return jsonResponse({ error: 'Failed to link admin to restaurant' }, 500)
      }

      // Optionally link phone number at creation time
      if (typeof body.phoneNumber === 'string' && body.phoneNumber.trim()) {
        const { error: phoneError } = await supabaseAdmin
          .from('phone_restaurant_links')
          .upsert(
            { restaurant_id: body.restaurantId, phone_number: body.phoneNumber.trim() },
            { onConflict: 'restaurant_id' },
          )
        if (phoneError) console.error('phone link error (non-fatal)', phoneError)
      }

      return jsonResponse({ userId: newUserId, email: created.user.email })
    }

    // ── delete_restaurant_admin_user ─────────────────────────────────────────
    if (body.action === 'delete_restaurant_admin_user') {
      if (!isValidUUID(body.userId)) return jsonResponse({ error: 'userId must be a valid UUID' }, 400)

      const { error } = await supabaseAdmin.auth.admin.deleteUser(body.userId)
      if (error) {
        console.error('delete user error', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ success: true })
    }

    // ── set_owner_phone ──────────────────────────────────────────────────────
    if (body.action === 'set_owner_phone') {
      if (!isValidUUID(body.restaurantId) || typeof body.phoneNumber !== 'string') {
        return jsonResponse({ error: 'restaurantId (UUID) and phoneNumber are required' }, 400)
      }
      const phone = body.phoneNumber.trim()
      if (!phone || phone.length > 20) return jsonResponse({ error: 'Invalid phone number' }, 400)

      const { error } = await supabaseAdmin
        .from('phone_restaurant_links')
        .upsert(
          { restaurant_id: body.restaurantId, phone_number: phone },
          { onConflict: 'restaurant_id' },
        )

      if (error) {
        console.error('set_owner_phone error', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ success: true })
    }

    // ── remove_owner_phone ───────────────────────────────────────────────────
    if (body.action === 'remove_owner_phone') {
      if (!isValidUUID(body.restaurantId)) return jsonResponse({ error: 'restaurantId must be a valid UUID' }, 400)

      await supabaseAdmin
        .from('phone_restaurant_links')
        .delete()
        .eq('restaurant_id', body.restaurantId)

      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('admin-management error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
