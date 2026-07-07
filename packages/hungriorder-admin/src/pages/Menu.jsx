import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ImageOff, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { rupees } from '../lib/format.js';

async function uploadImage(restaurantId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('menu-images').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
  });
  if (error) throw new Error('Image upload failed. Use a JPG/PNG/WebP under 2 MB.');
  return supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
}

const EMPTY_ITEM = { name: '', description: '', price: '', is_veg: true, available: true, image_url: null };

export default function Menu() {
  const { restaurant } = useAuth();
  const [categories, setCategories] = useState(null);
  const [items, setItems] = useState([]);
  const [catModal, setCatModal] = useState(null); // {id?, name}
  const [itemModal, setItemModal] = useState(null); // {id?, category_id, ...fields}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [{ data: cats }, { data: menu }] = await Promise.all([
      supabase.from('categories').select('*').eq('restaurant_id', restaurant.id).order('display_order'),
      supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id).order('name'),
    ]);
    setCategories(cats ?? []);
    setItems(menu ?? []);
  };

  useEffect(() => {
    if (restaurant) load();
  }, [restaurant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemsByCategory = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.category_id)) map.set(item.category_id, []);
      map.get(item.category_id).push(item);
    }
    return map;
  }, [items]);

  // ---- Categories -------------------------------------------------------
  const saveCategory = async (e) => {
    e.preventDefault();
    const name = catModal.name.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    const result = catModal.id
      ? await supabase.from('categories').update({ name }).eq('id', catModal.id)
      : await supabase.from('categories').insert({
          restaurant_id: restaurant.id,
          name,
          display_order: (categories?.length ?? 0) + 1,
        });
    setBusy(false);
    if (result.error) return setError('Could not save the category.');
    setCatModal(null);
    load();
  };

  const deleteCategory = async (cat) => {
    const count = itemsByCategory.get(cat.id)?.length ?? 0;
    if (!window.confirm(`Delete "${cat.name}"${count ? ` and its ${count} item(s)` : ''}?`)) return;
    await supabase.from('categories').delete().eq('id', cat.id);
    load();
  };

  const moveCategory = async (idx, dir) => {
    const next = [...categories];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setCategories(next);
    await Promise.all(
      next.map((c, i) => supabase.from('categories').update({ display_order: i + 1 }).eq('id', c.id))
    );
  };

  // ---- Items -------------------------------------------------------------
  const saveItem = async (e) => {
    e.preventDefault();
    const price = Number(itemModal.price);
    if (!itemModal.name.trim() || !Number.isFinite(price) || price < 0) {
      return setError('A name and a valid price are required.');
    }
    setBusy(true);
    setError('');
    try {
      let imageUrl = itemModal.image_url;
      if (itemModal.file) imageUrl = await uploadImage(restaurant.id, itemModal.file);
      const row = {
        name: itemModal.name.trim(),
        description: itemModal.description.trim() || null,
        price,
        is_veg: itemModal.is_veg,
        available: itemModal.available,
        image_url: imageUrl,
      };
      const result = itemModal.id
        ? await supabase.from('menu_items').update(row).eq('id', itemModal.id)
        : await supabase.from('menu_items').insert({
            ...row,
            restaurant_id: restaurant.id,
            category_id: itemModal.category_id,
          });
      if (result.error) throw new Error('Could not save the item.');
      setItemModal(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await supabase.from('menu_items').delete().eq('id', item.id);
    load();
  };

  const toggleAvailability = async (item) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: !i.available } : i)));
    await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id);
  };

  if (categories === null) return <div className="flex justify-center pt-20"><Spinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Menu</h1>
          <p className="mt-0.5 text-sm text-slate-500">Changes go live on your storefront instantly.</p>
        </div>
        <button onClick={() => setCatModal({ name: '' })} className="btn-primary flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Category
        </button>
      </div>

      {categories.length === 0 && (
        <p className="card mt-5 py-10 text-center text-sm text-slate-500">
          Start by adding a category — e.g. Starters, Main Course, Beverages.
        </p>
      )}

      <div className="mt-5 space-y-6">
        {categories.map((cat, idx) => (
          <section key={cat.id} className="card !p-0">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{cat.name}</h2>
              <button aria-label="Move up" onClick={() => moveCategory(idx, -1)} disabled={idx === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button aria-label="Move down" onClick={() => moveCategory(idx, 1)} disabled={idx === categories.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button aria-label="Rename category" onClick={() => setCatModal({ id: cat.id, name: cat.name })} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <Pencil className="h-4 w-4" />
              </button>
              <button aria-label="Delete category" onClick={() => deleteCategory(cat)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setItemModal({ ...EMPTY_ITEM, category_id: cat.id })}
                className="ml-2 flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-navy"
              >
                <Plus className="h-3.5 w-3.5" /> Item
              </button>
            </div>

            {(itemsByCategory.get(cat.id) ?? []).length === 0 ? (
              <p className="px-4 py-5 text-center text-xs text-slate-400">No items in this category yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {itemsByCategory.get(cat.id).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-4 w-4 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${item.available ? '' : 'text-slate-400 line-through'}`}>
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {rupees(item.price)} · {item.is_veg ? 'Veg' : 'Non-veg'}
                      </p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={item.available}
                        onChange={() => toggleAvailability(item)}
                        className="h-4 w-4 accent-[#D4A373]"
                      />
                      <span className="hidden sm:inline">Available</span>
                    </label>
                    <button
                      aria-label="Edit item"
                      onClick={() => setItemModal({ ...item, price: String(item.price), file: null })}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button aria-label="Delete item" onClick={() => deleteItem(item)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {/* Category modal */}
      <Modal
        open={Boolean(catModal)}
        onClose={() => setCatModal(null)}
        title={catModal?.id ? 'Rename category' : 'New category'}
      >
        {catModal && (
          <form onSubmit={saveCategory} className="space-y-3">
            <input
              value={catModal.name}
              onChange={(e) => setCatModal({ ...catModal, name: e.target.value })}
              placeholder="Category name"
              maxLength={80}
              className="input"
              autoFocus
              required
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
      </Modal>

      {/* Item modal */}
      <Modal
        open={Boolean(itemModal)}
        onClose={() => setItemModal(null)}
        title={itemModal?.id ? 'Edit item' : 'New item'}
      >
        {itemModal && (
          <form onSubmit={saveItem} className="space-y-3">
            <input
              value={itemModal.name}
              onChange={(e) => setItemModal({ ...itemModal, name: e.target.value })}
              placeholder="Item name *"
              maxLength={120}
              className="input"
              autoFocus
              required
            />
            <textarea
              value={itemModal.description ?? ''}
              onChange={(e) => setItemModal({ ...itemModal, description: e.target.value })}
              placeholder="Short description"
              rows={2}
              maxLength={300}
              className="input resize-none"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={itemModal.price}
              onChange={(e) => setItemModal({ ...itemModal, price: e.target.value })}
              placeholder="Price (₹, tax inclusive) *"
              className="input"
              required
            />
            <div className="flex gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={itemModal.is_veg}
                  onChange={(e) => setItemModal({ ...itemModal, is_veg: e.target.checked })}
                  className="h-4 w-4 accent-green-600"
                />
                Veg
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={itemModal.available}
                  onChange={(e) => setItemModal({ ...itemModal, available: e.target.checked })}
                  className="h-4 w-4 accent-[#D4A373]"
                />
                Available
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-gold">
              <Upload className="h-4 w-4" />
              {itemModal.file ? itemModal.file.name : itemModal.image_url ? 'Replace photo' : 'Add a photo (JPG/PNG/WebP, max 2 MB)'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setItemModal({ ...itemModal, file: e.target.files?.[0] ?? null })}
              />
            </label>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Saving…' : 'Save item'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
