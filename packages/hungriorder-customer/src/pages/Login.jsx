import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Smartphone, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState('phone'); // phone | otp
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const e164 = `+91${cleanPhone}`;

  const sendOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) return setError('Enter a valid 10-digit mobile number.');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes('provider')
          ? 'Phone sign-in is not configured yet. You can still order as a guest.'
          : err.message
      );
      return;
    }
    setStep('otp');
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ phone: e164, token: otp.trim(), type: 'sms' });
    setBusy(false);
    if (err) return setError('Invalid code. Please try again.');
    navigate('/account', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <Link to="/" aria-label="Back" className="rounded-full p-1.5 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold">Sign in</h1>
      </header>

      <main className="mx-auto w-full max-w-sm flex-1 px-5 pt-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy">
            {step === 'phone' ? (
              <Smartphone className="h-7 w-7 text-gold" />
            ) : (
              <KeyRound className="h-7 w-7 text-gold" />
            )}
          </div>
          <h2 className="mt-5 text-xl font-bold">
            {step === 'phone' ? 'Sign in with your phone' : 'Enter the code'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {step === 'phone'
              ? 'Save addresses, see order history and reorder in one tap.'
              : `We sent a 6-digit code to ${e164}.`}
          </p>

          {step === 'phone' ? (
            <form onSubmit={sendOtp} className="mt-6 space-y-4">
              <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-gold">
                <span className="flex items-center bg-slate-50 px-3 text-sm text-slate-500">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="min-w-0 flex-1 px-3 py-3 text-sm outline-none"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl bg-navy py-3.5 font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="mt-6 space-y-4">
              <input
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-gold"
                autoFocus
              />
              <button
                type="submit"
                disabled={busy || otp.length < 6}
                className="w-full rounded-2xl bg-navy py-3.5 font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button type="button" onClick={() => setStep('phone')} className="w-full text-sm text-slate-500 underline">
                Change number
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
