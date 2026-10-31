import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { pageCache } from '../utils/pageCache'

const AWAITING = 'awaiting_approval'

/**
 * Live orders for a restaurant (or one order by id).
 *
 * QR orders on a table nobody has opened arrive as 'awaiting_approval'. Those
 * are kept OUT of `orders` — so no kitchen list, table map, or bill ever shows
 * them — and returned separately as `awaiting` for the approval popup.
 * onInsert (sound, toast, auto-KOT) fires when an order actually reaches the
 * kitchen: on insert for normal orders, and at the moment of approval for
 * waiting ones. onAwaiting fires when a new order starts waiting.
 *
 * includeAwaiting keeps waiting orders in `orders`; the customer's own order
 * page needs that so it can show "waiting for staff to confirm".
 */
export function useRealtimeOrders({ restaurantId, orderId, onInsert, onAwaiting, includeAwaiting = false, pollInterval = 5000 } = {}) {
  const cacheKey = `orders-${restaurantId || orderId}`
  const cached   = pageCache.get(cacheKey)

  const [orders, setOrders] = useState(() => cached || [])
  const [awaiting, setAwaiting] = useState([])
  const [loading, setLoading] = useState(!cached)
  const onInsertRef = useRef(onInsert)
  onInsertRef.current = onInsert
  const onAwaitingRef = useRef(onAwaiting)
  onAwaitingRef.current = onAwaiting
  // Full rows of orders currently waiting, so approval can hand the kitchen
  // the complete order (items, table number) rather than the bare row a
  // realtime UPDATE carries.
  const awaitingByIdRef = useRef(new Map())

  // Track optimistic patches so polls don't overwrite them before DB confirms
  const pendingPatchesRef = useRef({})

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    if (!restaurantId && !orderId) {
      setOrders([])
      setLoading(false)
      return
    }
    if (!silent) setLoading((prev) => prev && !pageCache.has(cacheKey))

    let query = supabase
      .from('orders')
      .select('*, order_items(*), tables(table_number)')
      .order('order_time', { ascending: false })

    if (restaurantId) query = query.eq('restaurant_id', restaurantId)
    if (orderId) query = query.eq('id', orderId)

    const { data, error } = await query
    if (!error) {
      const now = Date.now()
      // Protect pending optimistic patches from being overwritten by stale poll data
      const merged = (data || []).map((o) => {
        const p = pendingPatchesRef.current[o.id]
        if (p && now - p._at < 5000) return { ...o, ...p }
        if (p) delete pendingPatchesRef.current[o.id]
        return o
      })
      const waiting = merged.filter((o) => o.status === AWAITING)
      awaitingByIdRef.current = new Map(waiting.map((o) => [o.id, o]))
      const visible = includeAwaiting ? merged : merged.filter((o) => o.status !== AWAITING)
      pageCache.set(cacheKey, visible)
      setOrders(visible)
      setAwaiting(waiting)
    }
    setLoading(false)
  }, [restaurantId, orderId, cacheKey, includeAwaiting])

  // Optimistic patch — instant UI feedback before DB confirms.
  // Also writes to pageCache so other pages (e.g. Billing) see the update immediately on mount.
  const patchOrder = useCallback((id, patch) => {
    pendingPatchesRef.current[id] = { ...(pendingPatchesRef.current[id] || {}), ...patch, _at: Date.now() }
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
      pageCache.set(cacheKey, next)
      return next
    })
  }, [cacheKey])

  // Initial load
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!restaurantId && !orderId) return

    const filter = restaurantId ? `restaurant_id=eq.${restaurantId}` : `id=eq.${orderId}`
    // Stable name scoped to the entity — avoids duplicate subscriptions on re-render
    const channelName = `orders-${restaurantId || orderId}`

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, (payload) => {
        if (payload.eventType === 'INSERT') {
          if (payload.new.status === AWAITING) onAwaitingRef.current?.(payload.new)
          else onInsertRef.current?.(payload.new)
          fetchOrders({ silent: true })
          // Delayed refetch ensures order_items are committed before we reload
          setTimeout(() => fetchOrders({ silent: true }), 400)
        } else if (payload.eventType === 'UPDATE') {
          const wasWaiting = awaitingByIdRef.current.get(payload.new.id)
          if (wasWaiting && payload.new.status !== AWAITING) {
            // Approved (or rejected) — possibly from another device. Only an
            // approval reaches the kitchen, and that is the moment to ring the
            // bell and auto-print the KOT, not when the order first arrived.
            awaitingByIdRef.current.delete(payload.new.id)
            if (payload.new.status !== 'cancelled') onInsertRef.current?.({ ...wasWaiting, ...payload.new })
            fetchOrders({ silent: true })
            return
          }
          // DB confirmed — clear our optimistic patch so future polls use DB data
          delete pendingPatchesRef.current[payload.new.id]
          patchOrder(payload.new.id, payload.new)
        } else if (payload.eventType === 'DELETE') {
          setOrders((prev) => prev.filter((o) => o.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, orderId, fetchOrders, patchOrder])

  // Polling fallback — catches any INSERT events Realtime misses.
  // Skipped while offline: repeatedly firing doomed fetches just churns the
  // main thread / console. The 'online' listener below resyncs on reconnect.
  useEffect(() => {
    if (!restaurantId && !orderId) return
    const timer = setInterval(() => { if (navigator.onLine) fetchOrders({ silent: true }) }, pollInterval)
    return () => clearInterval(timer)
  }, [restaurantId, orderId, fetchOrders, pollInterval])

  // Resync immediately when connectivity returns
  useEffect(() => {
    const onOnline = () => fetchOrders({ silent: true })
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [fetchOrders])

  // Refetch when the admin switches back to this browser tab
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchOrders({ silent: true }) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchOrders])

  return { orders, awaiting, loading, refetch: fetchOrders, patchOrder }
}
