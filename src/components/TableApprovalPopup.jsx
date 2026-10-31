import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Users, Check, X, Clock, BellRing } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatTime } from '../utils/formatters'

// Must match the interval in expire_stale_approvals() (migration 40).
const APPROVAL_WINDOW_MIN = 15

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t)
      osc.stop(t + 0.35)
    })
    navigator.vibrate?.([200, 100, 200])
  } catch { /* audio unavailable — the popup itself is still shown */ }
}

/**
 * Orders waiting for approval, kept live with its own realtime channel and a
 * short poll — independent of whatever page is open, so the popup still
 * appears while the owner is on Billing or Menu.
 */
function useAwaitingApprovals(restaurantId) {
  const [awaiting, setAwaiting] = useState([])

  const fetchAwaiting = useCallback(async () => {
    if (!restaurantId) return
    // Cancel anything nobody answered in time first, so a forgotten request
    // from hours ago (or yesterday) never pops up.
    await supabase.rpc('expire_stale_approvals', { p_restaurant_id: restaurantId })
    const cutoff = new Date(Date.now() - APPROVAL_WINDOW_MIN * 60_000).toISOString()
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), tables(table_number)')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'awaiting_approval')
      .gte('order_time', cutoff)
      .order('order_time', { ascending: true })
    if (!error) setAwaiting(data || [])
  }, [restaurantId])

  useEffect(() => { setAwaiting([]); fetchAwaiting() }, [fetchAwaiting])

  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel(`table-approval-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          fetchAwaiting()
          // order_items are committed just after the order row
          setTimeout(fetchAwaiting, 500)
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId, fetchAwaiting])

  // A missed realtime event must never leave guests waiting unnoticed.
  useEffect(() => {
    if (!restaurantId) return
    const timer = setInterval(() => { if (navigator.onLine) fetchAwaiting() }, 5000)
    const onVisible = () => { if (!document.hidden) fetchAwaiting() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [restaurantId, fetchAwaiting])

  return { awaiting, refresh: fetchAwaiting }
}

/**
 * Popup asking staff to confirm guests are really seated before a table's
 * first QR order goes to the kitchen.
 *
 * Shown on both the waiter app and the owner dashboard. Whoever taps first
 * decides: the order's status changes, realtime pushes that to the other
 * device, its `awaiting` list empties, and its popup closes by itself. If two
 * people tap at the same instant, the second gets "already handled" rather
 * than an error.
 */
export default function TableApprovalPopup({ restaurantId, currency = '₹' }) {
  const { awaiting, refresh } = useAwaitingApprovals(restaurantId)
  const [minimized, setMinimized] = useState(false)
  const [busy, setBusy] = useState(null) // 'approve' | 'reject'
  const [confirmReject, setConfirmReject] = useState(false)
  const lastCount = useRef(0)

  // One card per table: everything waiting on the same table is approved or
  // rejected together, since it is one group of guests.
  const tables = useMemo(() => {
    const byTable = new Map()
    for (const o of awaiting) {
      if (!byTable.has(o.table_id)) byTable.set(o.table_id, [])
      byTable.get(o.table_id).push(o)
    }
    return [...byTable.entries()]
      .map(([tableId, orders]) => ({
        tableId,
        tableNumber: orders[0].tables?.table_number ?? '?',
        orders,
        firstAt: orders.reduce((min, o) => (o.order_time < min ? o.order_time : min), orders[0].order_time),
        total: orders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      }))
      .sort((a, b) => new Date(a.firstAt) - new Date(b.firstAt))
  }, [awaiting])

  // A new table arriving re-opens the popup and chimes, even if it was minimised.
  useEffect(() => {
    if (tables.length > lastCount.current) {
      setMinimized(false)
      chime()
    }
    lastCount.current = tables.length
  }, [tables.length])

  const current = tables[0]
  useEffect(() => { setConfirmReject(false) }, [current?.tableId])

  if (!current) return null

  const act = async (kind) => {
    setBusy(kind)
    try {
      const { data, error } = await supabase.rpc(
        kind === 'approve' ? 'approve_table' : 'reject_table_orders',
        { p_table_id: current.tableId },
      )
      if (error) throw error
      if (!data) {
        toast('Already handled by someone else', { icon: 'ℹ️' })
      } else if (kind === 'approve') {
        toast.success(`Table ${current.tableNumber} approved — sent to kitchen`)
      } else {
        toast.success(`Table ${current.tableNumber} order rejected`)
      }
    } catch (err) {
      toast.error(err.message || 'Could not update. Check your connection and try again.')
    } finally {
      setBusy(null)
      setConfirmReject(false)
      refresh()
    }
  }

  const items = current.orders.flatMap((o) => (o.order_items || []).filter((i) => !i.cancelled))

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-safe-4 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 whitespace-nowrap rounded-full bg-amber-500 px-5 py-3 text-sm font-bold text-white shadow-2xl animate-pulse"
      >
        <BellRing className="w-4 h-4" />
        {tables.length} table{tables.length > 1 ? 's' : ''} waiting for approval
      </button>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        key="approval-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        <motion.div
          key={current.tableId}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p id="approval-title" className="text-lg font-bold leading-tight">
                  New guests at Table {current.tableNumber}?
                </p>
                <p className="text-xs text-white/85 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Ordered at {formatTime(current.firstAt)}
                  {tables.length > 1 && <span className="ml-1">· {tables.length - 1} more waiting</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              Check that someone is sitting at this table. If it&apos;s empty, the order
              may have come from a photo of the QR code.
            </p>

            <ul className="mt-3 max-h-40 overflow-y-auto rounded-2xl bg-gray-50 px-4 py-3 space-y-1.5 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="text-gray-800"><span className="font-semibold">{i.quantity}×</span> {i.item_name}</span>
                  <span className="text-gray-500 tabular-nums">{formatCurrency(i.quantity * i.unit_price, currency)}</span>
                </li>
              ))}
              {items.length === 0 && <li className="text-gray-400">Loading items…</li>}
            </ul>
            <p className="mt-2 text-right text-sm font-bold text-gray-900">
              Total {formatCurrency(current.total, currency)}
            </p>
          </div>

          <div className="px-5 pb-safe-5 pt-1 space-y-2">
            {confirmReject ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setConfirmReject(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act('reject')}
                  className="flex-[2] py-3.5 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
                >
                  {busy === 'reject' ? 'Rejecting…' : 'Yes, table is empty'}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setConfirmReject(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-red-50 text-red-700 border border-red-100 text-sm font-bold disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act('approve')}
                  className="flex-[2] flex items-center justify-center gap-1.5 py-3.5 rounded-2xl bg-green-600 text-white text-sm font-bold shadow-lg disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="w-full py-2 text-xs font-semibold text-gray-400"
            >
              Decide later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
