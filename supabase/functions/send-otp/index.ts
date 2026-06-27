import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse } from '../_shared/utils.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let phone_number: string
  try {
    const body = await req.json()
    phone_number = (body?.phone_number ?? '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  if (!phone_number) return jsonResponse({ error: 'phone_number is required' }, 400)

  // Check phone has at least one restaurant linked
  const { data: links } = await supabase
    .from('phone_restaurant_links')
    .select('id')
    .eq('phone_number', phone_number)
    .limit(1)

  if (!links?.length) {
    return jsonResponse({ error: 'Phone number not registered. Contact support.' }, 404)
  }

  // Check Telegram is linked
  const { data: telegramRow } = await supabase
    .from('telegram_accounts')
    .select('chat_id')
    .eq('phone_number', phone_number)
    .maybeSingle()

  if (!telegramRow) {
    return jsonResponse({ error: 'telegram_not_linked' }, 403)
  }

  // Rate limit: max 3 OTPs per phone per 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone_number', phone_number)
    .gte('created_at', tenMinutesAgo)

  if ((count ?? 0) >= 3) {
    return jsonResponse({ error: 'Too many OTP requests. Try again in 10 minutes.' }, 429)
  }

  const code = generateOTP()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  await supabase.from('otp_codes').insert({ phone_number, code, expires_at: expiresAt })

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramRow.chat_id,
      text: `🔐 Your HungriAR login code:\n\n*${code}*\n\nValid for 5 minutes. Do not share this code.`,
      parse_mode: 'Markdown',
    }),
  })

  if (!tgRes.ok) {
    const err = await tgRes.text()
    console.error('Telegram sendMessage failed', err)
    return jsonResponse({ error: 'Failed to send OTP via Telegram.' }, 500)
  }

  return jsonResponse({ success: true })
})
