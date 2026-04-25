import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Apple guideline 5.1.2(i) compliance: shown before the user's first photo
 * upload. Names the third-party AI processor (fal.ai), states the data
 * boundary (encrypted in transit, never used to train models, deletable),
 * and gates the upload until the user explicitly accepts.
 *
 * Pattern matches AuthGateModal — `auth-gate-scrim` style scrim + framer-
 * motion AnimatePresence — but uses an `ai-consent-*` namespace so the two
 * modals can theme independently if needed.
 */
export interface AIConsentModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function AIConsentModal({ open, onAccept, onDecline }: AIConsentModalProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  // Close on escape — mirror AuthGateModal's UX. Decline path so the user
  // hasn't implicitly consented just by dismissing.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onDecline]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ai-consent-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-consent-heading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="ai-consent-sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <h2
              id="ai-consent-heading"
              ref={headingRef}
              tabIndex={-1}
              className="ai-consent-heading"
            >
              Your photos, your choice
            </h2>

            <div className="ai-consent-body">
              <p>
                haloFrame creates memorial portraits using AI. To do this, the
                photos you upload are sent to our AI partner,{' '}
                <strong>fal.ai</strong>, for processing.
              </p>
              <p>
                Your photos are encrypted in transit, never shared beyond
                processing, and never used to train AI models. You can delete
                them and your account at any time from Settings.
              </p>
              <p>
                Read the full{' '}
                <a
                  className="ai-consent-link"
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            <div className="ai-consent-actions">
              <button
                type="button"
                className="ai-consent-primary"
                onClick={onAccept}
              >
                I understand &mdash; continue
              </button>
              <button
                type="button"
                className="ai-consent-secondary"
                onClick={onDecline}
              >
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
