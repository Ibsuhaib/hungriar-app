const DB_NAME = 'hungriar_offline'
const DB_VERSION = 2
const STORE      = 'order_queue'
const BILL_STORE = 'bill_queue'

/**
 * True when a failed request looks like a connectivity problem rather than a
 * server-side rejection. `navigator.onLine` is unreliable — it reports `true`
 * on any LAN/WiFi even with no real internet — so callers use this to decide
 * whether to fall back to the offline queue. Postgres/permission errors (which
 * carry a real message like "not authorized") are NOT treated as network errors.
 */
export function isNetworkError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  // Per the Fetch spec, a failed network request rejects with a TypeError in
  // EVERY browser — only the message wording differs. Matching the type is the
  // reliable, browser-agnostic signal; the message checks are a backup for when
  // supabase-js hands back a plain error object (no TypeError instance).
  if (err?.name === 'TypeError') return true
  const msg = (err?.message || String(err ?? '')).toLowerCase()
  return (
    msg.includes('failed to fetch') ||                 // Chrome/Edge
    msg.includes('load failed') ||                     // Safari
    msg.includes('networkerror') ||                    // Firefox
    msg.includes('network request failed') ||
    msg.includes('network connection') ||              // Safari: "The network connection was lost."
    msg.includes('connection was lost') ||             // Safari
    msg.includes('connection appears to be offline') ||// Safari
    msg.includes('the internet connection')            // Safari
  )
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(BILL_STORE))
        db.createObjectStore(BILL_STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueOrder(order) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add({ ...order, queuedAt: new Date().toISOString() })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getQueuedOrders() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function removeQueuedOrder(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

// ─── Bill queue ───────────────────────────────────────────────────────────────

export async function enqueueBill(bill) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILL_STORE, 'readwrite')
    const req = tx.objectStore(BILL_STORE).add({ ...bill, queuedAt: new Date().toISOString() })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getQueuedBills() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILL_STORE, 'readonly')
    const req = tx.objectStore(BILL_STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

export async function removeQueuedBill(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILL_STORE, 'readwrite')
    tx.objectStore(BILL_STORE).delete(id)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}
