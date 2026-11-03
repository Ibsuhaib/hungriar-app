import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Every live order on the customer's table for the current sitting — from any
 * phone at the table, and orders the waiter took in person.
 *
 * Goes through get_table_orders(), which only answers for the table's current
 * session, so a phone needs to have scanned this sitting's QR to see anything.
 * Returns null orders when the session has ended (bill settled / QR reset).
 */
export function useTableOrders(session, { pollInterval = 5000 } = {}) {
  const [orders, setOrders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)

  const tableId = session?.tableId
  const sessionId = session?.sessionId

  const refresh = useCallback(async () => {
    if (!tableId || !sessionId) return
    const { data, error } = await supabase.rpc('get_table_orders', {
      p_table_id: tableId,
      p_session_id: sessionId,
    })
    if (error) return // keep the last good list rather than blanking it
    if (data === null) {
      setSessionEnded(true)
      setOrders([])
    } else {
      setSessionEnded(false)
      setOrders(Array.isArray(data.orders) ? data.orders : [])
    }
    setLoaded(true)
  }, [tableId, sessionId])

  useEffect(() => {
    if (!tableId || !sessionId) return
    refresh()
    const timer = setInterval(() => { if (navigator.onLine && !document.hidden) refresh() }, pollInterval)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [tableId, sessionId, pollInterval, refresh])

  const total = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

  return { orders, total, loaded, sessionEnded, refresh }
}
