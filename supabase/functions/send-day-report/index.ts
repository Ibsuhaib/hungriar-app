import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()
  if (!jwt) return jsonResponse(req, { error: 'Missing authorization' }, 401)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return jsonResponse(req, { error: 'Invalid session' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const {
    restaurantId, restaurantName, currency = '₹', collections, expenses, ownerCollections = [],
    netMap, totalCollected, totalExpenses, totalCollectedByOwner = 0, totalDiscount = 0, totalRoundOff = 0,
    totalPackageCharge = 0, billEditsAdded = 0, billEditsRemoved = 0, netTotal, carryoverFromPrevDays = 0, closedAt,
  } = body as {
    restaurantId: string
    restaurantName: string
    currency: string
    collections: Array<{ payment_method: string; count: number; total: number }>
    expenses: Array<{ description: string; amount: number; payment_method: string }>
    ownerCollections: Array<{ description: string; amount: number; payment_method: string }>
    netMap: Record<string, number>
    totalCollected: number
    totalExpenses: number
    totalCollectedByOwner: number
    totalDiscount: number
    totalRoundOff: number
    totalPackageCharge: number
    billEditsAdded: number
    billEditsRemoved: number
    netTotal: number
    carryoverFromPrevDays: number
    closedAt: string
  }

  if (!restaurantId || !collections || !closedAt) {
    return jsonResponse(req, { error: 'restaurantId, collections and closedAt are required' }, 400)
  }

  // Find owner's phone number for this restaurant
  const { data: phoneRow } = await adminClient
    .from('phone_restaurant_links')
    .select('phone_number')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  if (!phoneRow?.phone_number) {
    return jsonResponse(req, { skipped: true, reason: 'No owner phone linked to this restaurant' })
  }

  // Find Telegram chat_id for this phone
  const { data: tgRow } = await adminClient
    .from('telegram_accounts')
    .select('chat_id')
    .eq('phone_number', phoneRow.phone_number)
    .maybeSingle()

  if (!tgRow?.chat_id) {
    return jsonResponse(req, { skipped: true, reason: 'Owner has not linked Telegram' })
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

  if (totalDiscount > 0 || totalRoundOff !== 0 || totalPackageCharge > 0) {
    lines.push(`🏷️ *Adjustments*`)
    if (totalDiscount > 0) {
      lines.push(`  Discounts Given: − ${fmt(totalDiscount, currency)}`)
    }
    if (totalRoundOff !== 0) {
      const sign = totalRoundOff > 0 ? '+ ' : '− '
      lines.push(`  Round Off: ${sign}${fmt(Math.abs(totalRoundOff), currency)}`)
    }
    if (totalPackageCharge > 0) {
      lines.push(`  Package Charges: + ${fmt(totalPackageCharge, currency)}`)
    }
    lines.push('')
  }

  if (billEditsAdded > 0 || billEditsRemoved > 0) {
    lines.push(`✏️ *Bill Edits*`)
    if (billEditsAdded > 0)   lines.push(`  Items Added: + ${fmt(billEditsAdded, currency)}`)
    if (billEditsRemoved > 0) lines.push(`  Items Removed: − ${fmt(billEditsRemoved, currency)}`)
    const netEdited = billEditsAdded - billEditsRemoved
    lines.push(`  *Net Edited: ${netEdited >= 0 ? '+ ' : '− '}${fmt(Math.abs(netEdited), currency)}*`)
    lines.push('')
  }

  lines.push(`💸 *Business Expenses*`)
  if ((expenses as Array<unknown>).length === 0) {
    lines.push('  No expenses this session.')
  } else {
    for (const e of expenses) {
      lines.push(`  ${e.description} — ${fmt(e.amount, currency)} (${methodLabel(e.payment_method)})`)
    }
    lines.push(`  *Total Expenses: ${fmt(totalExpenses, currency)}*`)
  }
  lines.push('')

  // Money the owner physically took out of the register — NOT a business
  // cost, so it's kept out of Expenses/Net Total above and shown separately.
  if ((ownerCollections as Array<unknown>).length > 0) {
    lines.push(`🏦 *Collected by Owner*`)
    for (const c of ownerCollections) {
      lines.push(`  ${c.description} — ${fmt(c.amount, currency)} (${methodLabel(c.payment_method)})`)
    }
    lines.push(`  *Total Collected by Owner: ${fmt(totalCollectedByOwner, currency)}*`)
    lines.push('')
  }

  const cashEntries = Object.entries(netMap).filter(([m]) => m === 'cash')
  const bankEntries = Object.entries(netMap).filter(([m]) => m !== 'cash')

  lines.push(`🪙 *In the Drawer (Cash)*`)
  if (cashEntries.length === 0) {
    lines.push('  No cash on hand.')
  } else {
    for (const [method, net] of cashEntries) lines.push(`  ${methodLabel(method)}: ${fmt(net, currency)}`)
  }
  lines.push('')

  lines.push(`🏧 *In the Bank (UPI / Card)*`)
  if (bankEntries.length === 0) {
    lines.push('  Nothing pending.')
  } else {
    for (const [method, net] of bankEntries) lines.push(`  ${methodLabel(method)}: ${fmt(net, currency)}`)
  }
  lines.push('')

  if (carryoverFromPrevDays > 0) {
    lines.push(`⏳ Uncollected from previous days: ${fmt(carryoverFromPrevDays, currency)} (see Register Balance in Analytics)`)
    lines.push('')
  }

  const emoji = netTotal >= 0 ? '✅' : '⚠️'
  lines.push(`${emoji} *Net Total (today): ${fmt(netTotal, currency)}*`)
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
    return jsonResponse(req, { error: 'Failed to send Telegram report' }, 500)
  }

  return jsonResponse(req, { success: true })
})
