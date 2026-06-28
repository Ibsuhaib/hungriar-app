const DB_NAME = 'hungriar_offline'
const DB_VERSION = 2
const STORE      = 'order_queue'
const BILL_STORE = 'bill_queue'

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
