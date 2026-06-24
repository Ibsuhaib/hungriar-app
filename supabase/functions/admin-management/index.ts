import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, checkRateLimit } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

/**
 * POST { action: 'list_admins' | 'reset_password' | 'create_restaurant_admin' | 'delete_restaurant_admin_user', ... }
 * Auth: super_admin only.
 *
 * - list_admins: returns every restaurant_admins row joined with the
 *   underlying auth user's email + last sign-in time (requires the
 *   service role auth admin API, hence this edge function).
 * - reset_password: { userId, newPassword } sets a new password for a
 *   restaurant admin via supabase.auth.admin.updateUserById.
 * - create_restaurant_admin: { email, password, restaurantId } creates a new
 *   auth user, assigns the 'admin' role and links it to the restaurant via
 *   restaurant_admins.
 * - delete_restaurant_admin_user: { userId } deletes the auth user, cascading
 *   to user_roles and restaurant_admins.
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
    const userId = userData.user.id

    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (roleRow?.role !== 'super_admin') return jsonResponse({ error: 'Forbidden' }, 403)

    const rateLimit = await checkRateLimit(supabaseAdmin, userId, 'admin', 120)
    if (!rateLimit.allowed) {
      return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.action !== 'string') return jsonResponse({ error: 'action is required' }, 400)

    if (body.action === 'list_admins') {
      const { data: restaurantAdmins, error } = await supabaseAdmin
        .from('restaurant_admins')
        .select('id, user_id, restaurant_id, agreement_accepted_at, agreement_version, last_login_at, restaurants(name, slug)')

      if (error) {
        console.error('list_admins query error', error)
        return jsonResponse({ error: 'Failed to load admins' }, 500)
      }

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
        })
      }

      return jsonResponse({ admins: result })
    }

    if (body.action === 'reset_password') {
      if (typeof body.userId !== 'string' || typeof body.newPassword !== 'string') {
        return jsonResponse({ error: 'userId and newPassword are required' }, 400)
      }
      if (body.newPassword.length < MIN_PASSWORD_LENGTH || body.newPassword.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse(
          { error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters` },
          400,
        )
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(body.userId, {
        password: body.newPassword,
      })

      if (error) {
        console.error('reset_password error', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ success: true })
    }

    if (body.action === 'create_restaurant_admin') {
      if (
        typeof body.email !== 'string' ||
        typeof body.password !== 'string' ||
        typeof body.restaurantId !== 'string'
      ) {
        return jsonResponse({ error: 'email, password and restaurantId are required' }, 400)
      }

      if (body.password.length < MIN_PASSWORD_LENGTH || body.password.length > MAX_PASSWORD_LENGTH) {
        return jsonResponse(
          { error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters` },
          400,
        )
      }

      const { data: restaurant, error: restaurantError } = await supabaseAdmin
        .from('restaurants')
        .select('id')
        .eq('id', body.restaurantId)
        .maybeSingle()

      if (restaurantError || !restaurant) {
        return jsonResponse({ error: 'Restaurant not found' }, 404)
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      })

      if (createError || !created?.user) {
        return jsonResponse({ error: createError?.message || 'Failed to create admin user' }, 500)
      }

      const newUserId = created.user.id

      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({ user_id: newUserId, role: 'admin' })

      if (roleError) {
        console.error('create_restaurant_admin role insert error', roleError)
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        return jsonResponse({ error: 'Failed to assign admin role' }, 500)
      }

      const { error: linkError } = await supabaseAdmin
        .from('restaurant_admins')
        .insert({ user_id: newUserId, restaurant_id: body.restaurantId })

      if (linkError) {
        console.error('create_restaurant_admin link insert error', linkError)
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        return jsonResponse({ error: 'Failed to link admin to restaurant' }, 500)
      }

      return jsonResponse({ userId: newUserId, email: created.user.email })
    }

    if (body.action === 'delete_restaurant_admin_user') {
      if (typeof body.userId !== 'string') {
        return jsonResponse({ error: 'userId is required' }, 400)
      }

      const { error } = await supabaseAdmin.auth.admin.deleteUser(body.userId)
      if (error) {
        console.error('delete_restaurant_admin_user error', error)
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('admin-management error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
