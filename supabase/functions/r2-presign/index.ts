import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.490.0?target=deno'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.490.0?target=deno'
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

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf('.')
  const rawExt = lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : ''
  const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 10)
  if (!ALLOWED_EXTENSIONS.has(ext)) return 'file'
  return `file.${ext}`
}

/**
 * POST { restaurantId, folder ('images'|'models'|'qr-codes'), fileName, fileType }
 * Auth: restaurant admin (for that restaurant) or super admin.
 *
 * Returns a short-lived presigned PUT URL for Cloudflare R2 so the browser
 * can upload directly without R2 credentials ever touching the client.
 * Only used when VITE_USE_CLOUDFLARE_R2=true (see src/lib/storage.js).
 */
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

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    })

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`

    return jsonResponse({ uploadUrl, publicUrl, key })
  } catch (err) {
    console.error('r2-presign error', err)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
