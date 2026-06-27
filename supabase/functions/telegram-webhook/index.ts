import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { jsonResponse } from '../_shared/utils.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Always require the webhook secret — if it's not configured, reject all calls
  if (!WEBHOOK_SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not set')
    return new Response('Server misconfigured', { status: 500 })
  }
  const incomingSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (incomingSecret !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const message = (body?.message ?? body?.edited_message) as Record<string, unknown> | undefined
  if (!message) return new Response('OK', { status: 200 })

  const chatId = (message.chat as Record<string, unknown>)?.id as number
  const text = ((message.text as string) ?? '').trim()

  if (!text.startsWith('/start')) return new Response('OK', { status: 200 })

  const parts = text.split(' ')
  const phoneNumber = parts[1]?.trim()

  if (!phoneNumber) {
    await sendMessage(chatId, '👋 Welcome to *HungriAR*!\n\nPlease use the app to link your Telegram account.')
    return new Response('OK', { status: 200 })
  }

  // Basic phone sanity check
  if (phoneNumber.length > 20 || !/^[\d+\-\s()]+$/.test(phoneNumber)) {
    await sendMessage(chatId, '❌ Invalid phone number format.')
    return new Response('OK', { status: 200 })
  }

  // Check if any restaurants are registered under this phone
  const { data: links, error: linksError } = await supabase
    .from('phone_restaurant_links')
    .select('id')
    .eq('phone_number', phoneNumber)
    .limit(1)

  if (linksError || !links?.length) {
    await sendMessage(chatId, '❌ This phone number is not registered with HungriAR.\n\nContact your HungriAR account manager if you think this is a mistake.')
    return new Response('OK', { status: 200 })
  }

  const { error } = await supabase
    .from('telegram_accounts')
    .upsert(
      { phone_number: phoneNumber, chat_id: chatId, linked_at: new Date().toISOString() },
      { onConflict: 'phone_number' },
    )

  if (error) {
    console.error('telegram_accounts upsert error', error)
    await sendMessage(chatId, '❌ Something went wrong. Please try again.')
  } else {
    await sendMessage(
      chatId,
      '✅ *Telegram linked successfully!*\n\nYou will now receive login OTPs here every time you sign in to HungriAR.\n\n_You only need to do this once._',
    )
  }

  return new Response('OK', { status: 200 })
})
