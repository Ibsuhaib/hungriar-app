import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, MapPin, Clock, Bike, UtensilsCrossed, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useCart } from '../context/CartContext.jsx';
import { rupees, hoursToday, isOpenNow } from '../lib/format.js';
import MenuItemCard from '../components/MenuItemCard.jsx';
import CartSheet from '../components/CartSheet.jsx';
import Spinner from '../components/Spinner.jsx';

export default function Restaurant() {
  const { slug } = useParams();
  const { cart, count, subtotal, add, setQty } = useCart();
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [state, setState] = useState('loading'); // loading | ready | notfound | error
  const sectionRefs = useRef({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState('loading');
      const { data: r, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .eq('delivery_enabled', true) // storefront is live only when online ordering is enabled
        .maybeSingle();
      if (cancelled) return;
      if (error) return setState('error');
      if (!r) return setState('notfound');
      const [{ data: cats }, { data: menu }] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', r.id).order('display_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', r.id).eq('available', true).order('name'),
      ]);
      if (cancelled) return;
      setRestaurant(r);
      setCategories(cats ?? []);
      setItems(menu ?? []);
      setActiveCat(cats?.[0]?.id ?? null);
      setState('ready');
      document.title = `${r.name} — hungriOrder`;
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const itemsByCategory = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.category_id)) map.set(item.category_id, []);
      map.get(item.category_id).push(item);
    }
    return map;
  }, [items]);

  const qtyOf = (id) =>
    cart.restaurantId === restaurant?.id ? (cart.items.find((i) => i.id === id)?.qty ?? 0) : 0;

  const scrollToCategory = (catId) => {
    setActiveCat(catId);
    sectionRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (state === 'loading') return <Spinner full />;
  if (state === 'notfound' || state === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <UtensilsCrossed className="h-10 w-10 text-slate-300" />
        <h1 className="text-lg font-bold">
          {state === 'notfound' ? 'Restaurant not found' : 'Something went wrong'}
        </h1>
        <p className="text-sm text-slate-500">
          {state === 'notfound'
            ? `We couldn't find “${slug}”. Check the link with the restaurant.`
            : 'Please check your connection and try again.'}
        </p>
        <Link to="/" className="mt-2 rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white">
          Go home
        </Link>
      </div>
    );
  }

  const open = isOpenNow(restaurant.opening_hours);
  const today = hoursToday(restaurant.opening_hours);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Cover + header */}
      <div className="relative h-44 bg-navy sm:h-56">
        {restaurant.cover_image_url && (
          <img src={restaurant.cover_image_url} alt="" className="h-full w-full object-cover opacity-70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <div className="mx-auto max-w-2xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="-mt-12 rounded-3xl bg-white p-5 shadow-lg"
        >
          <div className="flex items-start gap-4">
            {restaurant.logo_url && (
              <img
                src={restaurant.logo_url}
                alt={`${restaurant.name} logo`}
                className="h-16 w-16 rounded-2xl border border-slate-100 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold">{restaurant.name}</h1>
              {restaurant.cuisine_tags?.length > 0 && (
                <p className="mt-0.5 text-xs capitalize text-slate-500">
                  {restaurant.cuisine_tags.join(' · ').replaceAll('-', ' ')}
                </p>
              )}
              <span
                className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {open ? 'Open now' : 'Closed'} {today ? `· ${today}` : ''}
              </span>
            </div>
          </div>
          {restaurant.description && (
            <p className="mt-3 text-sm text-slate-600">{restaurant.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {restaurant.address && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{restaurant.address}</span>
            )}
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} className="flex items-center gap-1 text-navy underline">
                <Phone className="h-3.5 w-3.5" />{restaurant.phone}
              </a>
            )}
            {restaurant.delivery_enabled ? (
              <span className="flex items-center gap-1">
                <Bike className="h-3.5 w-3.5" />
                Delivers within {restaurant.delivery_radius_km} km
                {Number(restaurant.min_order_amount) > 0 && ` · min ${rupees(restaurant.min_order_amount)}`}
                {Number(restaurant.delivery_fee) > 0 ? ` · ${rupees(restaurant.delivery_fee)} fee` : ' · free delivery'}
              </span>
            ) : (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Takeaway only</span>
            )}
          </div>
        </motion.div>

        {/* Category tabs */}
        <div className="no-scrollbar sticky top-0 z-30 -mx-4 mt-5 flex gap-2 overflow-x-auto bg-slate-50/95 px-4 py-3 backdrop-blur">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCat === cat.id ? 'bg-navy text-white' : 'bg-white text-slate-600 shadow-sm'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu sections */}
        {categories.map((cat) => {
          const catItems = itemsByCategory.get(cat.id) ?? [];
          if (catItems.length === 0) return null;
          return (
            <section
              key={cat.id}
              ref={(el) => (sectionRefs.current[cat.id] = el)}
              className="mt-6 scroll-mt-20"
            >
              <h2 className="mb-3 text-base font-bold">{cat.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {catItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    qty={qtyOf(item.id)}
                    onAdd={() => add(restaurant, item)}
                    onSetQty={setQty}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {items.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-500">
            The menu is being set up. Check back soon!
          </p>
        )}
      </div>

      {/* Floating cart button */}
      <AnimatePresence>
        {count > 0 && cart.restaurantId === restaurant.id && (
          <motion.button
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCartOpen(true)}
            className="fixed bottom-5 left-1/2 z-30 flex w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-2xl bg-navy px-5 py-3.5 text-white shadow-2xl"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="relative">
                <ShoppingBag className="h-5 w-5" />
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy">
                  {count}
                </span>
              </span>
              View cart
            </span>
            <span className="text-sm font-bold">{rupees(subtotal)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} restaurant={restaurant} />
    </div>
  );
}
