/**
 * Builds the customer-facing QR URL for a table.
 * Format: https://yourapp.com/r/:restaurantSlug?token=<signed_token>
 */
export function buildQrUrl(restaurantSlug, token) {
  return `${window.location.origin}/r/${restaurantSlug}?token=${encodeURIComponent(token)}`
}

/**
 * Finds a <canvas> element rendered by qrcode.react and triggers a PNG
 * download of its current contents.
 */
export function downloadQrCanvas(canvasId, fileName) {
  const canvas = document.getElementById(canvasId)
  if (!canvas || canvas.tagName !== 'CANVAS') {
    throw new Error('QR code canvas not found')
  }

  const dataUrl = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Copies hardcoded/sanitised plain text to the clipboard. Never pass raw
 * HTML or DOM content here (pastejacking protection).
 */
export async function copyToClipboard(text) {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    throw new Error('Clipboard access is not available in this browser')
  }
  await navigator.clipboard.writeText(String(text))
}
