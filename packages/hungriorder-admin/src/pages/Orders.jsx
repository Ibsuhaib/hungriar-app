import { useEffect, useMemo, useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import OrderCard from '../components/OrderCard.jsx';
import Spinner from '../components/Spinner.jsx';

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function Orders() {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState('active');
  const [newOrderFlash, setNewOrderFlash] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!restaurant) return;
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurant.id)
      .in('order_type', ['delivery', 'takeaway'])
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders(data ?? []);
  }, [restaurant?.id]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Live updates: new orders and status changes for this restaurant.
  useEffect(() => {
    if (!restaurant) return;
    const channel = supabase
      .channel(`admin-orders-${restaurant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNewOrderFlash(true);
            setTimeout(() => setNewOrderFlash(false), 4000);
            fetchOrders(); // refetch to include order_items
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) =>
              prev?.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o)) ?? prev
            );
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [restaurant?.id, fetchOrders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (tab === 'active') return orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
    if (tab === 'completed') return orders.filter((o) => o.status === 'delivered');
    return orders.filter((o) => o.status === 'cancelled');
  }, [orders, tab]);

  const onStatusChange = (id, status) =>
    setOrders((prev) => prev?.map((o) => (o.id === id ? { ...o, status } : o)) ?? prev);

  const counts = useMemo(() => {
    if (!orders) return {};
    return {
      active: orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
      completed: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    };
  }, [orders]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Orders</h1>
          <p className="mt-0.5 text-sm text-slate-500">Updates arrive live — no need to refresh.</p>
        </div>
        {newOrderFlash && (
          <span className="flex animate-pulse items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-bold text-navy">
            <Bell className="h-4 w-4" /> New order!
          </span>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t.key ? 'bg-navy text-white' : 'bg-white text-slate-600 shadow-sm'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && ` (${counts[t.key]})`}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {orders === null ? (
          <div className="flex justify-center pt-16"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <p className="card py-10 text-center text-sm text-slate-500">
            No {tab} orders right now.
          </p>
        ) : (
          filtered.map((o) => (
            <OrderCard key={o.id} order={o} restaurant={restaurant} onStatusChange={onStatusChange} />
          ))
        )}
      </div>
    </div>
  );
}
