import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface SessionState {
  session: Session | null;
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

/**
 * The signed-in user's id, read from the session the provider already holds.
 *
 * `supabase.auth.getUser()` validates the token with the Auth server on every
 * call, which puts a network round trip in front of every write. This value
 * comes from the session in memory. It is not a trust boundary: the database
 * still applies `auth.uid()` through RLS, so a stale or tampered id cannot
 * reach another account's rows.
 */
export function useUserId(): string | null {
  const { session } = useSession();
  return session?.user.id ?? null;
}
