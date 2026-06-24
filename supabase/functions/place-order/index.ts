import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, getClientIp, checkRateLimit } from '../_shared/utils.ts'
import { verifyTableToken } from '../_shared/tableToken.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TABLE_TOKEN_SECRET = Deno.env.get('TABLE_TOKEN_SECRET')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? ''

const MAX_ITEMS = 50
const MAX_QUANTITY = 50

interface RequestedItem {
  menuItemId: string
  quantity: number
}

/**
 * Sends web push notifications to all subscribed admin devices for a restaurant.
 * Uses a dynamic import so that a missing/broken web-push module never breaks
 * the order placement flow — all errors are caught and logged only.
 */
async function notifyAdmins(
  admin: ReturnType<typeof createClient>,
  restaurantId: string,
  tableName: string,
  itemCount: number,
) {
  try {
    // deno-lint-ignore no-explicit-any
    const { default: webPush } = await import('npm:web-push') as { default: any }
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('restaurant_id', restaurantId)

    if (!subs || subs.length === 0) return

    const payload = JSON.stringify({
      title: 'New Order!',
      body: `Table ${tableName}: ${itemCount} item${itemCount !== 1 ? 's' : ''}`,
      url: '/admin/orders',
    })

    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth_key: string }) => {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload,
          )
        } catch (err: unknown) {
          const e = err as { statusCode?: number }
          if (e.statusCode === 410 || e.statusCode === 404) {
            // Subscription is no longer valid — clean it up
            await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }),
    )
  } catch (err) {
    console.error('push notification error:', err)
  }
}

/**
 * POST { token, items: [{ menuItemId, quantity }] }
 * Public endpoint (no auth) - rate limited per IP.
 *
 * Prices are always re-read from the database (never trusted from the
 * client) and the table token is re-verified server-side before any row
 * is written.
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
    const ip = getClientIp(req)

    const rateLimit = await checkRateLimit(supabaseAdmin, ip, 'customer', 60)
    if (!rateLimit.allowed) {
      return jsonResponse({ error: 'Too many requests, please slow down' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.token !== 'string' || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ error: 'Invalid order payload' }, 400)
    }

    if (body.items.length > MAX_ITEMS) {
      return jsonResponse({ error: 'Too many distinct items in order' }, 400)
    }

    const tokenResult = await verifyTableToken(body.token, TABLE_TOKEN_SECRET)
    if (!tokenResult.valid) {
      return jsonResponse({ error: 'Invalid or expired table session. Please rescan the QR code.' }, 401)
    }

    const restaurantId = tokenResult.restaurantId!
    const tableId = tokenResult.tableId!

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id, subscription_status')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant || restaurant.subscription_status === 'inactive') {
      return jsonResponse({ error: 'This restaurant is currently unavailable.' }, 403)
    }

    const { data: table, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id, name')
      .eq('id', tableId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (tableError || !table) {
      return jsonResponse({ error: 'Table not found.' }, 404)
    }

    // Sanitize + dedupe requested items (sum quantities for duplicate ids)
    const requested = new Map<string, number>()
    for (const raw of body.items as unknown[]) {
      const item = raw as Partial<RequestedItem>
      if (!item || typeof item.menuItemId !== 'string' || item.menuItemId.length > 64) continue
      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) continue
      requested.set(item.menuItemId, (requested.get(item.menuItemId) ?? 0) + quantity)
    }

    if (requested.size === 0) {
      return jsonResponse({ error: 'No valid items in order' }, 400)
    }

    const menuItemIds = Array.from(requested.keys())
    const { data: menuItems, error: menuError } = await supabaseAdmin
      .from('menu_items')
      .select('id, name, price, available')
      .eq('restaurant_id', restaurantId)
      .in('id', menuItemIds)

    if (menuError) {
      console.error('menu lookup error', menuError)
      return jsonResponse({ error: 'Failed to validate menu items' }, 500)
    }

    const menuById = new Map((menuItems ?? []).map((m) => [m.id as string, m]))

    const orderItemsPayload: { menu_item_id: string; item_name: string; quantity: number; unit_price: number }[] = []
    let total = 0

    for (const [menuItemId, quantity] of requested.entries()) {
      const menuItem = menuById.get(menuItemId)
      if (!menuItem || !menuItem.available) continue
      const unitPrice = Number(menuItem.price)
      orderItemsPayload.push({
        menu_item_id: menuItem.id as string,
        item_name: menuItem.name as string,
        quantity,
        unit_price: unitPrice,
      })
      total += unitPrice * quantity
    }

    if (orderItemsPayload.length === 0) {
      return jsonResponse({ error: 'None of the requested items are currently available' }, 400)
    }

    total = Math.round(total * 100) / 100

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        status: 'pending',
        total_amount: total,
      })
      .select('id, status, total_amount, order_time')
      .single()

    if (orderError || !order) {
      console.error('order insert error', orderError)
      return jsonResponse({ error: 'Failed to place order' }, 500)
    }

    const itemsToInsert = orderItemsPayload.map((item) => ({ ...item, order_id: order.id }))
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(itemsToInsert)

    if (itemsError) {
      console.error('order_items insert error', itemsError)
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      return jsonResponse({ error: 'Failed to place order' }, 500)
    }

    // Fire push notifications without awaiting — must not block or fail the order response
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
      notifyAdmins(supabaseAdmin, restaurantId, (table as { id: string; name: string }).name, orderItemsPayload.length)
    }

    return jsonResponse(
      {
        orderId: order.id,
        status: order.status,
        total: order.total_amount,
        orderTime: order.order_time,
      },
      201,
    )
  } catch (err) {
    console.error('place-order error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
