import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDateTime } from '../../utils/formatters'

const PAGE_SIZE = 50

export default function History() {
  const { restaurant } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('billing_history')
        .select('*, tables(table_number)')
        .eq('restaurant_id', restaurant.id)
        .order('bill_date', { ascending: false })
        .limit(PAGE_SIZE)

      if (!error && !cancelled) setRecords(data || [])
      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [restaurant.id])

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        A record of settled bills. Each entry represents the completed orders for a table at the time it was settled in{' '}
        <span className="font-medium">Billing</span>.
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No settled bills yet.</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-sand-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Orders</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-2 text-gray-700">{formatDateTime(record.bill_date)}</td>
                  <td className="px-4 py-2 text-gray-700">Table {record.tables?.table_number ?? '-'}</td>
                  <td className="px-4 py-2 text-gray-700">{Array.isArray(record.orders_json) ? record.orders_json.length : 0}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">
                    {formatCurrency(record.total_amount, restaurant?.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
