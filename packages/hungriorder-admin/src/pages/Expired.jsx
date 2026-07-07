import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Expired() {
  const { restaurant, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <h1 className="mt-5 text-xl font-bold text-white">Subscription expired</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        {restaurant?.name ? `${restaurant.name}'s` : 'Your'} hungriOrder subscription has ended, so new
        online orders are paused. Contact hungriOrder support to renew and get back online within
        minutes.
      </p>
      <a href="mailto:support@hungriorder.com" className="mt-6 rounded-2xl bg-gold px-6 py-3 font-semibold text-navy">
        Contact support
      </a>
      <button
        onClick={async () => {
          await signOut();
          navigate('/login');
        }}
        className="mt-4 text-sm text-slate-500 underline"
      >
        Sign out
      </button>
    </div>
  );
}
