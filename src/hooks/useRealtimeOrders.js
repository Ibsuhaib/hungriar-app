import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Live-updating list of orders (with their order_items and table number)
 * for either:
 *  - an entire restaurant (admin dashboard / orders page): pass restaurantId
 *  - a single order (customer order status page): pass orderId
 *
 * Subscribes to Supabase Realtime postgres_changes on `orders` and
 * `order_items` and refetches whenever something relevant changes.
 * `onInsert` fires for brand new orders (used for sound/toast alerts).
 */
export function useRealtimeOrders({ restaurantId, orderId, onInsert } = {}) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const onInsertRef = useRef(onInsert)
  onInsertRef.current = onInsert

  const fetchOrders = useCallback(async () => {
    if (!restaurantId && !orderId) {
      setOrders([])
      setLoading(false)
      return
    }

    setLoading(true)

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

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    if (!restaurantId && !orderId) return

    const filter = restaurantId ? `restaurant_id=eq.${restaurantId}` : `id=eq.${orderId}`
    const channelName = `orders-${restaurantId || orderId}`

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, (payload) => {
        if (payload.eventType === 'INSERT') {
          onInsertRef.current?.(payload.new)
        }
        fetchOrders()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchOrders()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, orderId, fetchOrders])

  return { orders, loading, refetch: fetchOrders }
}
