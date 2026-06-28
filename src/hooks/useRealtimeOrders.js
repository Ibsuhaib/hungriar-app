import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { pageCache } from '../utils/pageCache'

export function useRealtimeOrders({ restaurantId, orderId, onInsert, pollInterval = 5000 } = {}) {
  const cacheKey = `orders-${restaurantId || orderId}`
  const cached   = pageCache.get(cacheKey)

  const [orders, setOrders] = useState(() => cached || [])
  const [loading, setLoading] = useState(!cached)
  const onInsertRef = useRef(onInsert)
  onInsertRef.current = onInsert

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
      pageCache.set(cacheKey, merged)
      setOrders(merged)
    }
    setLoading(false)
  }, [restaurantId, orderId, cacheKey])

  // Optimistic patch — instant UI feedback before DB confirms
  const patchOrder = useCallback((id, patch) => {
    pendingPatchesRef.current[id] = { ...(pendingPatchesRef.current[id] || {}), ...patch, _at: Date.now() }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }, [])

  // Initial load
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!restaurantId && !orderId) return

    const filter = restaurantId ? `restaurant_id=eq.${restaurantId}` : `id=eq.${orderId}`
    // Unique name avoids conflicts when navigating between pages that use this hook
    const channelName = `orders-${restaurantId || orderId}-${Date.now()}`

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, (payload) => {
        if (payload.eventType === 'INSERT') {
          onInsertRef.current?.(payload.new)
          fetchOrders({ silent: true })
          // Delayed refetch ensures order_items are committed before we reload
          setTimeout(() => fetchOrders({ silent: true }), 400)
        } else if (payload.eventType === 'UPDATE') {
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

  // Polling fallback — catches any INSERT events Realtime misses
  useEffect(() => {
    if (!restaurantId && !orderId) return
    const timer = setInterval(() => fetchOrders({ silent: true }), pollInterval)
    return () => clearInterval(timer)
  }, [restaurantId, orderId, fetchOrders, pollInterval])

  // Refetch when the admin switches back to this browser tab
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchOrders({ silent: true }) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchOrders])

  return { orders, loading, refetch: fetchOrders, patchOrder }
}
