/**
 * WhatsApp sending via Gupshup's Access API.
 *
 * sendWhatsAppText() hits the plain-message endpoint — only deliverable to a
 * phone that has an open session with the source number (it messaged first,
 * or in sandbox mode sent "proxy <app_name>"). Fine for testing your own
 * phone; NOT sufficient for real owners, who never message the bot first.
 *
 * sendWhatsAppTemplate() hits the template endpoint, which is how you reach
 * someone with no open session — this is what production OTP/report sends
 * must use once templates are approved and the number is verified (not
 * sandbox). Swapping a caller from Text to Template is a one-line change.
 */

const GUPSHUP_API_KEY = Deno.env.get('GUPSHUP_API_KEY')
const GUPSHUP_SOURCE_NUMBER = Deno.env.get('GUPSHUP_SOURCE_NUMBER')
const GUPSHUP_APP_NAME = Deno.env.get('GUPSHUP_APP_NAME')

export interface WhatsAppResult {
  ok: boolean
  error?: string
}

/** "9876543210" / "+91 98765 43210" / "919876543210" → "919876543210" (Gupshup's expected format). */
function normalizeIndianNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

function checkConfigured(): string | null {
  if (!GUPSHUP_API_KEY || !GUPSHUP_SOURCE_NUMBER || !GUPSHUP_APP_NAME) {
    console.error('Gupshup WhatsApp is not configured (GUPSHUP_API_KEY / GUPSHUP_SOURCE_NUMBER / GUPSHUP_APP_NAME)')
    return 'not_configured'
  }
  return null
}

export async function sendWhatsAppText(toPhone: string, text: string): Promise<WhatsAppResult> {
  const configError = checkConfigured()
  if (configError) return { ok: false, error: configError }

  const destination = normalizeIndianNumber(toPhone)
  if (!destination) return { ok: false, error: 'invalid_phone' }

  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: GUPSHUP_SOURCE_NUMBER!,
    destination,
    message: JSON.stringify({ type: 'text', text }),
    'src.name': GUPSHUP_APP_NAME!,
  })

  const res = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: GUPSHUP_API_KEY!,
    },
    body: params.toString(),
  })

  if (!res.ok) {
    console.error('Gupshup text send failed', res.status, await res.text().catch(() => ''))
    return { ok: false, error: 'send_failed' }
  }
  return { ok: true }
}

/** params are positional {{1}}, {{2}}, … values for the approved template — no newlines allowed in any of them. */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateId: string,
  params: string[],
): Promise<WhatsAppResult> {
  const configError = checkConfigured()
  if (configError) return { ok: false, error: configError }

  const destination = normalizeIndianNumber(toPhone)
  if (!destination) return { ok: false, error: 'invalid_phone' }

  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: GUPSHUP_SOURCE_NUMBER!,
    destination,
    'src.name': GUPSHUP_APP_NAME!,
    template: JSON.stringify({ id: templateId, params }),
  })

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: GUPSHUP_API_KEY!,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    console.error('Gupshup template send failed', res.status, await res.text().catch(() => ''))
    return { ok: false, error: 'send_failed' }
  }
  return { ok: true }
}
