import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, checkRateLimit } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME')
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL')

const ALLOWED_FOLDERS = new Set(['images', 'models', 'qr-codes'])
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'model/gltf-binary',
  'model/vnd.usdz+zip',
  'application/octet-stream',
])
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'glb', 'usdz'])

const enc = new TextEncoder()

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

async function sha256Hex(data: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

async function createPresignedPutUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucket: string,
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = now.toISOString().replace(/[:\-]/g, '').replace(/\.\d{3}Z$/, 'Z')

  const region = 'auto'
  const service = 's3'
  const host = `${accountId}.r2.cloudflarestorage.com`
  const credentialScope = `${dateStr}/${region}/${service}/aws4_request`
  const credential = `${accessKeyId}/${credentialScope}`

  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': timeStr,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  }

  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const reqHash = await sha256Hex(canonicalRequest)
  const stringToSign = ['AWS4-HMAC-SHA256', timeStr, credentialScope, reqHash].join('\n')

  const signingKey = await hmac(
    await hmac(
      await hmac(
        await hmac(enc.encode(`AWS4${secretAccessKey}`), dateStr),
        region,
      ),
      service,
    ),
    'aws4_request',
  )

  const sigKey = await crypto.subtle.importKey(
    'raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = hex(await crypto.subtle.sign('HMAC', sigKey, enc.encode(stringToSign)))

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf('.')
  const rawExt = lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : ''
  const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 10)
  if (!ALLOWED_EXTENSIONS.has(ext)) return 'file'
  return `file.${ext}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
      return jsonResponse({ error: 'Cloudflare R2 is not configured on the server' }, 500)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt)
    if (userError || !userData?.user) return jsonResponse({ error: 'Invalid session' }, 401)
    const userId = userData.user.id

    const rateLimit = await checkRateLimit(supabaseAdmin, userId, 'admin', 120)
    if (!rateLimit.allowed) {
      return jsonResponse({ error: 'Too many requests' }, 429, { 'Retry-After': String(rateLimit.retryAfter) })
    }

    const body = await req.json().catch(() => null)
    if (
      !body ||
      typeof body.restaurantId !== 'string' ||
      typeof body.folder !== 'string' ||
      typeof body.fileName !== 'string' ||
      typeof body.fileType !== 'string'
    ) {
      return jsonResponse({ error: 'restaurantId, folder, fileName and fileType are required' }, 400)
    }

    const { restaurantId, folder, fileName, fileType } = body

    if (!ALLOWED_FOLDERS.has(folder)) return jsonResponse({ error: 'Invalid folder' }, 400)
    if (!ALLOWED_TYPES.has(fileType)) return jsonResponse({ error: 'Unsupported file type' }, 400)

    const { data: roleRow } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    const isSuperAdmin = roleRow?.role === 'super_admin'

    if (!isSuperAdmin) {
      const { data: adminRow } = await supabaseAdmin
        .from('restaurant_admins')
        .select('id')
        .eq('user_id', userId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle()

      if (!adminRow) return jsonResponse({ error: 'Not authorized for this restaurant' }, 403)
    }

    const key = `${restaurantId}/${folder}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`

    const uploadUrl = await createPresignedPutUrl(
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      key,
      fileType,
    )

    const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`

    return jsonResponse({ uploadUrl, publicUrl, key })
  } catch (err) {
    console.error('r2-presign error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
