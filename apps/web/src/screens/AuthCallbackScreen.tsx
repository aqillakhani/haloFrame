import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { heroText } from '../lib/motion';

/**
 * OAuth + magic-link return landing. Supabase embeds the session in the URL
 * hash (`#access_token=…`) on implicit-flow returns and the client picks it
 * up automatically via `detectSessionInUrl`. We have that disabled on the
 * singleton (see lib/supabase.ts) so we need to handle it explicitly when we
 * land here. Otherwise this screen just waits for `onAuthStateChange` to
 * confirm the session and bounces home.
 */
export function AuthCallbackScreen() {
  const { push, reset } = useNavigation();
  const { session, isReady } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // We flip to `HOME` as soon as a session appears. `useAuth` subscribes
    // to `onAuthStateChange`, so a successful OAuth callback lands us with
    // a session even when `detectSessionInUrl` is off.
    if (isReady && session) {
      reset();
      return;
    }
    // If after a few seconds there's still no session, assume the exchange
    // failed and show the recovery CTA.
    const timer = setTimeout(() => {
      if (!session) setError('timeout');
    }, 8000);
    return () => clearTimeout(timer);
  }, [isReady, session, reset]);

  return (
    <div className="auth-screen auth-screen-callback">
      <motion.header
        className="auth-header"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        {!error ? (
          <>
            <span className="auth-eyebrow" aria-live="polite">
              {COPY.auth.callback.working}
            </span>
            <p className="auth-sub">{COPY.auth.callback.working2}</p>
          </>
        ) : (
          <>
            <h1 className="auth-headline">{COPY.auth.callback.errorHeading}</h1>
            <p className="auth-sub">{COPY.auth.callback.errorSub}</p>
            <button
              type="button"
              className="btn btn-primary auth-submit"
              onClick={() => push('SIGN_IN')}
            >
              {COPY.auth.callback.errorCta}
            </button>
          </>
        )}
      </motion.header>
    </div>
  );
}
