import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Spinner from './components/Spinner.jsx';

const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const Menu = lazy(() => import('./pages/Menu.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Expired = lazy(() => import('./pages/Expired.jsx'));

const HUNGRIAR_ADMIN_URL = import.meta.env.VITE_HUNGRIAR_ADMIN_URL || 'https://hungriar.app/admin';

// Shown to admins of restaurants that have the full hungriAR POS — their
// online orders live in the main admin panel, not this lightweight app.
function UseMainAdmin() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 text-center">
      <h1 className="text-xl font-bold text-white">Your restaurant uses hungriAR POS</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-400">
        Online orders for your restaurant arrive directly in the main hungriAR admin panel
        (Orders → Delivery/Takeaway tabs), together with your dine-in orders.
      </p>
      <a
        href={HUNGRIAR_ADMIN_URL}
        className="mt-6 flex items-center gap-2 rounded-2xl bg-gold px-6 py-3 font-semibold text-navy"
      >
        <ExternalLink className="h-4 w-4" /> Open hungriAR Admin
      </a>
      <button onClick={() => signOut()} className="mt-4 text-sm text-slate-500 underline">
        Sign out
      </button>
    </div>
  );
}

function Protected({ children }) {
  const { session, profile, restaurant, loading, expired, hasHungriar } = useAuth();
  if (loading) return <Spinner full />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile || !restaurant) return <Navigate to="/login" replace state={{ noProfile: true }} />;
  if (hasHungriar) return <UseMainAdmin />;
  if (expired) return <Navigate to="/expired" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner full />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/expired" element={<Expired />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/orders" element={<Protected><Orders /></Protected>} />
            <Route path="/menu" element={<Protected><Menu /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
