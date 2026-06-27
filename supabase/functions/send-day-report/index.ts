import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function fmt(n: number, currency: string) {
  return `${currency}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other',
}
function methodLabel(m: string) {
  return METHOD_LABELS[m?.toLowerCase()] ?? m
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { restaurantId, restaurantName, currency = '₹', collections, expenses, netMap, totalCollected, totalExpenses, netTotal, closedAt } = body as {
    restaurantId: string
    restaurantName: string
    currency: string
    collections: Array<{ payment_method: string; count: number; total: number }>
    expenses: Array<{ description: string; amount: number; payment_method: string }>
    netMap: Record<string, number>
    totalCollected: number
    totalExpenses: number
    netTotal: number
    closedAt: string
  }

  if (!restaurantId || !collections) {
    return jsonResponse({ error: 'restaurantId and collections are required' }, 400)
  }

  // Find owner's phone number for this restaurant
  const { data: phoneRow } = await adminClient
    .from('phone_restaurant_links')
    .select('phone_number')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (!phoneRow?.phone_number) {
    return jsonResponse({ skipped: true, reason: 'No owner phone linked to this restaurant' })
  }

  // Find Telegram chat_id for this phone
  const { data: tgRow } = await adminClient
    .from('telegram_accounts')
    .select('chat_id')
    .eq('phone_number', phoneRow.phone_number)
    .maybeSingle()

  if (!tgRow?.chat_id) {
    return jsonResponse({ skipped: true, reason: 'Owner has not linked Telegram' })
  }

  // Build report message
  const lines: string[] = []

  lines.push(`📊 *Day End Report*`)
  lines.push(`🏪 ${restaurantName}`)
  lines.push(`🕐 ${fmtTime(closedAt)}`)
  lines.push('')

  lines.push(`💰 *Collections*`)
  if ((collections as Array<unknown>).length === 0) {
    lines.push('  No bills settled this session.')
  } else {
    for (const c of collections) {
      lines.push(`  ${methodLabel(c.payment_method)} — ${fmt(c.total, currency)} (${c.count} bill${c.count !== 1 ? 's' : ''})`)
    }
    lines.push(`  *Total Collected: ${fmt(totalCollected, currency)}*`)
  }
  lines.push('')

  lines.push(`💸 *Expenses*`)
  if ((expenses as Array<unknown>).length === 0) {
    lines.push('  No expenses this session.')
  } else {
    for (const e of expenses) {
      lines.push(`  ${e.description} — ${fmt(e.amount, currency)} (${methodLabel(e.payment_method)})`)
    }
    lines.push(`  *Total Expenses: ${fmt(totalExpenses, currency)}*`)
  }
  lines.push('')

  lines.push(`📈 *Cash in Hand*`)
  for (const [method, net] of Object.entries(netMap)) {
    lines.push(`  ${methodLabel(method)}: ${fmt(net, currency)}`)
  }
  lines.push('')

  const emoji = netTotal >= 0 ? '✅' : '⚠️'
  lines.push(`${emoji} *Net Total: ${fmt(netTotal, currency)}*`)
  lines.push('')
  lines.push(`_Sent by HungriAR_`)

  const text = lines.join('\n')

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgRow.chat_id, text, parse_mode: 'Markdown' }),
  })

  if (!tgRes.ok) {
    const err = await tgRes.text()
    console.error('Telegram sendMessage failed', err)
    return jsonResponse({ error: 'Failed to send Telegram report' }, 500)
  }

  return jsonResponse({ success: true })
})
