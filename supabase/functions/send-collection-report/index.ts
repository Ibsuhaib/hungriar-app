import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'
import { sendWhatsAppText } from '../_shared/whatsapp.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const METHOD_LABELS: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' }
function methodLabel(m: string) {
  return METHOD_LABELS[(m ?? '').toLowerCase()] ?? (m || '—')
}

function fmt(n: number, currency: string) {
  return `${currency}${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * POST — notifies the owner's Telegram when money is collected from the counter
 * (the "Collect" action in Analytics, i.e. an expenses row with
 * category = 'collection'). Caller must be a restaurant admin of the target
 * restaurant (or a super admin). Silently skipped when no Telegram is linked,
 * so it never blocks the collection flow on the client.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse(req, { error: 'Missing authorization' }, 401)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return jsonResponse(req, { error: 'Invalid session' }, 401)
  const userId = userData.user.id

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const restaurantId = String(body.restaurantId ?? '')
  if (!UUID_RE.test(restaurantId)) return jsonResponse(req, { error: 'Valid restaurantId is required' }, 400)

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount <= 0) return jsonResponse(req, { error: 'Valid amount is required' }, 400)

  // Authorize: caller must own this restaurant (or be super admin).
  const { data: roleRow } = await adminClient
    .from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  const isSuperAdmin = roleRow?.role === 'super_admin'
  if (!isSuperAdmin) {
    const { data: adminRow } = await adminClient
      .from('restaurant_admins').select('id')
      .eq('user_id', userId).eq('restaurant_id', restaurantId).maybeSingle()
    if (!adminRow) return jsonResponse(req, { error: 'Not authorized for this restaurant' }, 403)
  }

  const restaurantName = String(body.restaurantName ?? 'Restaurant')
  const currency       = typeof body.currency === 'string' && body.currency ? body.currency : '₹'
  const paymentMethod  = String(body.paymentMethod ?? '')
  const note           = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : ''
  // Optional: how much is left in the register for this method after the collection.
  const remaining      = body.remaining != null && Number.isFinite(Number(body.remaining)) ? Number(body.remaining) : null

  // Find the owner's phone number for this restaurant.
  const { data: phoneRow } = await adminClient
    .from('phone_restaurant_links').select('phone_number')
    .eq('restaurant_id', restaurantId).maybeSingle()
  if (!phoneRow?.phone_number) return jsonResponse(req, { skipped: true, reason: 'No owner phone linked' })

  const lines: string[] = []
  lines.push('💰 *Money Collected*')
  lines.push(`🏪 ${restaurantName}`)
  lines.push(`🕐 ${fmtTime(new Date().toISOString())}`)
  lines.push('')
  lines.push(`${methodLabel(paymentMethod)}: *${fmt(amount, currency)}*`)
  if (note) lines.push(`📝 ${note}`)
  if (remaining !== null) lines.push(`🧾 Left in ${methodLabel(paymentMethod).toLowerCase()}: ${fmt(remaining, currency)}`)
  lines.push('')
  lines.push('_Sent by HungriAR_')

  const result = await sendWhatsAppText(phoneRow.phone_number, lines.join('\n'))
  if (!result.ok) {
    console.error('WhatsApp send failed', result.error)
    return jsonResponse(req, { error: 'Failed to send WhatsApp message' }, 500)
  }

  return jsonResponse(req, { success: true })
})
