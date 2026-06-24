import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, Trash2, X, Upload, Box, ImageIcon, ToggleLeft, ToggleRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRateLimit } from '../../hooks/useRateLimit'
import { supabase } from '../../lib/supabase'
import { uploadAsset, deleteAsset } from '../../lib/storage'
import { formatCurrency, truncate } from '../../utils/formatters'

const EMPTY_FORM = {
  id: null,
  name: '',
  description: '',
  price: '',
  category_id: '',
  image_url: '',
  ar_model_url: '',
  available: true,
}

function UploadZone({ label, hint, value, loading, accept, onChange, icon: Icon }) {
  return (
    <div>
      <p className="label">{label}</p>
      <label className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors cursor-pointer min-h-[90px] px-4 py-4
        ${value ? 'border-secondary-300 bg-secondary-50' : 'border-gray-200 hover:border-primary-300 bg-gray-50 hover:bg-primary-50'}`}>
        <input type="file" accept={accept} className="sr-only" onChange={onChange} disabled={loading} />
        {loading ? (
          <div className="flex flex-col items-center gap-1.5">
            <span className="w-5 h-5 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin" />
            <span className="text-xs text-gray-500">Uploading…</span>
          </div>
        ) : value ? (
          <div className="flex flex-col items-center gap-1">
            <Icon className="w-5 h-5 text-secondary-500" />
            <span className="text-xs text-secondary-700 font-medium text-center break-all px-2">{value.split('/').pop()}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="w-5 h-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">{hint}</span>
          </div>
        )}
      </label>
    </div>
  )
}

function ItemCard({ item, onEdit, onDelete, onToggle, currency }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      className={`card flex gap-3 transition-opacity ${item.available ? '' : 'opacity-60'}`}
    >
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-sand-100 flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-sand-300" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 truncate leading-snug text-sm">{item.name}</p>
          <p className="font-bold text-primary-600 text-sm whitespace-nowrap flex-shrink-0">{formatCurrency(item.price, currency)}</p>
        </div>
        {item.description && (
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{truncate(item.description, 60)}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.ar_model_url && (
            <span className="badge badge-sm bg-secondary-100 text-secondary-700 gap-0.5">
              <Box className="w-2.5 h-2.5" /> AR
            </span>
          )}
          <button
            type="button"
            onClick={() => onToggle(item)}
            className={`badge badge-sm gap-1 cursor-pointer transition-colors ${
              item.available ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {item.available ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
            {item.available ? 'Available' : 'Hidden'}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button type="button" onClick={() => onEdit(item)} className="btn btn-outline btn-sm gap-1 px-2.5 py-1">
            <Edit2 className="w-3 h-3" /> Edit
          </button>
          <button type="button" onClick={() => onDelete(item)} className="btn btn-danger btn-sm gap-1 px-2.5 py-1">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function MenuManagement() {
  const { restaurant, user } = useAuth()
  const { checkAdminLimit } = useRateLimit()

  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingModel, setUploadingModel] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [itemsRes, catRes] = await Promise.all([
      supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id).order('display_order'),
      supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('display_order'),
    ])
    if (!itemsRes.error) setItems(itemsRes.data || [])
    if (!catRes.error) setCategories(catRes.data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => { fetchData() }, [fetchData])

  const openNewForm = () => setForm({ ...EMPTY_FORM })
  const openEditForm = (item) => setForm({
    id: item.id,
    name: item.name,
    description: item.description || '',
    price: String(item.price),
    category_id: item.category_id || '',
    image_url: item.image_url || '',
    ar_model_url: item.ar_model_url || '',
    available: item.available,
  })
  const closeForm = () => setForm(null)

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) { e.target.value = ''; return }
    setUploadingImage(true)
    try {
      const url = await uploadAsset(restaurant.id, 'images', file)
      setForm((p) => ({ ...p, image_url: url }))
    } catch (err) {
      toast.error(err.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
      e.target.value = ''
    }
  }

  const handleModelUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/\.(glb|usdz)$/i.test(file.name)) {
      toast.error('AR model must be a .glb or .usdz file')
      e.target.value = ''
      return
    }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) { e.target.value = ''; return }
    setUploadingModel(true)
    try {
      const url = await uploadAsset(restaurant.id, 'models', file)
      setForm((p) => ({ ...p, ar_model_url: url }))
    } catch (err) {
      toast.error(err.message || 'Failed to upload AR model')
    } finally {
      setUploadingModel(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving || !form) return
    const price = Number(form.price)
    if (!form.name.trim() || Number.isNaN(price) || price < 0) {
      toast.error('Please enter a valid name and price')
      return
    }
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    setSaving(true)
    try {
      const payload = {
        restaurant_id: restaurant.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        category_id: form.category_id || null,
        image_url: form.image_url || null,
        ar_model_url: form.ar_model_url || null,
        available: form.available,
      }
      if (form.id) {
        const { error } = await supabase.from('menu_items').update(payload).eq('id', form.id)
        if (error) throw error
        toast.success('Item updated')
      } else {
        const siblingOrders = items.filter((i) => i.category_id === payload.category_id).map((i) => i.display_order)
        payload.display_order = siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 1
        const { error } = await supabase.from('menu_items').insert(payload)
        if (error) throw error
        toast.success('Item added')
      }
      closeForm()
      await fetchData()
    } catch (err) {
      toast.error(err.message || 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id)
    if (error) { toast.error('Failed to delete item'); return }
    if (item.image_url) await deleteAsset(item.image_url)
    if (item.ar_model_url) await deleteAsset(item.ar_model_url)
    await fetchData()
    toast.success('Item deleted')
  }

  const toggleAvailable = async (item) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return
    const { error } = await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    if (error) { toast.error('Failed to update item'); return }
    await fetchData()
  }

  const groups = [
    ...categories.map((cat) => ({ cat, items: items.filter((i) => i.category_id === cat.id) })),
    { cat: null, items: items.filter((i) => !i.category_id) },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''} on your menu</p>
        <button type="button" onClick={openNewForm} className="btn-primary gap-2">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Form modal overlay */}
      <AnimatePresence>
        {form && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={closeForm}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900 font-display">
                    {form.id ? 'Edit Item' : 'New Menu Item'}
                  </h2>
                  <button type="button" onClick={closeForm} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal body */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <label className="label" htmlFor="item-name">Name</label>
                      <input id="item-name" className="input" value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        maxLength={120} required placeholder="e.g. Butter Chicken" />
                    </div>

                    <div>
                      <label className="label" htmlFor="item-desc">Description</label>
                      <textarea id="item-desc" className="input resize-none" rows={2}
                        value={form.description} maxLength={500} placeholder="Brief description…"
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label" htmlFor="item-price">Price ({restaurant?.currency})</label>
                        <input id="item-price" type="number" min="0" step="0.01" className="input"
                          value={form.price} required placeholder="0.00"
                          onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label" htmlFor="item-cat">Category</label>
                        <select id="item-cat" className="input" value={form.category_id}
                          onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}>
                          <option value="">Uncategorised</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <UploadZone
                        label="Photo"
                        hint="Upload image"
                        value={form.image_url}
                        loading={uploadingImage}
                        accept="image/*"
                        onChange={handleImageUpload}
                        icon={ImageIcon}
                      />
                      <UploadZone
                        label="AR / 3D Model"
                        hint=".glb or .usdz"
                        value={form.ar_model_url}
                        loading={uploadingModel}
                        accept=".glb,.usdz"
                        onChange={handleModelUpload}
                        icon={Box}
                      />
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <div className={`relative w-9 h-5 rounded-full transition-colors ${form.available ? 'bg-primary-500' : 'bg-gray-200'}`}>
                        <input type="checkbox" className="sr-only" checked={form.available}
                          onChange={(e) => setForm((p) => ({ ...p, available: e.target.checked }))} />
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.available ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Available on menu</span>
                    </label>
                  </div>

                  <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                    <button type="button" onClick={closeForm} className="btn-outline flex-1">Cancel</button>
                    <button type="submit" disabled={saving} className="btn-primary flex-1">
                      {saving ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Saving…
                        </span>
                      ) : (form.id ? 'Save Changes' : 'Add Item')}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Items list */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card py-12 text-center bg-gray-50">
          <p className="text-2xl mb-2">🍽</p>
          <p className="text-sm font-medium text-gray-500">No menu items yet.</p>
          <p className="text-xs text-gray-400 mt-1">Click "Add Item" to create your first menu item.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.cat?.id || 'uncategorised'}>
              <h2 className="section-title mb-3">{group.cat?.name || 'Uncategorised'}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AnimatePresence>
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onEdit={openEditForm}
                      onDelete={handleDelete}
                      onToggle={toggleAvailable}
                      currency={restaurant?.currency}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
