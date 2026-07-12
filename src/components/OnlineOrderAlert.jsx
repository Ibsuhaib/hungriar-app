import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Bike, ShoppingBag, X, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatTime } from '../utils/formatters'

// Soft two-tone chime for a new online order. WebAudio needs a prior user
// gesture on the page — on a staff device that's virtually always true; if
// the browser blocks it we fail silently and the visual popup still shows.
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[[880, 0], [1174.66, 0.18]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + at)
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + at)
      osc.stop(now + at + 0.55)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1500)
  } catch { /* blocked / unsupported — visual popup is enough */ }
}

/**
 * Floating "unread message" alert for incoming online (delivery / takeaway)
 * orders. A pending online order = an unread message: the popup stays until
 * the order is accepted (status leaves 'pending') or the card is collapsed —
 * collapsing shrinks it to a bell with an unread badge, never loses it.
 * Mounted once in the admin layout so it follows the admin on every page.
 */
export default function OnlineOrderAlert({ restaurantId, currency = '₹' }) {
  const [pending, setPending] = useState([])
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const knownIdsRef = useRef(new Set())

  const fetchPending = useCallback(async ({ chimeOnNew = false } = {}) => {
    if (!restaurantId) return
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_type, status, total_amount, customer_name, order_time')
      .eq('restaurant_id', restaurantId)
      .in('order_type', ['delivery', 'takeaway'])
      .eq('status', 'pending')
      .order('order_time', { ascending: false })
      .limit(15)
    if (error || !data) return

    const hasNew = data.some((o) => !knownIdsRef.current.has(o.id))
    if (hasNew) {
      setCollapsed(false) // a new order always re-opens the popup
      if (chimeOnNew) playChime()
    }
    knownIdsRef.current = new Set(data.map((o) => o.id))
    setPending(data)
  }, [restaurantId])

  // Initial load — no chime for orders that were already waiting
  useEffect(() => {
    knownIdsRef.current = new Set()
    setPending([])
    fetchPending()
  }, [fetchPending])

  // Realtime: react instantly to new online orders + status changes.
  // Channel name is distinct from useRealtimeOrders' channels to avoid clashes.
  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel(`online-order-alert-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const row = payload.new || payload.old
          const isOnline = row?.order_type === 'delivery' || row?.order_type === 'takeaway'
          if (!isOnline) return
          // Refetch (cheap, filtered) instead of hand-merging payloads —
          // keeps the list correct for INSERT, UPDATE and DELETE alike.
          fetchPending({ chimeOnNew: payload.eventType === 'INSERT' })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId, fetchPending])

  // Poll fallback for missed realtime events (matches useRealtimeOrders' approach)
  useEffect(() => {
    if (!restaurantId) return
    const timer = setInterval(() => { if (navigator.onLine) fetchPending({ chimeOnNew: true }) }, 20000)
    return () => clearInterval(timer)
  }, [restaurantId, fetchPending])

  if (pending.length === 0) return null

  const goToOrders = () => {
    setCollapsed(true)
    navigate('/admin/orders')
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] no-print">
      <AnimatePresence mode="wait">
        {collapsed ? (
          /* Collapsed: bell with unread badge — like a minimized chat */
          <motion.button
            key="bell"
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setCollapsed(false)}
            aria-label={`${pending.length} new online order${pending.length > 1 ? 's' : ''}`}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-navy-800 border border-primary-500/40 shadow-card-lg hover:bg-navy-700 transition-colors"
          >
            <Bell className="w-6 h-6 text-primary-400" />
            <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white border-2 border-navy-800">
              {pending.length}
            </span>
          </motion.button>
        ) : (
          /* Expanded: unread-message card */
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            className="w-[300px] rounded-2xl bg-navy-800 border border-primary-500/40 shadow-card-lg overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary-500/20 flex-shrink-0">
                <Bell className="w-5 h-5 text-primary-400" />
                <span className="absolute inset-0 rounded-full bg-primary-500/30 animate-ping" />
              </span>
              <p className="flex-1 text-sm font-bold text-white">
                {pending.length === 1 ? 'New online order' : `${pending.length} new online orders`}
              </p>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Minimize"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ul className="max-h-44 overflow-y-auto divide-y divide-white/5">
              {pending.slice(0, 4).map((o) => {
                const Icon = o.order_type === 'delivery' ? Bike : ShoppingBag
                return (
                  <li key={o.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <Icon className="w-4 h-4 text-primary-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {o.order_type === 'delivery' ? 'Delivery' : 'Takeaway'}
                        {o.customer_name ? ` · ${o.customer_name}` : ''}
                      </p>
                      <p className="text-[11px] text-white/50">{formatTime(o.order_time)}</p>
                    </div>
                    <span className="text-xs font-bold text-primary-300 flex-shrink-0">
                      {formatCurrency(o.total_amount, currency)}
                    </span>
                  </li>
                )
              })}
              {pending.length > 4 && (
                <li className="px-4 py-2 text-[11px] text-white/50">+ {pending.length - 4} more…</li>
              )}
            </ul>

            <button
              type="button"
              onClick={goToOrders}
              className="flex w-full min-h-[44px] items-center justify-center gap-1.5 bg-primary-500 text-sm font-bold text-white hover:bg-primary-600 transition-colors"
            >
              View orders <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
