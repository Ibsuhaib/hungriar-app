import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { jsonResponse, getClientIp, checkRateLimit } from '../_shared/utils.ts'
import { sendWhatsAppText } from '../_shared/whatsapp.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Math.random() is a predictable PRNG — its internal state is recoverable from
// observed outputs, which would let an attacker derive OTPs issued to others.
// Rejection sampling keeps the 6-digit range uniform (no modulo bias).
function generateOTP(): string {
  const buf = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= 4_294_000_000)
  return (100000 + (n % 900000)).toString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  let phone_number: string
  try {
    const body = await req.json()
    phone_number = (body?.phone_number ?? '').trim()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  if (!phone_number) return jsonResponse(req, { error: 'phone_number is required' }, 400)
  if (phone_number.length > 20) return jsonResponse(req, { error: 'Invalid phone number' }, 400)

  // Per-IP rate limit — the per-phone cap below stops targeting one number,
  // this stops a single client spraying OTPs across many numbers.
  const ip = getClientIp(req)
  const ipLimit = await checkRateLimit(supabase, `otp-send-ip:${ip}`, 'customer', 10)
  if (!ipLimit.allowed) {
    return jsonResponse(req, { error: 'Too many requests. Please slow down.' }, 429, {
      'Retry-After': String(ipLimit.retryAfter),
    })
  }

  // Check phone has at least one restaurant linked
  const { data: links } = await supabase
    .from('phone_restaurant_links')
    .select('id')
    .eq('phone_number', phone_number)
    .limit(1)

  if (!links?.length) {
    return jsonResponse(req, { error: 'Phone number not registered. Contact support.' }, 404)
  }

  // Rate limit: max 3 OTPs per phone per 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone_number', phone_number)
    .gte('created_at', tenMinutesAgo)

  if ((count ?? 0) >= 3) {
    return jsonResponse(req, { error: 'Too many OTP requests. Try again in 10 minutes.' }, 429)
  }

  const code = generateOTP()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  await supabase.from('otp_codes').insert({ phone_number, code, expires_at: expiresAt })

  const result = await sendWhatsAppText(
    phone_number,
    `🔐 Your HungriAR login code:\n\n*${code}*\n\nValid for 5 minutes. Do not share this code.`,
  )

  if (!result.ok) {
    console.error('WhatsApp send failed', result.error)
    return jsonResponse(req, { error: 'Failed to send OTP via WhatsApp.' }, 500)
  }

  return jsonResponse(req, { success: true })
})
