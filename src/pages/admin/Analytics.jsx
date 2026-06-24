import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../utils/formatters'

export default function Analytics() {
  const { restaurant } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data: result, error: rpcError } = await supabase.rpc('get_restaurant_analytics', {
        p_restaurant_id: restaurant.id,
      })

      if (!cancelled) {
        if (rpcError) setError(rpcError.message)
        else setData(result)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [restaurant.id])

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return <p className="text-gray-500">Failed to load analytics.</p>
  }

  const maxDaily = Math.max(1, ...data.daily_orders.map((day) => day.count))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{data.total_orders}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Total Revenue (completed orders)</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{formatCurrency(data.total_revenue, restaurant?.currency)}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Orders - Last 7 Days</h2>
        <div className="flex items-end gap-2" style={{ height: '160px' }}>
          {data.daily_orders.map((day) => (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-primary-400"
                style={{ height: `${(day.count / maxDaily) * 120}px`, minHeight: day.count > 0 ? '4px' : '0px' }}
              />
              <span className="text-xs font-medium text-gray-700">{day.count}</span>
              <span className="text-[10px] text-gray-400">{formatDate(day.date).slice(0, 6)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Selling Items</h2>
        {data.top_items.length === 0 ? (
          <p className="text-gray-500">No completed orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1">Item</th>
                <th className="py-1 text-right">Qty Sold</th>
                <th className="py-1 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.top_items.map((item) => (
                <tr key={item.name}>
                  <td className="py-1.5 text-gray-700">{item.name}</td>
                  <td className="py-1.5 text-right text-gray-700">{item.total_quantity}</td>
                  <td className="py-1.5 text-right font-medium text-gray-900">
                    {formatCurrency(item.total_revenue, restaurant?.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
