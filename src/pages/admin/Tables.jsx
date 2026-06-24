import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import TableQR from '../../components/TableQR'

export default function Tables() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [newNumber, setNewNumber] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchTables = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('table_number')

    if (!error) setTables(data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  const handleAdd = async (event) => {
    event.preventDefault()
    if (!newNumber.trim() || adding) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setAdding(true)
    try {
      const { error } = await supabase
        .from('tables')
        .insert({ restaurant_id: restaurant.id, table_number: newNumber.trim() })

      if (error) {
        if (error.code === '23505') throw new Error('A table with this number already exists')
        throw error
      }

      setNewNumber('')
      await fetchTables()
      toast.success('Table added')
    } catch (err) {
      toast.error(err.message || 'Failed to add table')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (table) => {
    if (!window.confirm(`Delete Table ${table.table_number}? This will also permanently delete its order history.`)) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const { error } = await supabase.from('tables').delete().eq('id', table.id)
    if (error) {
      toast.error('Failed to delete table')
      return
    }

    await fetchTables()
    toast.success('Table deleted')
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="card flex gap-2">
        <input
          className="input flex-1"
          placeholder="Table number / name (e.g. 5, Patio-2)"
          value={newNumber}
          onChange={(event) => setNewNumber(event.target.value)}
          maxLength={20}
          required
        />
        <button type="submit" disabled={adding} className="btn-primary">
          {adding ? 'Adding...' : 'Add Table'}
        </button>
      </form>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-56 rounded-2xl" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <p className="text-gray-500">No tables yet. Add your first table above to generate its QR code.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <div key={table.id} className="space-y-2">
              <TableQR table={table} restaurantId={restaurant.id} />
              <button type="button" onClick={() => handleDelete(table)} className="btn-danger w-full text-xs">
                Delete Table
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
