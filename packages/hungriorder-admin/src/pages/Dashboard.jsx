import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, IndianRupee, Hourglass, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Spinner from '../components/Spinner.jsx';
import { rupees, shortId, timeAgo } from '../lib/format.js';

export default function Dashboard() {
  const { restaurant } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (!restaurant) return;
    let cancelled = false;
    (async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [{ data: today }, { count: pendingCount }, { data: recentOrders }] = await Promise.all([
        supabase
          .from('orders')
          .select('total_amount, status')
          .eq('restaurant_id', restaurant.id)
          .in('order_type', ['delivery', 'takeaway'])
          .gte('created_at', startOfDay.toISOString()),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurant.id)
          .in('order_type', ['delivery', 'takeaway'])
          .eq('status', 'pending'),
        supabase
          .from('orders')
          .select('id, status, total_amount, customer_name, created_at, order_type')
          .eq('restaurant_id', restaurant.id)
          .in('order_type', ['delivery', 'takeaway'])
          .order('created_at', { ascending: false })
          .limit(8),
      ]);
      if (cancelled) return;
      const valid = (today ?? []).filter((o) => o.status !== 'cancelled');
      setStats({
        todayOrders: valid.length,
        todayRevenue: valid.reduce((s, o) => s + Number(o.total_amount), 0),
        pending: pendingCount ?? 0,
      });
      setRecent(recentOrders ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurant?.id]);

  if (!stats) return <div className="flex justify-center pt-20"><Spinner /></div>;

  const cards = [
    { label: "Today's orders", value: stats.todayOrders, icon: ClipboardList },
    { label: "Today's revenue", value: rupees(stats.todayRevenue), icon: IndianRupee },
    { label: 'Pending orders', value: stats.pending, icon: Hourglass, alert: stats.pending > 0 },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">Dashboard</h1>
      <p className="mt-0.5 text-sm text-slate-500">Welcome back — here's how {restaurant?.name} is doing today.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, alert }) => (
          <div key={label} className={`card ${alert ? 'ring-2 ring-gold' : ''}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <Icon className="h-5 w-5 text-gold" />
            </div>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 card !p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold">Recent orders</h2>
          <Link to="/orders" className="flex items-center gap-1 text-xs font-semibold text-navy">
            All orders <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No orders yet. Share your storefront link to start receiving orders!
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    #{shortId(o.id)} <span className="font-normal text-slate-500">· {o.customer_name || 'Customer'}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {timeAgo(o.created_at)} · {o.order_type}
                  </p>
                </div>
                <StatusBadge status={o.status} />
                <span className="w-20 text-right text-sm font-bold">{rupees(o.total_amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
