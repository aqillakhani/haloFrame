// =============================================================================
// HaloFrame web — useAuth hook
//
// Source of truth for the current Supabase session. On cold load the hook:
//   1. Reads any persisted session from localStorage (supabase-js default).
//   2. If none exists, signs in anonymously so every user has a stable
//      id that the credit ledger can reference. This is the bootstrap for
//      the "2 free tributes" grant — the DB trigger fires on auth.users
//      insert and seeds the profile + ledger row.
//
// Anonymous sign-in requires "Allow anonymous sign-ins" to be enabled in
// the Supabase dashboard (Auth → Providers → Anonymous). The app still
// loads if it's disabled — users just see unauthenticated-flow behavior
// and any /api/subscription/* call 401s with a recoverable error.
// =============================================================================
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthState {
  /** Becomes true once the initial session lookup + optional anon sign-in resolves. */
  isReady: boolean;
  session: Session | null;
  userId: string | null;
  /** Anonymous users have no email; the UI treats them as "unregistered". */
  isAnonymous: boolean;
  /** True if we hit a fatal error during bootstrap (e.g. anon sign-ins disabled). */
  error: string | null;
}

const INITIAL_STATE: AuthState = {
  isReady: false,
  session: null,
  userId: null,
  isAnonymous: false,
  error: null,
};

function fromSession(session: Session | null, error: string | null = null): AuthState {
  return {
    isReady: true,
    session,
    userId: session?.user.id ?? null,
    isAnonymous: session?.user.is_anonymous === true,
    error,
  };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  useEffect(() => {
    let disposed = false;

    async function bootstrap() {
      const { data: existing } = await supabase.auth.getSession();
      if (disposed) return;

      if (existing.session) {
        setState(fromSession(existing.session));
        return;
      }

      // No session → sign in anonymously so the user gets a profile row +
      // the 2-credit signup grant. Propagate the error verbatim when the
      // provider is disabled so the UI can show a clear message.
      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (disposed) return;
      if (error || !anon.session) {
        setState(fromSession(null, error?.message ?? 'Anonymous sign-in failed'));
        return;
      }
      setState(fromSession(anon.session));
    }

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      setState(fromSession(session));
    });

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
