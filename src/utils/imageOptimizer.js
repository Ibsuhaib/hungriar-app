const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

/**
 * Converts a Supabase Storage URL from the raw object path to the image
 * transform endpoint, which resizes and compresses on-the-fly.
 *
 * Only transforms URLs that belong to this project's Supabase bucket.
 * External URLs (e.g. CDN, R2) are returned unchanged.
 *
 * @param {string|null|undefined} url  Original image URL
 * @param {object} opts
 * @param {number} [opts.width=800]    Target width in px
 * @param {number} [opts.quality=80]   JPEG/WebP quality (1–100)
 * @returns {string|null}
 */
export function getOptimizedImageUrl(url, { width = 800, quality = 80 } = {}) {
  if (!url || !SUPABASE_URL) return url ?? null

  const OBJECT_PREFIX = '/storage/v1/object/public/'
  const RENDER_PREFIX = '/storage/v1/render/image/public/'

  if (!url.startsWith(SUPABASE_URL) || !url.includes(OBJECT_PREFIX)) return url

  const path = url.slice(url.indexOf(OBJECT_PREFIX) + OBJECT_PREFIX.length)
  return `${SUPABASE_URL}${RENDER_PREFIX}${path}?width=${width}&quality=${quality}`
}
