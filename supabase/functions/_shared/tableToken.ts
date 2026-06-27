/**
 * Signed table-token helpers (HMAC-SHA256 via the Web Crypto API).
 *
 * Token layout (before base64url encoding):
 *   "<restaurantId>:<tableId>:<issuedAtUnixSeconds>:<hexSignature>"
 *
 * The signature covers "<restaurantId>:<tableId>:<issuedAtUnixSeconds>".
 * No `eval`, regex or string-based SQL is used anywhere in this module.
 */

// No TTL — tokens are permanent (QR codes are physical stickers on tables)

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (base64.length % 4)) % 4
  const padded = base64 + '='.repeat(padLength)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export async function signTableToken(restaurantId: string, tableId: string, secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${restaurantId}:${tableId}:${issuedAt}`
  const signature = await hmacSha256Hex(payload, secret)
  return base64UrlEncode(`${payload}:${signature}`)
}

export interface VerifyResult {
  valid: boolean
  restaurantId?: string
  tableId?: string
  issuedAt?: number
  reason?: 'malformed' | 'invalid_signature'
}

export async function verifyTableToken(token: string, secret: string): Promise<VerifyResult> {
  try {
    const decoded = base64UrlDecode(token)
    const parts = decoded.split(':')
    if (parts.length !== 4) return { valid: false, reason: 'malformed' }

    const [restaurantId, tableId, issuedAtRaw, signature] = parts
    if (!restaurantId || !tableId || !signature) return { valid: false, reason: 'malformed' }

    const issuedAt = Number(issuedAtRaw)
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return { valid: false, reason: 'malformed' }

    const payload = `${restaurantId}:${tableId}:${issuedAtRaw}`
    const expectedSignature = await hmacSha256Hex(payload, secret)
    if (!timingSafeEqual(signature, expectedSignature)) {
      return { valid: false, reason: 'invalid_signature' }
    }

    return { valid: true, restaurantId, tableId, issuedAt }
  } catch {
    return { valid: false, reason: 'malformed' }
  }
}
