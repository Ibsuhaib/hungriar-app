// update-order-status — moves an ONLINE (delivery/takeaway) order through its
// lifecycle and broadcasts the change to the customer tracking page.
// Requires an authenticated admin of the order's restaurant (restaurant_admins)
// or a super admin.
//
// Dine-in orders are rejected: their status flow is handled by the existing
// admin/chef/staff pages directly (unchanged behaviour).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'
import { broadcast } from '../_shared/broadcast.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Allowed transitions; cancellation is possible until food goes out.
const TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(req, { error: 'Not authenticated' }, 401)
    }

    const body = await req.json().catch(() => null) as { order_id?: unknown; new_status?: unknown } | null
    if (!body) return jsonResponse(req, { error: 'Invalid JSON body' }, 400)

    const orderId = body.order_id
    const newStatus = body.new_status
    if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) {
      return jsonResponse(req, { error: 'Invalid order_id' }, 400)
    }
    if (
      typeof newStatus !== 'string' ||
      !Object.values(TRANSITIONS).some((t) => t.includes(newStatus))
    ) {
      return jsonResponse(req, { error: 'Invalid status' }, 400)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ---- Identify the caller ---------------------------------------------
    const { data: userData, error: uErr } = await supabaseAdmin.auth.getUser(
      authHeader.slice('Bearer '.length),
    )
    if (uErr || !userData?.user) {
      return jsonResponse(req, { error: 'Not authenticated' }, 401)
    }
    const userId = userData.user.id

    // ---- Load the order ----------------------------------------------------
    const { data: order, error: oErr } = await supabaseAdmin
      .from('orders')
      .select('id, restaurant_id, status, order_type')
      .eq('id', orderId)
      .maybeSingle()
    if (oErr || !order) {
      return jsonResponse(req, { error: 'Order not found' }, 404)
    }
    if (order.order_type !== 'delivery' && order.order_type !== 'takeaway') {
      return jsonResponse(req, { error: 'Not an online order' }, 400)
    }

    // ---- Authorize: restaurant admin or super admin ------------------------
    const [{ data: adminRow }, { data: roleRow }] = await Promise.all([
      supabaseAdmin
        .from('restaurant_admins')
        .select('id')
        .eq('user_id', userId)
        .eq('restaurant_id', order.restaurant_id)
        .maybeSingle(),
      supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'super_admin')
        .maybeSingle(),
    ])
    if (!adminRow && !roleRow) {
      return jsonResponse(req, { error: 'Not authorized for this order' }, 403)
    }

    if (!TRANSITIONS[order.status]?.includes(newStatus)) {
      return jsonResponse(
        req,
        { error: `Cannot move an order from '${order.status}' to '${newStatus}'` },
        409,
      )
    }

    const { error: upErr } = await supabaseAdmin
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
    if (upErr) {
      console.error('status update failed', upErr)
      return jsonResponse(req, { error: 'Could not update the order' }, 500)
    }

    await broadcast(`order-${orderId}`, 'status_update', {
      order_id: orderId,
      status: newStatus,
    })

    return jsonResponse(req, { order_id: orderId, status: newStatus })
  } catch (err) {
    console.error('update-order-status error', err)
    return jsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
