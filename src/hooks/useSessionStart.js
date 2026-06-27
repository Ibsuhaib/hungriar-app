import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Returns the ISO timestamp of when the current "day session" started.
 *
 * A session starts when the previous day was closed via End Day.
 * If the day has never been closed, defaults to midnight of today.
 *
 * After End Day the closed_at of the new record becomes the session start,
 * so all queries filtering >= sessionStart will return 0 results immediately.
 */
export function useSessionStart(restaurantId) {
  const [sessionStart, setSessionStart] = useState(null)

  const refresh = useCallback(async () => {
    if (!restaurantId) return

    const { data } = await supabase
      .from('day_closes')
      .select('closed_at')
      .eq('restaurant_id', restaurantId)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.closed_at) {
      setSessionStart(data.closed_at)
    } else {
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      setSessionStart(midnight.toISOString())
    }
  }, [restaurantId])

  useEffect(() => { refresh() }, [refresh])

  return { sessionStart, refresh }
}
