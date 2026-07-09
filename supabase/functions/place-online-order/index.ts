// place-online-order — creates a delivery/takeaway order from the hungriOrder
// storefront. Public endpoint (guest checkout allowed); prices and totals are
// always recomputed server-side from menu_items, never trusted from the client.
//
// This is a NEW function for online orders only. The existing `place-order`
// function (QR table orders) is untouched.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse, getClientIp, checkRateLimit } from '../_shared/utils.ts'
import { broadcast } from '../_shared/broadcast.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PHONE_RE = /^[6-9]\d{9}$/ // Indian mobile numbers
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAYMENT_METHODS = ['cash', 'upi', 'card', 'other']
const ORDER_TYPES = ['delivery', 'takeaway']
const MAX_ITEMS = 50
const MAX_QTY = 50

const round2 = (n: number) => Math.round(n * 100) / 100
const clean = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return jsonResponse(req, { error: 'Invalid JSON body' }, 400)

    // ---- Validate input shape -------------------------------------------
    const restaurantId = body.restaurant_id
    if (typeof restaurantId !== 'string' || !UUID_RE.test(restaurantId)) {
      return jsonResponse(req, { error: 'Invalid restaurant_id' }, 400)
    }

    const rawItems = body.items
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
      return jsonResponse(req, { error: 'Order must contain 1-50 items' }, 400)
    }
    const wanted = new Map<string, number>()
    for (const it of rawItems) {
      const id = (it as Record<string, unknown>)?.menu_item_id
      const qty = (it as Record<string, unknown>)?.quantity
      if (
        typeof id !== 'string' || !UUID_RE.test(id) ||
        typeof qty !== 'number' || !Number.isInteger(qty) ||
        qty < 1 || qty > MAX_QTY
      ) {
        return jsonResponse(req, { error: 'Invalid order item' }, 400)
      }
      wanted.set(id, (wanted.get(id) ?? 0) + qty)
    }

    const phone = clean(body.customer_phone, 15)?.replace(/\D/g, '').slice(-10)
    if (!phone || !PHONE_RE.test(phone)) {
      return jsonResponse(req, { error: 'A valid 10-digit mobile number is required' }, 400)
    }

    const orderType = ORDER_TYPES.includes(body.order_type as string)
      ? (body.order_type as string)
      : 'delivery'
    const paymentMethod = PAYMENT_METHODS.includes(body.payment_method as string)
      ? (body.payment_method as string)
      : 'cash'
    const customerName = clean(body.customer_name, 80)
    const notes = clean(body.notes, 500)

    let deliveryAddress: Record<string, string> | null = null
    if (orderType === 'delivery') {
      const addr = body.delivery_address as Record<string, unknown> | undefined
      const line1 = clean(addr?.line1, 200)
      if (!addr || typeof addr !== 'object' || !line1) {
        return jsonResponse(req, { error: 'Delivery address is required' }, 400)
      }
      deliveryAddress = { line1 }
      for (const k of ['label', 'line2', 'landmark', 'city', 'pincode']) {
        const v = clean(addr[k], 120)
        if (v) deliveryAddress[k] = v
      }
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    // ---- Rate limiting: per phone and per IP (existing rate limiter) -----
    const ip = getClientIp(req)
    for (const [id, max] of [
      [`online-order:phone:${phone}`, 5],
      [`online-order:ip:${ip}`, 15],
    ] as const) {
      const rl = await checkRateLimit(supabaseAdmin, id, 'customer', max)
      if (!rl.allowed) {
        return jsonResponse(
          req,
          { error: 'Too many orders. Please try again in a few minutes.' },
          429,
          { 'Retry-After': String(rl.retryAfter) },
        )
      }
    }

    // ---- Restaurant + online-ordering checks ------------------------------
    const { data: restaurant, error: rErr } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, is_active, subscription_status, subscription_expiry, delivery_enabled, min_order_amount, delivery_fee')
      .eq('id', restaurantId)
      .maybeSingle()
    if (rErr || !restaurant) {
      return jsonResponse(req, { error: 'Restaurant not found' }, 404)
    }
    if (!restaurant.is_active || restaurant.subscription_status === 'inactive') {
      return jsonResponse(req, { error: 'This restaurant is not accepting orders right now' }, 403)
    }
    if (
      restaurant.subscription_expiry &&
      new Date(restaurant.subscription_expiry) < new Date()
    ) {
      return jsonResponse(req, { error: 'This restaurant is not accepting online orders right now' }, 403)
    }
    if (!restaurant.delivery_enabled) {
      return jsonResponse(req, { error: 'Online ordering is not available for this restaurant' }, 403)
    }

    // ---- Recompute prices from the menu (never trust the client) ---------
    const { data: menuItems, error: mErr } = await supabaseAdmin
      .from('menu_items')
      .select('id, name, price, available, online_available, restaurant_id')
      .in('id', [...wanted.keys()])
      .eq('restaurant_id', restaurantId)
    if (mErr) {
      console.error('menu lookup error', mErr)
      return jsonResponse(req, { error: 'Could not load menu items' }, 500)
    }
    const byId = new Map((menuItems ?? []).map((m) => [m.id as string, m]))
    const orderItems: Record<string, unknown>[] = []
    let subtotal = 0
    for (const [itemId, qty] of wanted) {
      const item = byId.get(itemId)
      // online_available === false → the restaurant hid this dish from the
      // online store (it may still be sold in-house)
      if (!item || !item.available || item.online_available === false) {
        return jsonResponse(req, { error: 'One or more items are no longer available. Please refresh the menu.' }, 409)
      }
      subtotal += round2(Number(item.price) * qty)
      orderItems.push({
        menu_item_id: item.id,
        item_name: item.name,
        unit_price: Number(item.price),
        quantity: qty,
        notes: '',
      })
    }
    subtotal = round2(subtotal)

    const minOrder = Number(restaurant.min_order_amount ?? 0)
    if (orderType === 'delivery' && subtotal < minOrder) {
      return jsonResponse(req, { error: `Minimum order for delivery is ₹${minOrder}` }, 400)
    }

    // Menu prices are tax-inclusive (hungriAR convention), so the order total
    // is simply items + delivery fee.
    const deliveryFee = orderType === 'delivery' ? round2(Number(restaurant.delivery_fee ?? 0)) : 0
    const total = round2(subtotal + deliveryFee)

    // ---- Link the signed-in customer, if any -----------------------------
    let customerId: string | null = null
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const { data: userData } = await supabaseAdmin.auth.getUser(
        authHeader.slice('Bearer '.length),
      )
      if (userData?.user) {
        customerId = userData.user.id
        await supabaseAdmin.from('customers').upsert(
          { id: customerId, phone, name: customerName ?? undefined },
          { onConflict: 'id', ignoreDuplicates: false },
        )
      }
    }

    // ---- Create atomically ------------------------------------------------
    const { data: orderId, error: cErr } = await supabaseAdmin.rpc('create_online_order', {
      p_order: {
        restaurant_id: restaurantId,
        customer_id: customerId ?? '',
        order_type: orderType,
        delivery_address: deliveryAddress,
        customer_phone: phone,
        customer_name: customerName,
        notes,
        total_amount: total,
        delivery_fee: deliveryFee,
        payment_method: paymentMethod,
      },
      p_items: orderItems,
    })
    if (cErr || !orderId) {
      console.error('create online order failed', cErr)
      return jsonResponse(req, { error: 'Could not place the order. Please try again.' }, 500)
    }

    // Fire-and-forget: customer tracking pages listen on this channel.
    // Admin dashboards get the INSERT via postgres_changes automatically.
    broadcast(`order-${orderId}`, 'status_update', {
      order_id: orderId,
      status: 'pending',
    }).catch(() => {})

    return jsonResponse(req, { order_id: orderId, status: 'pending', total }, 201)
  } catch (err) {
    console.error('place-online-order error', err)
    return jsonResponse(req, { error: 'Internal server error' }, 500)
  }
})
