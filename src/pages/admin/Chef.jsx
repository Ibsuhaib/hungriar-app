import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Lock, Bell, BellOff, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRealtimeOrders } from '../../hooks/useRealtimeOrders'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import OrderCard from '../../components/OrderCard'
import { usePushNotifications, showNotification } from '../../hooks/usePushNotifications'

function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    osc.onended = () => ctx.close()
  } catch { /* audio unavailable */ }
}

function PinEntry({ onSuccess }) {
  const { restaurant } = useAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pin || checking) return
    setChecking(true)
    setError('')

    const { data } = await supabase
      .from('restaurants')
      .select('chef_pin')
      .eq('id', restaurant.id)
      .single()

    if (!data?.chef_pin) {
      // No PIN set — allow any entry (admin hasn't configured it yet)
      onSuccess()
    } else if (data.chef_pin === pin) {
      onSuccess()
    } else {
      setError('Incorrect PIN. Try again.')
    }
    setChecking(false)
    setPin('')
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 rounded-3xl p-8 w-full max-w-xs shadow-2xl"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center mb-3 shadow-lg">
            <ChefHat className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Chef View</h1>
          <p className="text-sm text-gray-400 mt-1 text-center">Enter your PIN to view orders</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError('') }}
            placeholder="Enter PIN"
            maxLength={10}
            autoFocus
            className="w-full text-center text-2xl font-bold tracking-[0.4em] bg-gray-700 border-2 border-gray-600 text-white rounded-2xl px-4 py-3.5 placeholder-gray-500 focus:border-primary-500 focus:outline-none transition-colors"
          />

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!pin || checking}
            className="w-full py-3.5 rounded-2xl font-bold text-white bg-gradient-to-r from-primary-500 to-primary-600 disabled:opacity-40 transition-opacity shadow-lg"
          >
            {checking ? 'Checking…' : 'Enter'}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          PIN is set by the restaurant admin in Settings
        </p>
      </motion.div>
    </div>
  )
}

function ChefOrdersView({ onLock }) {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()
  const { status: notifStatus, isSupported: notifSupported, enable: enableNotif } = usePushNotifications({ restaurantId: restaurant?.id })

  const handleNewOrder = useCallback((order) => {
    playNotificationSound()
    toast.success('New order!', { icon: '🔔', id: `order-${order.id}` })
    showNotification('New Order!', `Table ${order.tables?.table_number ?? '?'} placed an order`)
  }, [])

  const { orders, loading, patchOrder } = useRealtimeOrders({
    restaurantId: restaurant?.id,
    onInsert: handleNewOrder,
    pollInterval: 3000,
  })

  const pendingOrders = useMemo(
    () => orders
      .filter((o) => o.status !== 'completed')
      .sort((a, b) => new Date(a.order_time) - new Date(b.order_time)),
    [orders],
  )

  const handleStatusChange = async (orderId, newStatus) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const prevStatus = orders.find((o) => o.id === orderId)?.status
    patchOrder(orderId, { status: newStatus })
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) {
      toast.error('Failed to update order')
      if (prevStatus) patchOrder(orderId, { status: prevStatus })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <ChefHat className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">Chef View</p>
              <p className="text-xs text-gray-400 leading-none mt-0.5">{restaurant?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Active orders badge */}
            {pendingOrders.length > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1">
                <Clock className="w-3 h-3" />
                {pendingOrders.length}
              </span>
            )}

            {/* Notification toggle */}
            {notifSupported && notifStatus !== 'subscribed' && notifStatus !== 'denied' && (
              <button
                type="button"
                onClick={enableNotif}
                className="flex items-center gap-1 text-xs text-primary-600 bg-primary-50 border border-primary-100 rounded-full px-2.5 py-1 font-medium"
              >
                <Bell className="w-3 h-3" />
                Notify
              </button>
            )}
            {notifSupported && notifStatus === 'subscribed' && (
              <Bell className="w-4 h-4 text-green-500" />
            )}

            {/* Lock button */}
            <button
              type="button"
              onClick={onLock}
              className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1.5 font-medium hover:bg-gray-200 transition-colors"
            >
              <Lock className="w-3 h-3" />
              Lock
            </button>
          </div>
        </div>
      </header>

      {/* Orders */}
      <main className="max-w-6xl mx-auto px-4 py-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-2xl" />)}
          </div>
        ) : pendingOrders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <CheckCircle2 className="w-12 h-12 text-green-200 mb-3" />
            <p className="font-semibold text-gray-500">All caught up!</p>
            <p className="text-sm text-gray-400 mt-1">New orders will appear here automatically.</p>
          </motion.div>
        ) : (
          <AnimatePresence>
            <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  currency={restaurant?.currency}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}

export default function Chef() {
  const { restaurant } = useAuth()
  const sessionKey = `hungriar_chef_auth_${restaurant?.id}`
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(sessionKey) === '1') {
      setAuthenticated(true)
    }
  }, [sessionKey])

  const handleSuccess = () => {
    sessionStorage.setItem(sessionKey, '1')
    setAuthenticated(true)
  }

  const handleLock = () => {
    sessionStorage.removeItem(sessionKey)
    setAuthenticated(false)
  }

  if (!authenticated) return <PinEntry onSuccess={handleSuccess} />
  return <ChefOrdersView onLock={handleLock} />
}
