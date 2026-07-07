import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setCustomer(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        setCustomer(data);
      } else {
        const row = { id: session.user.id, phone: session.user.phone?.replace(/^91/, '') || null };
        const { data: created } = await supabase.from('customers').insert(row).select().maybeSingle();
        if (!cancelled) setCustomer(created ?? row);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({
      session,
      customer,
      loading,
      refreshCustomer: async () => {
        if (!session?.user) return;
        const { data } = await supabase.from('customers').select('*').eq('id', session.user.id).maybeSingle();
        if (data) setCustomer(data);
      },
      signOut: () => supabase.auth.signOut(),
    }),
    [session, customer, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
