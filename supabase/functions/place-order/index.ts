import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse, getClientIp, checkRateLimit } from '../_shared/utils.ts'
import { verifyTableToken } from '../_shared/tableToken.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TABLE_TOKEN_SECRET = Deno.env.get('TABLE_TOKEN_SECRET')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')

const MAX_ITEMS = 50
const MAX_QUANTITY = 50
const MAX_NOTES_LENGTH = 200

interface RequestedItem {
  menuItemId: string
  quantity: number
  notes?: string
}

/**
 * POST { token, items: [{ menuItemId, quantity, notes? }] }
 * Public endpoint (no auth) - rate limited per IP.
 *
 * Prices are always re-read from the database (never trusted from the
 * client) and the table token is re-verified server-side before any row
 * is written.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  try {
    if (!TABLE_TOKEN_SECRET) {
      console.error('TABLE_TOKEN_SECRET is not configured')
      return jsonResponse(req, { error: 'Server misconfiguration' }, 500)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const ip = getClientIp(req)

    const rateLimit = await checkRateLimit(supabaseAdmin, ip, 'customer', 60)
    if (!rateLimit.allowed) {
      return jsonResponse(req, { error: 'Too many requests, please slow down' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.token !== 'string' || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse(req, { error: 'Invalid order payload' }, 400)
    }

    if (body.items.length > MAX_ITEMS) {
      return jsonResponse(req, { error: 'Too many distinct items in order' }, 400)
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
    // Anonymous per-phone tag so each phone at the table can tell which of the
    // table's orders it placed. Not an identity — just a random string.
    const deviceTag = typeof body.deviceTag === 'string' && /^[A-Za-z0-9]{1,32}$/.test(body.deviceTag)
      ? body.deviceTag
      : null

    const tokenResult = await verifyTableToken(body.token, TABLE_TOKEN_SECRET)
    if (!tokenResult.valid) {
      return jsonResponse(req, { error: 'Invalid QR code. Please rescan the QR code.' }, 401)
    }

    const restaurantId = tokenResult.restaurantId!
    const tableId = tokenResult.tableId!

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id, subscription_status, tax_percentage')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant || restaurant.subscription_status === 'inactive') {
      return jsonResponse(req, { error: 'This restaurant is currently unavailable.' }, 403)
    }

    const { data: table, error: tableError } = await supabaseAdmin
      .from('tables')
      .select('id, table_number, session_id, opened_at, qr_valid_after')
      .eq('id', tableId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (tableError || !table) {
      return jsonResponse(req, { error: 'Table not found.' }, 404)
    }

    // A QR code issued before the owner's last "Reset QR" for this table is
    // dead — that is how a photographed code gets revoked.
    if (table.qr_valid_after && tokenResult.issuedAt! * 1000 < Date.parse(table.qr_valid_after)) {
      return jsonResponse(req, { error: 'This QR code is no longer valid. Please ask staff for help.' }, 401)
    }

    // The session is required, not optional: a client that simply left it out
    // used to skip this check entirely. It rotates when the bill is settled,
    // so a group that has paid can no longer order onto the next group's table.
    if (!sessionId || table.session_id !== sessionId) {
      return jsonResponse(req, { error: 'session_ended', message: 'This table\'s bill has been settled. Please rescan the QR code to start a new order.' }, 401)
    }

    // Sanitize + dedupe requested items (sum quantities for duplicate ids)
    const requested = new Map<string, { quantity: number; notes: string }>()
    for (const raw of body.items as unknown[]) {
      const item = raw as Partial<RequestedItem>
      if (!item || typeof item.menuItemId !== 'string' || item.menuItemId.length > 64) continue
      const quantity = Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) continue
      const notes = typeof item.notes === 'string'
        ? item.notes.trim().slice(0, MAX_NOTES_LENGTH)
        : ''
      const existing = requested.get(item.menuItemId)
      requested.set(item.menuItemId, { quantity: (existing?.quantity ?? 0) + quantity, notes })
    }

    // Caps how fast any one table can send orders, which limits the damage a
    // shared QR photo can do while a table is open.
    const tableLimit = await checkRateLimit(supabaseAdmin, `table-orders:${tableId}`, 'customer', 6)
    if (!tableLimit.allowed) {
      return jsonResponse(req, { error: 'Too many orders from this table. Please wait a moment.' }, 429, { 'Retry-After': String(tableLimit.retryAfter) })
    }

    if (requested.size === 0) {
      return jsonResponse(req, { error: 'No valid items in order' }, 400)
    }

    const menuItemIds = Array.from(requested.keys())
    const { data: menuItems, error: menuError } = await supabaseAdmin
      .from('menu_items')
      .select('id, name, price, available')
      .eq('restaurant_id', restaurantId)
      .in('id', menuItemIds)

    if (menuError) {
      console.error('menu lookup error', menuError)
      return jsonResponse(req, { error: 'Failed to validate menu items' }, 500)
    }

    const menuById = new Map((menuItems ?? []).map((m) => [m.id as string, m]))

    const orderItemsPayload: { menu_item_id: string; item_name: string; quantity: number; unit_price: number; notes: string }[] = []
    let total = 0

    for (const [menuItemId, { quantity, notes }] of requested.entries()) {
      const menuItem = menuById.get(menuItemId)
      if (!menuItem || !menuItem.available) continue
      const unitPrice = Number(menuItem.price)
      orderItemsPayload.push({
        menu_item_id: menuItem.id as string,
        item_name: menuItem.name as string,
        quantity,
        unit_price: unitPrice,
        notes,
      })
      total += unitPrice * quantity
    }

    if (orderItemsPayload.length === 0) {
      return jsonResponse(req, { error: 'None of the requested items are currently available' }, 400)
    }

    const taxPercentage = Number(restaurant.tax_percentage) || 0
    const taxAmount = Math.round(total * taxPercentage) / 100
    total = Math.round((total + taxAmount) * 100) / 100

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id: tableId,
        // First order on a table nobody has opened waits for a waiter or the
        // owner to confirm guests are really seated; after that the table is
        // open and orders go straight to the kitchen.
        status: table.opened_at ? 'pending' : 'awaiting_approval',
        total_amount: total,
        session_id: table.session_id,
        device_tag: deviceTag,
      })
      .select('id, status, total_amount, order_time')
      .single()

    if (orderError || !order) {
      console.error('order insert error', orderError)
      return jsonResponse(req, { error: 'Failed to place order' }, 500)
    }

    const itemsToInsert = orderItemsPayload.map((item) => ({ ...item, order_id: order.id }))
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(itemsToInsert)

    if (itemsError) {
      console.error('order_items insert error', itemsError)
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      return jsonResponse(req, { error: 'Failed to place order' }, 500)
    }

    // Send push notifications (fire-and-forget — never blocks the response)
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      sendPushNotifications(supabaseAdmin, restaurantId, table.table_number, orderItemsPayload.length, order.status === 'awaiting_approval').catch(
        (err) => console.error('push notification error', err),
      )
    }

    return jsonResponse(req, 
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
    return jsonResponse(req, { error: 'Internal server error' }, 500)
  }
})

async function sendPushNotifications(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  restaurantId: string,
  tableNumber: number | null,
  itemCount: number,
  needsApproval: boolean,
) {
  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('restaurant_id', restaurantId)

  if (!subscriptions || subscriptions.length === 0) return

  const { default: webpush } = await import('npm:web-push')
  webpush.setVapidDetails(
    'mailto:noreply@hungriar.app',
    VAPID_PUBLIC_KEY!,
    VAPID_PRIVATE_KEY!,
  )

  const payload = JSON.stringify({
    title: needsApproval
      ? `Table ${tableNumber ?? '?'} — approve new guests?`
      : `New Order — Table ${tableNumber ?? '?'}`,
    body: needsApproval
      ? 'Check someone is seated before the order goes to the kitchen.'
      : `${itemCount} item${itemCount !== 1 ? 's' : ''} ordered`,
    url: '/admin/orders',
  })

  await Promise.allSettled(
    subscriptions.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
    ),
  )
}
