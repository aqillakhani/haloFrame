import { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';

/**
 * Shown when an anonymous user taps Save or any other commit action. Gives
 * them the 4 sign-in options. Hit-testing uses `useEffect`+ refs rather than
 * a library to keep the bundle small; focus trap is minimal because we only
 * have 5 interactive elements.
 *
 * On successful sign-in (picked up by `useAuth`'s `onAuthStateChange`),
 * `onAuthed` fires and the parent typically retries whatever action the
 * user was trying to commit to before the gate popped.
 */
export interface AuthGateModalProps {
  open: boolean;
  onClose: () => void;
  /** Fires when a new session appears while this modal is open. */
  onAuthed?: () => void;
}

function oauthRedirect(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?auth=callback`;
}

export function AuthGateModal({ open, onClose, onAuthed }: AuthGateModalProps) {
  const { push } = useNavigation();
  const { signInWithOAuth, session, isAnonymous } = useAuth();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on escape. No-op when not open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Fire `onAuthed` when an anonymous user becomes authenticated.
  const prevAnonRef = useRef(isAnonymous);
  useEffect(() => {
    if (!open) return;
    if (prevAnonRef.current && !isAnonymous && session) {
      onAuthed?.();
    }
    prevAnonRef.current = isAnonymous;
  }, [open, isAnonymous, session, onAuthed]);

  const goEmail = useCallback(() => {
    onClose();
    push('SIGN_IN');
  }, [onClose, push]);

  const goSignUp = useCallback(() => {
    onClose();
    push('SIGN_UP');
  }, [onClose, push]);

  const goOAuth = useCallback(
    async (provider: 'google' | 'apple') => {
      const res = await signInWithOAuth({ provider, redirectTo: oauthRedirect() });
      if (!res.ok) {
        // If the browser blocked the popup/redirect (e.g. locally without an
        // actual OAuth provider), fall back to email on SIGN_IN.
        onClose();
        push('SIGN_IN');
      }
    },
    [signInWithOAuth, onClose, push],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="auth-gate-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-gate-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            // Close on backdrop click; ignore clicks inside the sheet.
            if (
              sheetRef.current &&
              e.target instanceof Node &&
              !sheetRef.current.contains(e.target)
            ) {
              onClose();
            }
          }}
        >
          <motion.div
            ref={sheetRef}
            className="auth-gate-sheet"
            style={{ position: 'relative' }}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <button
              type="button"
              className="auth-gate-close"
              aria-label="Close"
              onClick={onClose}
            >
              {'\u00d7'}
            </button>
            <span className="auth-gate-eyebrow">{COPY.auth.gateEyebrow}</span>
            <h2 id="auth-gate-title" className="auth-gate-headline">
              {COPY.auth.gateHeadline}
            </h2>
            <p className="auth-gate-sub">{COPY.auth.gateSubline}</p>
            <div className="auth-gate-methods">
              <button
                type="button"
                className="auth-gate-method"
                onClick={goEmail}
              >
                Email
              </button>
              <button
                type="button"
                className="auth-gate-method"
                onClick={() => { void goOAuth('google'); }}
              >
                Google
              </button>
              <button
                type="button"
                className="auth-gate-method"
                onClick={() => { void goOAuth('apple'); }}
              >
                Apple
              </button>
              <button
                type="button"
                className="auth-gate-method"
                onClick={goSignUp}
              >
                Create
              </button>
            </div>
            <p className="auth-gate-fine">{COPY.auth.gateFine}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
