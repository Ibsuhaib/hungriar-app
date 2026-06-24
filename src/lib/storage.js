import { supabase, invokeEdgeFunction } from './supabase'

const USE_R2 = import.meta.env.VITE_USE_CLOUDFLARE_R2 === 'true'
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL
const BUCKET = 'restaurant-assets'

function getExtension(fileName) {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) return 'bin'
  const ext = fileName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext || 'bin'
}

/**
 * Uploads a file to either Supabase Storage (default) or Cloudflare R2
 * (when VITE_USE_CLOUDFLARE_R2=true), returning the public URL.
 *
 * @param {string} restaurantId
 * @param {'images'|'models'|'qr-codes'} folder
 * @param {File} file
 * @returns {Promise<string>} public URL of the uploaded file
 */
export async function uploadAsset(restaurantId, folder, file) {
  if (!file) throw new Error('No file provided')
  if (!restaurantId) throw new Error('Missing restaurant id')

  return USE_R2 ? uploadToR2(restaurantId, folder, file) : uploadToSupabase(restaurantId, folder, file)
}

async function uploadToSupabase(restaurantId, folder, file) {
  const path = `${restaurantId}/${folder}/${crypto.randomUUID()}.${getExtension(file.name)}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })

  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

async function uploadToR2(restaurantId, folder, file) {
  if (!R2_PUBLIC_URL) {
    throw new Error('VITE_R2_PUBLIC_URL is not configured')
  }

  const presign = await invokeEdgeFunction('r2-presign', {
    restaurantId,
    folder,
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
  })

  const response = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })

  if (!response.ok) {
    throw new Error('Failed to upload file to Cloudflare R2')
  }

  return presign.publicUrl
}

/**
 * Best-effort deletion. For Supabase Storage this removes the object; for
 * R2 (no client-side credentials by design) it is a no-op - old files are
 * simply orphaned and can be cleaned up periodically from the R2 dashboard.
 */
export async function deleteAsset(publicUrl) {
  if (!publicUrl || USE_R2) return

  const marker = `/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return

  const path = decodeURIComponent(publicUrl.slice(idx + marker.length))
  await supabase.storage.from(BUCKET).remove([path])
}

export const isR2Enabled = USE_R2
