import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatTime } from '../../utils/formatters'

export default function Billing() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [settlingTableId, setSettlingTableId] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [tablesRes, ordersRes] = await Promise.all([
      supabase.from('tables').select('*').eq('restaurant_id', restaurant.id).order('table_number'),
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('restaurant_id', restaurant.id)
        .eq('status', 'completed')
        .order('order_time'),
    ])

    if (!tablesRes.error) setTables(tablesRes.data || [])
    if (!ordersRes.error) setOrders(ordersRes.data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const bills = useMemo(() => {
    return tables
      .map((table) => {
        const tableOrders = orders.filter((order) => order.table_id === table.id)
        const total = tableOrders.reduce((sum, order) => sum + Number(order.total_amount), 0)
        return { table, orders: tableOrders, total }
      })
      .filter((bill) => bill.orders.length > 0)
  }, [tables, orders])

  const handleSettle = async (tableId) => {
    if (settlingTableId) return
    if (!window.confirm('Settle this bill? Completed orders for this table will be archived to history.')) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setSettlingTableId(tableId)
    try {
      const { data, error } = await supabase.rpc('reset_table_billing', {
        p_restaurant_id: restaurant.id,
        p_table_id: tableId,
      })

      if (error) throw error
      if (!data) {
        toast.error('No completed orders to settle for this table')
        return
      }

      toast.success('Bill settled and archived to history')
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to settle bill')
    } finally {
      setSettlingTableId(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Tables with completed but unsettled orders appear below. Settling a bill archives those orders to{' '}
        <span className="font-medium">History</span> and clears the table for new orders.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No tables currently have unsettled bills.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {bills.map(({ table, orders: tableOrders, total }) => (
            <div key={table.id} className="card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Table {table.table_number}</h2>
                <span className="badge bg-gray-100 text-gray-600">{tableOrders.length} order{tableOrders.length === 1 ? '' : 's'}</span>
              </div>

              <ul className="divide-y divide-gray-100 text-sm">
                {tableOrders.map((order) => (
                  <li key={order.id} className="py-1.5">
                    <div className="flex justify-between text-gray-700">
                      <span>Order at {formatTime(order.order_time)}</span>
                      <span className="font-medium">{formatCurrency(order.total_amount, restaurant?.currency)}</span>
                    </div>
                    <ul className="mt-0.5 pl-3 text-xs text-gray-500">
                      {(order.order_items || []).map((item) => (
                        <li key={item.id}>
                          {item.quantity} &times; {item.item_name}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-semibold text-gray-900">Total Due</span>
                <span className="text-lg font-bold text-gray-900">{formatCurrency(total, restaurant?.currency)}</span>
              </div>

              <button
                type="button"
                onClick={() => handleSettle(table.id)}
                disabled={settlingTableId === table.id}
                className="btn-primary w-full"
              >
                {settlingTableId === table.id ? 'Settling...' : 'Settle Bill'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
