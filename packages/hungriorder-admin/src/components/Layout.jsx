import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, UtensilsCrossed, Settings, LogOut, Menu as MenuIcon, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }) {
  const { restaurant, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {LINKS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-gold text-navy' : 'text-slate-300 hover:bg-white/10'
            }`
          }
        >
          <Icon className="h-5 w-5" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      <a
        href={`${import.meta.env.VITE_STOREFRONT_URL || `${window.location.protocol}//${window.location.host.replace('admin.', '')}`}/r/${restaurant?.slug}`}
        target="_blank"
        rel="noreferrer"
        className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-400 hover:bg-white/10"
      >
        <ExternalLink className="h-4 w-4" /> View storefront
      </a>
      <button
        onClick={async () => {
          await signOut();
          navigate('/login');
        }}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-400 hover:bg-white/10"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-navy py-5 md:flex">
        <div className="mb-6 px-6">
          <p className="font-bold text-white">
            hungri<span className="text-gold">Order</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{restaurant?.name}</p>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 md:hidden">
        <p className="font-bold text-white">
          hungri<span className="text-gold">Order</span>
        </p>
        <button aria-label="Open menu" onClick={() => setOpen(!open)} className="rounded-lg p-1.5 text-white">
          {open ? <X className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-20 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute inset-y-0 left-0 flex w-60 flex-col bg-navy pb-4 pt-16"
            onClick={(e) => e.stopPropagation()}
          >
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-10 pt-16 md:ml-60 md:px-8 md:pt-8">
        <div className="mx-auto max-w-5xl">
          {profile && children}
        </div>
      </main>
    </div>
  );
}
