import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
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
    const [itemsRes, categoriesRes] = await Promise.all([
      supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id).order('display_order'),
      supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('display_order'),
    ])

    if (!itemsRes.error) setItems(itemsRes.data || [])
    if (!categoriesRes.error) setCategories(categoriesRes.data || [])
    setLoading(false)
  }, [restaurant.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openNewForm = () => setForm({ ...EMPTY_FORM })
  const openEditForm = (item) =>
    setForm({
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

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) {
      event.target.value = ''
      return
    }

    setUploadingImage(true)
    try {
      const url = await uploadAsset(restaurant.id, 'images', file)
      setForm((prev) => ({ ...prev, image_url: url }))
    } catch (err) {
      toast.error(err.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
      event.target.value = ''
    }
  }

  const handleModelUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!/\.(glb|usdz)$/i.test(file.name)) {
      toast.error('AR model must be a .glb or .usdz file')
      event.target.value = ''
      return
    }

    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) {
      event.target.value = ''
      return
    }

    setUploadingModel(true)
    try {
      const url = await uploadAsset(restaurant.id, 'models', file)
      setForm((prev) => ({ ...prev, ar_model_url: url }))
    } catch (err) {
      toast.error(err.message || 'Failed to upload AR model')
    } finally {
      setUploadingModel(false)
      event.target.value = ''
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
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
        const siblingOrders = items.filter((item) => item.category_id === payload.category_id).map((item) => item.display_order)
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
    if (error) {
      toast.error('Failed to delete item')
      return
    }

    if (item.image_url) await deleteAsset(item.image_url)
    if (item.ar_model_url) await deleteAsset(item.ar_model_url)

    await fetchData()
    toast.success('Item deleted')
  }

  const toggleAvailable = async (item) => {
    const allowed = await checkAdminLimit(user?.id)
    if (!allowed) return

    const { error } = await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    if (error) {
      toast.error('Failed to update item')
      return
    }

    await fetchData()
  }

  const groups = [
    ...categories.map((category) => ({ category, items: items.filter((item) => item.category_id === category.id) })),
    { category: null, items: items.filter((item) => !item.category_id) },
  ].filter((group) => group.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} item{items.length === 1 ? '' : 's'} on your menu</p>
        {!form && (
          <button type="button" onClick={openNewForm} className="btn-primary">
            + Add Item
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{form.id ? 'Edit Item' : 'New Item'}</h2>

          <div>
            <label className="label" htmlFor="item-name">
              Name
            </label>
            <input
              id="item-name"
              className="input"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              maxLength={120}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="item-description">
              Description
            </label>
            <textarea
              id="item-description"
              className="input"
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              maxLength={500}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="item-price">
                Price ({restaurant?.currency})
              </label>
              <input
                id="item-price"
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="item-category">
                Category
              </label>
              <select
                id="item-category"
                className="input"
                value={form.category_id}
                onChange={(event) => setForm((prev) => ({ ...prev, category_id: event.target.value }))}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Photo</label>
              {form.image_url && <img src={form.image_url} alt="" className="mb-2 h-24 w-24 rounded-lg object-cover" />}
              <label className="btn-outline cursor-pointer text-sm">
                {uploadingImage ? 'Uploading...' : form.image_url ? 'Replace Photo' : 'Upload Photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
            </div>
            <div>
              <label className="label">AR / 3D Model (.glb or .usdz)</label>
              {form.ar_model_url && <p className="mb-2 truncate text-xs text-secondary-700">{form.ar_model_url.split('/').pop()}</p>}
              <label className="btn-outline cursor-pointer text-sm">
                {uploadingModel ? 'Uploading...' : form.ar_model_url ? 'Replace Model' : 'Upload Model'}
                <input type="file" accept=".glb,.usdz" className="hidden" onChange={handleModelUpload} disabled={uploadingModel} />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={form.available}
              onChange={(event) => setForm((prev) => ({ ...prev, available: event.target.checked }))}
            />
            Available on menu
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Item'}
            </button>
            <button type="button" onClick={closeForm} className="btn-outline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-500">No menu items yet. Add your first item above.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.category?.id || 'uncategorised'}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {group.category?.name || 'Uncategorised'}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <div key={item.id} className="card flex gap-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-sand-200 text-xl">🍽</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-gray-900">{item.name}</p>
                        <p className="whitespace-nowrap font-semibold text-primary-700">{formatCurrency(item.price, restaurant?.currency)}</p>
                      </div>
                      {item.description && <p className="text-xs text-gray-500">{truncate(item.description, 60)}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAvailable(item)}
                          className={`badge ${item.available ? 'bg-secondary-100 text-secondary-800' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {item.available ? 'Available' : 'Unavailable'}
                        </button>
                        {item.ar_model_url && <span className="badge bg-primary-100 text-primary-700">AR</span>}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => openEditForm(item)} className="btn-outline px-3 py-1 text-xs">
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(item)} className="btn-danger px-3 py-1 text-xs">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
