const KEY = 'hungriar_device_tag'

/**
 * A random, anonymous tag for this phone. Sent with each table order so the
 * shared table view can mark "You" against the orders this phone placed.
 * Not an identity: it is never tied to a name or number, and clearing site
 * data just makes a new one.
 */
export function getDeviceTag() {
  try {
    let tag = localStorage.getItem(KEY)
    if (!tag || !/^[A-Za-z0-9]{1,32}$/.test(tag)) {
      tag = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      localStorage.setItem(KEY, tag)
    }
    return tag
  } catch {
    return null
  }
}
