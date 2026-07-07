import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UtensilsCrossed } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    location.state?.noProfile ? 'This account is not linked to a restaurant. Contact hungriOrder support.' : ''
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) return setError('Invalid email or password.');
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-6 w-6 text-gold" />
          <span className="font-bold">
            hungri<span className="text-gold">Order</span> <span className="font-medium text-slate-400">Admin</span>
          </span>
        </div>
        <h1 className="mt-5 text-xl font-bold">Sign in to your restaurant</h1>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="input"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="input"
            autoComplete="current-password"
            required
          />
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full !py-3">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          New to hungriOrder? Contact support to get your restaurant onboarded.
        </p>
      </motion.div>
    </div>
  );
}
