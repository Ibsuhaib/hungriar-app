import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, GripVertical, Edit2, Trash2, Check, X, Tag } from 'lucide-react'
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
      .from('categories').select('*').eq('restaurant_id', restaurant.id).order('display_order')
    if (!error) setCategories(data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newName.trim() || adding) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    setAdding(true)
    try {
      const nextOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.display_order)) + 1 : 1
      const { error } = await supabase.from('categories')
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

  const handleRename = async (id) => {
    if (!editingName.trim()) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.from('categories').update({ name: editingName.trim() }).eq('id', id)
    if (error) { toast.error('Failed to rename category'); return }
    setEditingId(null)
    await fetchCategories()
  }

  const handleDelete = async (category) => {
    if (!window.confirm(`Delete "${category.name}"? Items in this category will become uncategorised.`)) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    if (error) { toast.error('Failed to delete category'); return }
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
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('categories').update({ display_order: target.display_order }).eq('id', current.id),
      supabase.from('categories').update({ display_order: current.display_order }).eq('id', target.id),
    ])
    if (e1 || e2) { toast.error('Failed to reorder categories'); return }
    await fetchCategories()
  }

  return (
    <div className="space-y-6">
      {/* Add category form */}
      <form onSubmit={handleAdd} className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="label" htmlFor="cat-name">New category name</label>
          <input
            id="cat-name"
            className="input"
            placeholder="e.g. Starters, Mains, Desserts"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            required
          />
        </div>
        <button type="submit" disabled={adding} className="btn-primary gap-2 flex-shrink-0">
          {adding
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <Plus className="w-4 h-4" />}
          Add
        </button>
      </form>

      {/* Categories list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="card py-12 text-center bg-gray-50">
          <Tag className="w-8 h-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No categories yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add your first category to organise menu items.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {categories.map((cat, index) => (
              <motion.li
                key={cat.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.18 }}
                className="card flex items-center gap-3"
              >
                {/* Drag handle / reorder */}
                <div className="flex flex-col text-gray-300 flex-shrink-0 -my-1">
                  <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0}
                    aria-label="Move up" className="leading-none hover:text-gray-500 disabled:opacity-20 p-0.5">
                    <GripVertical className="w-4 h-4 rotate-0" />
                  </button>
                </div>
                <div className="flex flex-col gap-0 text-gray-300 flex-shrink-0 -ml-4">
                  <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0}
                    aria-label="Move up" className="leading-none hover:text-primary-500 disabled:opacity-20 text-xs py-0.5 px-1">▲</button>
                  <button type="button" onClick={() => handleMove(index, 1)} disabled={index === categories.length - 1}
                    aria-label="Move down" className="leading-none hover:text-primary-500 disabled:opacity-20 text-xs py-0.5 px-1">▼</button>
                </div>

                {editingId === cat.id ? (
                  <input
                    className="input flex-1 py-1.5 text-sm"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={60}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(cat.id); if (e.key === 'Escape') setEditingId(null) }}
                  />
                ) : (
                  <span className="flex-1 font-medium text-gray-900 text-sm">{cat.name}</span>
                )}

                {editingId === cat.id ? (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => handleRename(cat.id)} className="btn btn-secondary btn-sm px-2.5 gap-1">
                      <Check className="w-3 h-3" /> Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn btn-ghost btn-sm px-2.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                      className="btn btn-outline btn-sm px-2.5 gap-1">
                      <Edit2 className="w-3 h-3" /> Rename
                    </button>
                    <button type="button" onClick={() => handleDelete(cat)} className="btn btn-danger btn-sm px-2.5 gap-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
