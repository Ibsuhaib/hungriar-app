import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, MapPin, RotateCcw, Trash2, ReceiptText } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import Spinner from '../components/Spinner.jsx';
import { rupees, timeAgo } from '../lib/format.js';

const STATUS_STYLES = {
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function Account() {
  const { session, customer, loading, refreshCustomer, signOut } = useAuth();
  const { replace } = useCart();
  const navigate = useNavigate();
  const [orders, setOrders] = useState(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    setName(customer?.name ?? '');
  }, [customer?.name]);

  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from('orders')
      .select('*, restaurants(name, slug), order_items(menu_item_id, item_name, unit_price, quantity, menu_items(id, name, price, is_veg, image_url, available))')
      .eq('customer_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setOrders(data ?? []));
  }, [session?.user?.id]);

  if (loading || !session) return <Spinner full />;

  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];

  const saveName = async () => {
    setSavingName(true);
    await supabase.from('customers').update({ name: name.trim() || null }).eq('id', session.user.id);
    await refreshCustomer();
    setSavingName(false);
  };

  const removeAddress = async (idx) => {
    const next = addresses.filter((_, i) => i !== idx);
    await supabase.from('customers').update({ addresses: next }).eq('id', session.user.id);
    await refreshCustomer();
  };

  const reorder = (order) => {
    const restaurant = { id: order.restaurant_id, slug: order.restaurants?.slug, name: order.restaurants?.name };
    const items = (order.order_items ?? [])
      .filter((oi) => oi.menu_items?.available)
      .map((oi) => ({
        id: oi.menu_items.id,
        name: oi.menu_items.name,
        price: Number(oi.menu_items.price),
        is_veg: oi.menu_items.is_veg,
        image_url: oi.menu_items.image_url,
        qty: oi.quantity,
      }));
    if (items.length === 0 || !restaurant.slug) return;
    replace({ restaurantId: restaurant.id, slug: restaurant.slug, restaurantName: restaurant.name, items });
    navigate(`/r/${restaurant.slug}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="Back" className="rounded-full p-1.5 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold">Your account</h1>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-5">
        {/* Profile */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold">Profile</h2>
          <p className="mt-1 text-xs text-slate-500">Phone: +91 {customer?.phone ?? session.user.phone?.replace(/^91/, '')}</p>
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-gold"
            />
            <button
              onClick={saveName}
              disabled={savingName}
              className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        {/* Addresses */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <MapPin className="h-4 w-4 text-gold" /> Saved addresses
          </h2>
          {addresses.length === 0 ? (
            <p className="text-xs text-slate-500">
              Addresses you use at checkout are saved here automatically.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {addresses.map((a, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1 text-sm text-slate-600">
                    {[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')}
                  </div>
                  <button
                    aria-label="Remove address"
                    onClick={() => removeAddress(i)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Order history */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <ReceiptText className="h-4 w-4 text-gold" /> Order history
          </h2>
          {orders === null ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : orders.length === 0 ? (
            <p className="text-xs text-slate-500">No orders yet — your orders will show up here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => (
                <li key={o.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{o.restaurants?.name ?? 'Restaurant'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {(o.order_items ?? []).map((i) => `${i.item_name} ×${i.quantity}`).join(', ')}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {timeAgo(o.created_at)} · {rupees(o.total_amount)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        STATUS_STYLES[o.status] ?? 'bg-gold-light text-navy'
                      }`}
                    >
                      {o.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link
                      to={`/order/${o.id}`}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium"
                    >
                      View
                    </Link>
                    {o.restaurants?.slug && (
                      <button
                        onClick={() => reorder(o)}
                        className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-navy"
                      >
                        <RotateCcw className="h-3 w-3" /> Reorder
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
