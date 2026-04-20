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
//
// Phase C: the hook also exposes action methods (signUp, signInWithPassword,
// signInWithOtp, signInWithOAuth, resetPasswordForEmail, signOut, updateUser).
// Screens call these instead of poking `supabase.auth.*` directly so the hook
// can annotate errors with tags and flip the readiness flag atomically.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AuthError,
  Provider,
  Session,
  UserAttributes,
} from '@supabase/supabase-js';
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

export interface AuthActionResult {
  ok: boolean;
  error: string | null;
  /** Present when the action returns a session (password sign-in, signUp confirmed, etc.) */
  session?: Session | null;
}

export interface UseAuthResult extends AuthState {
  signInWithPassword: (args: { email: string; password: string }) => Promise<AuthActionResult>;
  signInWithOtp: (args: { email: string; emailRedirectTo?: string }) => Promise<AuthActionResult>;
  signInWithOAuth: (args: { provider: Provider; redirectTo?: string }) => Promise<AuthActionResult>;
  signUp: (args: {
    email: string;
    password: string;
    displayName?: string;
    emailRedirectTo?: string;
  }) => Promise<AuthActionResult>;
  resetPasswordForEmail: (args: { email: string; redirectTo?: string }) => Promise<AuthActionResult>;
  updateUser: (attrs: UserAttributes) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
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

function describe(err: AuthError | Error | null | undefined): string | null {
  if (!err) return null;
  return err.message ?? 'Unexpected auth error';
}

export function useAuth(): UseAuthResult {
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

  const signInWithPassword = useCallback(
    async ({ email, password }: { email: string; password: string }): Promise<AuthActionResult> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('[auth:signInWithPassword]', error.message);
        return { ok: false, error: describe(error) };
      }
      return { ok: true, error: null, session: data.session };
    },
    [],
  );

  const signInWithOtp = useCallback(
    async ({
      email,
      emailRedirectTo,
    }: {
      email: string;
      emailRedirectTo?: string;
    }): Promise<AuthActionResult> => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (error) {
        console.error('[auth:signInWithOtp]', error.message);
        return { ok: false, error: describe(error) };
      }
      return { ok: true, error: null };
    },
    [],
  );

  const signInWithOAuth = useCallback(
    async ({
      provider,
      redirectTo,
    }: {
      provider: Provider;
      redirectTo?: string;
    }): Promise<AuthActionResult> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) {
        console.error(`[auth:signInWithOAuth:${provider}]`, error.message);
        return { ok: false, error: describe(error) };
      }
      return { ok: true, error: null };
    },
    [],
  );

  const signUp = useCallback(
    async ({
      email,
      password,
      displayName,
      emailRedirectTo,
    }: {
      email: string;
      password: string;
      displayName?: string;
      emailRedirectTo?: string;
    }): Promise<AuthActionResult> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: displayName ? { display_name: displayName } : undefined,
          emailRedirectTo,
        },
      });
      if (error) {
        console.error('[auth:signUp]', error.message);
        return { ok: false, error: describe(error) };
      }
      return { ok: true, error: null, session: data.session };
    },
    [],
  );

  const resetPasswordForEmail = useCallback(
    async ({
      email,
      redirectTo,
    }: {
      email: string;
      redirectTo?: string;
    }): Promise<AuthActionResult> => {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (error) {
        console.error('[auth:resetPasswordForEmail]', error.message);
        return { ok: false, error: describe(error) };
      }
      return { ok: true, error: null };
    },
    [],
  );

  const updateUser = useCallback(
    async (attrs: UserAttributes): Promise<AuthActionResult> => {
      const { data, error } = await supabase.auth.updateUser(attrs);
      if (error) {
        console.error('[auth:updateUser]', error.message);
        return { ok: false, error: describe(error) };
      }
      return { ok: true, error: null, session: data.user ? undefined : null };
    },
    [],
  );

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[auth:signOut]', error.message);
      return { ok: false, error: describe(error) };
    }
    return { ok: true, error: null };
  }, []);

  return useMemo(
    () => ({
      ...state,
      signInWithPassword,
      signInWithOtp,
      signInWithOAuth,
      signUp,
      resetPasswordForEmail,
      updateUser,
      signOut,
    }),
    [
      state,
      signInWithPassword,
      signInWithOtp,
      signInWithOAuth,
      signUp,
      resetPasswordForEmail,
      updateUser,
      signOut,
    ],
  );
}
