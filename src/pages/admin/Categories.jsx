import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'

export default function Categories() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('display_order')

    if (!error) setCategories(data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleAdd = async (event) => {
    event.preventDefault()
    if (!newName.trim() || adding) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setAdding(true)
    try {
      const nextOrder = categories.length > 0 ? Math.max(...categories.map((cat) => cat.display_order)) + 1 : 1
      const { error } = await supabase
        .from('categories')
        .insert({ restaurant_id: restaurant.id, name: newName.trim(), display_order: nextOrder })

      if (error) throw error

      setNewName('')
      await fetchCategories()
      toast.success('Category added')
    } catch (err) {
      toast.error(err.message || 'Failed to add category')
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (category) => {
    setEditingId(category.id)
    setEditingName(category.name)
  }

  const handleRename = async (id) => {
    if (!editingName.trim()) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const { error } = await supabase.from('categories').update({ name: editingName.trim() }).eq('id', id)
    if (error) {
      toast.error('Failed to rename category')
      return
    }

    setEditingId(null)
    await fetchCategories()
  }

  const handleDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}"? Items in this category will become uncategorised.`)) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    if (error) {
      toast.error('Failed to delete category')
      return
    }

    await fetchCategories()
    toast.success('Category deleted')
  }

  const handleMove = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= categories.length) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const current = categories[index]
    const target = categories[targetIndex]

    const [{ error: error1 }, { error: error2 }] = await Promise.all([
      supabase.from('categories').update({ display_order: target.display_order }).eq('id', current.id),
      supabase.from('categories').update({ display_order: current.display_order }).eq('id', target.id),
    ])

    if (error1 || error2) {
      toast.error('Failed to reorder categories')
      return
    }

    await fetchCategories()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="card flex gap-2">
        <input
          className="input flex-1"
          placeholder="New category name (e.g. Starters)"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={60}
          required
        />
        <button type="submit" disabled={adding} className="btn-primary">
          {adding ? 'Adding...' : 'Add'}
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="text-gray-500">No categories yet. Add your first category above.</p>
      ) : (
        <ul className="space-y-2">
          {categories.map((category, index) => (
            <li key={category.id} className="card flex items-center gap-3">
              <div className="flex flex-col text-gray-400">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                  className="leading-none hover:text-gray-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === categories.length - 1}
                  aria-label="Move down"
                  className="leading-none hover:text-gray-700 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              {editingId === category.id ? (
                <input
                  className="input flex-1"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  maxLength={60}
                  autoFocus
                />
              ) : (
                <span className="flex-1 font-medium text-gray-900">{category.name}</span>
              )}

              {editingId === category.id ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleRename(category.id)} className="btn-primary px-3 py-1.5 text-xs">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn-outline px-3 py-1.5 text-xs">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => startEdit(category)} className="btn-outline px-3 py-1.5 text-xs">
                    Rename
                  </button>
                  <button type="button" onClick={() => handleDelete(category)} className="btn-danger px-3 py-1.5 text-xs">
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
