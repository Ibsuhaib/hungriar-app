import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtimeOrders({ restaurantId, orderId, onInsert, pollInterval = 5000 } = {}) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const onInsertRef = useRef(onInsert)
  onInsertRef.current = onInsert

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    if (!restaurantId && !orderId) {
      setOrders([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)

    let query = supabase
      .from('orders')
      .select('*, order_items(*), tables(table_number)')
      .order('order_time', { ascending: false })

    if (restaurantId) query = query.eq('restaurant_id', restaurantId)
    if (orderId) query = query.eq('id', orderId)

    const { data, error } = await query
    if (!error) setOrders(data || [])
    setLoading(false)
  }, [restaurantId, orderId])

  // Optimistic patch — instant UI feedback before DB confirms
  const patchOrder = useCallback((id, patch) => {
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
