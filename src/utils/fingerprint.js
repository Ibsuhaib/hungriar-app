import { SHA256 } from 'crypto-js'

const SALT_KEY = 'hungriar_fp_salt'

function getOrCreateSalt() {
  let salt = localStorage.getItem(SALT_KEY)
  if (!salt) {
    salt = crypto.randomUUID()
    localStorage.setItem(SALT_KEY, salt)
  }
  return salt
}

/**
 * Produces a stable 64-character hex SHA-256 hash representing this
 * browser/device. Combined with a per-browser random salt so it cannot be
 * trivially reproduced by another device, and used as a lightweight
 * "device fingerprint" for the admin_sessions replay-protection table.
 */
export function getFingerprintHash() {
  const salt = getOrCreateSalt()
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform || '',
    String(window.screen.width),
    String(window.screen.height),
    String(window.screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    salt,
  ].join('|')

  return SHA256(components).toString()
}
