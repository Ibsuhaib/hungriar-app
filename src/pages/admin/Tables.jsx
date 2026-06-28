import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, QrCode, Trash2, Lock } from 'lucide-react'
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
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

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

  useEffect(() => { fetchTables() }, [fetchTables])

  const handleAdd = async (e) => {
    e.preventDefault()
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

  const handleDelete = async () => {
    if (!confirmDelete || deleting) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('tables').delete().eq('id', confirmDelete.id)
      if (error) { toast.error('Failed to delete table'); return }
      await fetchTables()
      toast.success('Table deleted')
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Add table form */}
      <form onSubmit={handleAdd} className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="table-number">Table number or name</label>
          <input
            id="table-number"
            className="input"
            placeholder="e.g. 5, Patio-2, Terrace-A"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            maxLength={20}
            required
          />
        </div>
        <button type="submit" disabled={adding} className="btn-primary gap-2 flex-shrink-0">
          {adding ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Add Table
        </button>
      </form>

      {/* Tables grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}
        </div>
      ) : tables.length === 0 ? (
        <div className="card py-14 text-center bg-gray-50">
          <QrCode className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No tables yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add your first table above to generate its QR code.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence>
            {tables.map((table) => (
              <motion.div
                key={table.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="space-y-2"
              >
                {restaurant?.plan === 'standard' || restaurant?.plan === 'ar_premium' ? (
                  <TableQR table={table} restaurantId={restaurant.id} />
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 p-6 text-center aspect-square">
                    <Lock className="w-6 h-6 text-gray-300" />
                    <p className="text-xs font-semibold text-gray-400">Table {table.table_number}</p>
                    <p className="text-[11px] text-gray-400">QR codes require<br />Standard plan</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDelete(table)}
                  className="btn btn-ghost btn-sm w-full gap-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Table
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setConfirmDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" style={{ pointerEvents: 'auto' }}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 mb-4">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-base font-bold text-gray-900 font-display">Delete Table {confirmDelete.table_number}?</h3>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  This will permanently delete the table and its entire order history. This cannot be undone.
                </p>
                <div className="flex gap-3 mt-5">
                  <button type="button" onClick={() => setConfirmDelete(null)} className="btn-outline flex-1">Cancel</button>
                  <button type="button" onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
