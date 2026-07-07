import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UtensilsCrossed, ArrowRight, BadgePercent, Store, Smartphone, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const PERKS = [
  { icon: BadgePercent, title: 'Zero commission', text: 'Restaurants keep 100% of every order, so you get fair prices.' },
  { icon: Store, title: 'Order direct', text: 'Straight from the restaurant — no middlemen, no markups.' },
  { icon: Smartphone, title: 'Track live', text: 'Follow your order from kitchen to doorstep in real time.' },
];

export default function Landing() {
  const [slug, setSlug] = useState('');
  const navigate = useNavigate();
  const { session } = useAuth();

  const go = (e) => {
    e.preventDefault();
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean) navigate(`/r/${clean}`);
  };

  return (
    <div className="min-h-screen bg-navy text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2 font-bold">
          <UtensilsCrossed className="h-6 w-6 text-gold" />
          <span>hungri<span className="text-gold">Order</span></span>
        </div>
        <Link
          to={session ? '/account' : '/login'}
          className="flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10"
        >
          <User className="h-4 w-4" /> {session ? 'Account' : 'Sign in'}
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Order direct.
            <br />
            <span className="text-gold">Zero commission.</span>
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            hungriOrder gives every restaurant its own online storefront. You order straight from them
            — they keep every rupee, you get better prices and fresher food.
          </p>

          <form onSubmit={go} className="mt-8 flex max-w-md overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Enter restaurant name, e.g. royal-kitchen"
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-navy outline-none placeholder:text-slate-400"
              aria-label="Restaurant slug"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-navy hover:bg-gold-dark"
            >
              Go <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Got a link like <span className="text-gold">hungriorder.com/r/royal-kitchen</span>? Just open it.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {PERKS.map((perk, i) => (
            <motion.div
              key={perk.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1 }}
              className="rounded-2xl bg-white/5 p-5 backdrop-blur"
            >
              <perk.icon className="h-6 w-6 text-gold" />
              <h3 className="mt-3 font-semibold">{perk.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{perk.text}</p>
            </motion.div>
          ))}
        </div>

        <footer className="mt-16 border-t border-white/10 pt-6 text-xs text-slate-500">
          Restaurant owner? hungriOrder is a flat yearly subscription — no per-order fees, and your
          customer data stays yours.
        </footer>
      </main>
    </div>
  );
}
