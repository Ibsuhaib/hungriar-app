import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setRestaurant(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Unified project: admins are linked to their restaurant via
      // restaurant_admins (same table the main hungriAR admin panel uses).
      const { data: p } = await supabase
        .from('restaurant_admins')
        .select('id, restaurant_id, user_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setProfile(p ?? null);
      if (p) {
        const { data: r } = await supabase.from('restaurants').select('*').eq('id', p.restaurant_id).maybeSingle();
        if (!cancelled) setRestaurant(r ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo(() => {
    const expired =
      restaurant?.subscription_expiry && new Date(restaurant.subscription_expiry) < new Date();
    return {
      session,
      profile,
      restaurant,
      loading,
      expired: Boolean(expired) || restaurant?.is_active === false,
      // Restaurants with the full hungriAR POS manage online orders from the
      // main admin panel instead of this lightweight app.
      hasHungriar: restaurant ? restaurant.has_hungriar !== false : false,
      setRestaurant,
      signOut: () => supabase.auth.signOut(),
    };
  }, [session, profile, restaurant, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
