import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, ShoppingBag, DollarSign, Award } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../utils/formatters'

const CHART_COLORS = ['#e76f51', '#2a9d8f', '#f4a261', '#264653', '#e9c46a', '#a8dadc']

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-gray-900 px-3 py-2.5 shadow-lg">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {currency ? formatCurrency(entry.value, currency) : entry.value}
        </p>
      ))}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className={`card flex items-center gap-4 ${color.bg}`}>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${color.icon} shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className={`text-sm font-medium opacity-70 ${color.text}`}>{label}</p>
        <p className={`text-2xl font-bold leading-none mt-0.5 font-display ${color.text}`}>{value}</p>
      </div>
    </div>
  )
}

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
    return () => { cancelled = true }
  }, [restaurant.id])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card py-12 text-center">
        <p className="text-gray-500">Failed to load analytics data.</p>
      </div>
    )
  }

  const dailyChartData = (data.daily_orders || []).map((d) => ({
    date: formatDate(d.date).slice(0, 6),
    orders: d.count,
  }))

  const topItemsData = (data.top_items || []).slice(0, 5).map((item) => ({
    name: item.name.length > 16 ? item.name.slice(0, 14) + '…' : item.name,
    qty: item.total_quantity,
    revenue: Number(item.total_revenue),
  }))

  const pieData = topItemsData.map((item) => ({ name: item.name, value: item.revenue }))

  const currency = restaurant?.currency || '₹'

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={ShoppingBag}
          label="Total Orders"
          value={data.total_orders}
          color={{ bg: 'bg-primary-50', icon: 'bg-gradient-to-br from-primary-400 to-primary-600', text: 'text-primary-700' }}
        />
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatCurrency(data.total_revenue, currency)}
          color={{ bg: 'bg-secondary-50', icon: 'bg-gradient-to-br from-secondary-400 to-secondary-600', text: 'text-secondary-700' }}
        />
      </div>

      {/* Daily orders line chart */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-4 h-4 text-primary-500" />
          <h2 className="text-base font-bold text-gray-900 font-display">Orders — Last 7 Days</h2>
        </div>
        {dailyChartData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyChartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="#e76f51"
                strokeWidth={2.5}
                dot={{ fill: '#e76f51', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#d3552f' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top items bar chart */}
      {topItemsData.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Award className="w-4 h-4 text-secondary-500" />
            <h2 className="text-base font-bold text-gray-900 font-display">Top Selling Items</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topItemsData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="qty" name="Qty sold" fill="#e76f51" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Revenue pie chart */}
      {pieData.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-bold text-gray-900 font-display">Revenue Distribution</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value, currency)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1">
              {pieData.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-gray-600 truncate flex-1">{item.name}</span>
                  <span className="font-semibold text-gray-900 flex-shrink-0">{formatCurrency(item.value, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detailed top items table */}
      {topItemsData.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 font-display">Item Breakdown</h2>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty Sold</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_items || []).map((item) => (
                <tr key={item.name}>
                  <td className="font-medium text-gray-800">{item.name}</td>
                  <td className="text-right">{item.total_quantity}</td>
                  <td className="text-right font-semibold text-gray-900">{formatCurrency(item.total_revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
