import { useEffect, useState } from 'react';
import { Upload, BadgeCheck } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];

async function uploadBrandImage(restaurantId, file, kind) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${restaurantId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('restaurant-logos').upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
  });
  if (error) throw new Error('Image upload failed. Use a JPG/PNG/WebP under 2 MB.');
  return supabase.storage.from('restaurant-logos').getPublicUrl(path).data.publicUrl;
}

export default function Settings() {
  const { restaurant, setRestaurant } = useAuth();
  const [form, setForm] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // {type, text}

  useEffect(() => {
    if (restaurant && !form) {
      setForm({
        name: restaurant.name ?? '',
        slug: restaurant.slug ?? '',
        description: restaurant.description ?? '',
        cuisine_tags: (restaurant.cuisine_tags ?? []).join(', '),
        address: restaurant.address ?? '',
        phone: restaurant.phone ?? '',
        delivery_enabled: restaurant.delivery_enabled ?? true,
        delivery_radius_km: restaurant.delivery_radius_km ?? 5,
        min_order_amount: restaurant.min_order_amount ?? 0,
        delivery_fee: restaurant.delivery_fee ?? 0,
        opening_hours: { ...(restaurant.opening_hours ?? {}) },
      });
    }
  }, [restaurant, form]);

  if (!form) return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      // slug is intentionally NOT updatable here — it is managed by the
      // platform team (the protect_subscription_fields trigger reverts it).
      const update = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        cuisine_tags: form.cuisine_tags.split(',').map((t) => t.trim().toLowerCase().replaceAll(' ', '-')).filter(Boolean),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        delivery_enabled: form.delivery_enabled,
        delivery_radius_km: Math.max(0, parseInt(form.delivery_radius_km, 10) || 0),
        min_order_amount: Math.max(0, Number(form.min_order_amount) || 0),
        delivery_fee: Math.max(0, Number(form.delivery_fee) || 0),
        opening_hours: Object.fromEntries(
          Object.entries(form.opening_hours).filter(([, v]) => v && v.trim())
        ),
      };
      if (logoFile) update.logo_url = await uploadBrandImage(restaurant.id, logoFile, 'logo');
      if (coverFile) update.cover_image_url = await uploadBrandImage(restaurant.id, coverFile, 'cover');

      const { data, error } = await supabase
        .from('restaurants')
        .update(update)
        .eq('id', restaurant.id)
        .select()
        .single();
      if (error) {
        throw new Error(
          error.code === '23505' ? 'That URL slug is already taken.' : 'Could not save. Check the slug (lowercase letters, numbers, hyphens).'
        );
      }
      setRestaurant(data);
      setLogoFile(null);
      setCoverFile(null);
      setMessage({ type: 'ok', text: 'Saved! Your storefront is updated.' });
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const expiry = restaurant.subscription_expiry ? new Date(restaurant.subscription_expiry) : null;

  return (
    <div>
      <h1 className="text-xl font-bold">Settings</h1>
      <p className="mt-0.5 text-sm text-slate-500">Your restaurant profile and delivery preferences.</p>

      {/* Subscription */}
      <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-gold">
        <div className="flex items-center gap-3">
          <BadgeCheck className="h-8 w-8 text-gold" />
          <div>
            <p className="text-sm font-bold capitalize">{restaurant.subscription_tier} plan</p>
            <p className="text-xs text-slate-500">
              {expiry
                ? `${expiry > new Date() ? 'Renews' : 'Expired'} on ${expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : 'No expiry set'}
            </p>
          </div>
        </div>
        <a href="mailto:support@hungriorder.com?subject=Upgrade%20plan" className="btn-gold">
          Upgrade plan
        </a>
      </div>

      <form onSubmit={save} className="mt-5 space-y-5 pb-10">
        <section className="card space-y-3">
          <h2 className="text-sm font-bold">Basics</h2>
          <label className="block text-xs font-medium text-slate-500">
            Restaurant name *
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className="input mt-1" required maxLength={120} />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Storefront URL slug
            <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <span className="bg-slate-100 px-3 py-2.5 text-xs text-slate-400">/r/</span>
              <input
                value={form.slug}
                readOnly
                disabled
                className="min-w-0 flex-1 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 outline-none"
              />
            </div>
            <span className="mt-1 block text-[11px] text-slate-400">
              Contact support to change your storefront URL.
            </span>
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Description
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={400} className="input mt-1 resize-none" />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Cuisines (comma separated)
            <input value={form.cuisine_tags} onChange={(e) => set('cuisine_tags', e.target.value)} placeholder="north indian, chinese" className="input mt-1" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-500">
              Address
              <input value={form.address} onChange={(e) => set('address', e.target.value)} className="input mt-1" maxLength={300} />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Phone
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="input mt-1" maxLength={16} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 hover:border-gold">
              <Upload className="h-4 w-4 shrink-0" />
              {logoFile ? logoFile.name : restaurant.logo_url ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 hover:border-gold">
              <Upload className="h-4 w-4 shrink-0" />
              {coverFile ? coverFile.name : restaurant.cover_image_url ? 'Replace cover image' : 'Upload cover image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="text-sm font-bold">Delivery</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.delivery_enabled}
              onChange={(e) => set('delivery_enabled', e.target.checked)}
              className="h-4 w-4 accent-[#D4A373]"
            />
            Offer delivery (uncheck for takeaway only)
          </label>
          {form.delivery_enabled && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-slate-500">
                Radius (km)
                <input type="number" min="0" value={form.delivery_radius_km} onChange={(e) => set('delivery_radius_km', e.target.value)} className="input mt-1" />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Min. order (₹)
                <input type="number" min="0" value={form.min_order_amount} onChange={(e) => set('min_order_amount', e.target.value)} className="input mt-1" />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Delivery fee (₹)
                <input type="number" min="0" value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} className="input mt-1" />
              </label>
            </div>
          )}
        </section>

        <section className="card space-y-2">
          <h2 className="text-sm font-bold">Opening hours</h2>
          <p className="text-xs text-slate-400">Format: 09:00-22:00 · leave blank for closed.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DAYS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span className="w-20">{label}</span>
                <input
                  value={form.opening_hours[key] ?? ''}
                  onChange={(e) => set('opening_hours', { ...form.opening_hours, [key]: e.target.value })}
                  placeholder="09:00-22:00"
                  pattern="^\d{2}:\d{2}-\d{2}:\d{2}$"
                  title="Use HH:MM-HH:MM, e.g. 09:00-22:00"
                  className="input flex-1"
                />
              </label>
            ))}
          </div>
        </section>

        {message && (
          <p
            role="alert"
            className={`rounded-xl px-4 py-3 text-sm ${
              message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary !px-8 !py-3">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
