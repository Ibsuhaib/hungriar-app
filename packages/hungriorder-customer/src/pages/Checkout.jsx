import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Banknote, Smartphone, CreditCard, MapPin } from 'lucide-react';
import { supabase, callFunction } from '../lib/supabase.js';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { rupees } from '../lib/format.js';
import Spinner from '../components/Spinner.jsx';

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash on Delivery', icon: Banknote },
  { value: 'upi', label: 'UPI (pay on delivery)', icon: Smartphone },
  { value: 'card', label: 'Card (pay on delivery)', icon: CreditCard },
];

export default function Checkout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { cart, subtotal, clear } = useCart();
  const { customer, session } = useAuth();

  const [restaurant, setRestaurant] = useState(null);
  const [orderType, setOrderType] = useState('delivery');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', pincode: '' });
  const [savedIdx, setSavedIdx] = useState(-1);
  const [payment, setPayment] = useState('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('delivery_enabled', true)
      .maybeSingle()
      .then(({ data }) => {
        setRestaurant(data);
      });
  }, [slug]);

  useEffect(() => {
    if (customer?.phone && !phone) setPhone(customer.phone);
    if (customer?.name && !name) setName(customer.name);
  }, [customer]); // eslint-disable-line react-hooks/exhaustive-deps

  const savedAddresses = useMemo(
    () => (Array.isArray(customer?.addresses) ? customer.addresses : []),
    [customer]
  );

  const pickSaved = (idx) => {
    setSavedIdx(idx);
    if (idx >= 0) {
      const a = savedAddresses[idx];
      setAddress({ line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', pincode: a.pincode ?? '' });
    }
  };

  if (!restaurant) return <Spinner full />;

  const wrongCart = cart.restaurantId !== restaurant.id || cart.items.length === 0;
  const deliveryFee = orderType === 'delivery' ? Number(restaurant.delivery_fee ?? 0) : 0;
  const total = subtotal + deliveryFee;
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const phoneValid = /^[6-9]\d{9}$/.test(cleanPhone);
  const addressValid = orderType === 'takeaway' || address.line1.trim().length > 3;
  const minOrder = Number(restaurant.min_order_amount ?? 0);
  const belowMin = orderType === 'delivery' && subtotal < minOrder;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!phoneValid) return setError('Enter a valid 10-digit mobile number.');
    if (!addressValid) return setError('Enter a delivery address.');
    if (belowMin) return setError(`Minimum order for delivery is ${rupees(minOrder)}.`);
    setSubmitting(true);
    try {
      const result = await callFunction('place-online-order', {
        restaurant_id: restaurant.id,
        items: cart.items.map((i) => ({ menu_item_id: i.id, quantity: i.qty })),
        order_type: orderType,
        delivery_address: orderType === 'delivery' ? address : null,
        customer_phone: cleanPhone,
        customer_name: name.trim() || null,
        notes: notes.trim() || null,
        payment_method: payment,
      });
      // Persist the address for signed-in customers who typed a new one.
      if (session?.user && orderType === 'delivery' && savedIdx === -1 && address.line1.trim()) {
        const next = [...savedAddresses, { label: 'Saved', ...address }].slice(-5);
        await supabase.from('customers').update({ addresses: next }).eq('id', session.user.id);
      }
      clear();
      navigate(`/r/${slug}/success/${result.order_id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <Link to={`/r/${slug}`} aria-label="Back to menu" className="rounded-full p-1.5 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-base font-bold">Checkout</h1>
          <p className="text-xs text-slate-500">{restaurant.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-5">
        {wrongCart ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">Your cart is empty for this restaurant.</p>
            <Link
              to={`/r/${slug}`}
              className="mt-3 inline-block rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white"
            >
              Browse the menu
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* Order type */}
            {restaurant.delivery_enabled && (
              <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
                {['delivery', 'takeaway'].map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-colors ${
                      orderType === t ? 'bg-navy text-white' : 'text-slate-500'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Contact */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold">Your details</h2>
              <label className="block text-xs font-medium text-slate-500">
                Mobile number *
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-navy outline-none focus:border-gold"
                  required
                />
              </label>
              <label className="mt-3 block text-xs font-medium text-slate-500">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  maxLength={80}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-navy outline-none focus:border-gold"
                />
              </label>
            </section>

            {/* Address */}
            {orderType === 'delivery' && (
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-gold" /> Delivery address
                </h2>
                {savedAddresses.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {savedAddresses.map((a, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => pickSaved(i)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          savedIdx === i ? 'border-gold bg-gold-light font-semibold' : 'border-slate-200'
                        }`}
                      >
                        {a.label || a.line1?.slice(0, 20)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setSavedIdx(-1);
                        setAddress({ line1: '', line2: '', city: '', pincode: '' });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        savedIdx === -1 ? 'border-gold bg-gold-light font-semibold' : 'border-slate-200'
                      }`}
                    >
                      New address
                    </button>
                  </div>
                )}
                <input
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                  placeholder="Flat / house no., street *"
                  maxLength={200}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gold"
                  required
                />
                <input
                  value={address.line2}
                  onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                  placeholder="Area / landmark"
                  maxLength={120}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gold"
                />
                <div className="mt-2 flex gap-2">
                  <input
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="City"
                    maxLength={80}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gold"
                  />
                  <input
                    value={address.pincode}
                    onChange={(e) => setAddress({ ...address, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    placeholder="Pincode"
                    inputMode="numeric"
                    className="w-28 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gold"
                  />
                </div>
              </section>
            )}

            {/* Payment */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold">Payment</h2>
              <div className="space-y-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                      payment === opt.value ? 'border-gold bg-gold-light' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={opt.value}
                      checked={payment === opt.value}
                      onChange={() => setPayment(opt.value)}
                      className="accent-[#D4A373]"
                    />
                    <opt.icon className="h-4 w-4 text-slate-500" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </section>

            {/* Notes */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-bold">Special instructions</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. less spicy, ring the bell twice"
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gold"
              />
            </section>

            {/* Summary */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-bold">Order summary</h2>
              <ul className="space-y-1.5 text-sm">
                {cart.items.map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <span className="text-slate-600">
                      {i.name} × {i.qty}
                    </span>
                    <span>{rupees(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal (incl. taxes)</span>
                  <span>{rupees(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Delivery fee</span>
                    <span>{rupees(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span>Total</span>
                  <span>{rupees(total)}</span>
                </div>
              </div>
              {belowMin && (
                <p className="mt-2 text-xs text-red-600">
                  Minimum order for delivery is {rupees(minOrder)}. Add {rupees(minOrder - subtotal)} more.
                </p>
              )}
            </section>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={submitting || belowMin}
              className="w-full rounded-2xl bg-navy py-4 font-semibold text-white shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Placing order…' : `Confirm Order · ${rupees(total)}`}
            </motion.button>

            {!session && (
              <p className="text-center text-xs text-slate-400">
                <Link to="/login" className="underline">Sign in</Link> to save addresses and see order history.
              </p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
