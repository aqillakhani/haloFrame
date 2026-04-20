import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COPY } from '../lib/copy';

interface SavedModalProps {
  open: boolean;
  onOrderCanvas: () => void;
  onStartAnother: () => void;
  onClose: () => void;
}

// Confirmation modal shown after the user saves a tribute to their photos.
// Two outbound actions — print purchase path and "start another" — plus a
// backdrop/Esc close that returns focus to the review screen. A tab-trap
// keeps keyboard focus inside the modal while it's open; the trailing
// period on the title is load-bearing — it reads as a full-stop "done"
// moment per the 2026-04-19 claude.ai/design handoff.
export function SavedModal({ open, onOrderCanvas, onStartAnother, onClose }: SavedModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus the primary CTA once the card is in the DOM (after mount).
    const t = window.setTimeout(() => {
      primaryRef.current?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusables = cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      if (lastFocusRef.current?.focus) lastFocusRef.current.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="saved-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="saved-modal-title"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <motion.div
            ref={cardRef}
            className="saved-modal-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 12, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <button
              type="button"
              className="saved-modal-close"
              onClick={onClose}
              aria-label={COPY.saved.closeAria}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6l-12 12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <svg
              className="saved-modal-ornament"
              viewBox="0 0 200 40"
              fill="none"
              aria-hidden
            >
              <line x1="10" y1="20" x2="80" y2="20" stroke="#D4A95C" strokeWidth="1" />
              <line x1="120" y1="20" x2="190" y2="20" stroke="#D4A95C" strokeWidth="1" />
              <circle cx="100" cy="20" r="3.2" fill="#D4A95C" />
              <circle cx="100" cy="20" r="9" stroke="#D4A95C" strokeWidth="1" />
            </svg>

            <h2 id="saved-modal-title" className="saved-modal-title">
              {COPY.saved.title}
            </h2>
            <p className="saved-modal-sub">{COPY.saved.subtitle}</p>

            <div className="saved-modal-actions">
              <button
                ref={primaryRef}
                type="button"
                className="reunite-primary-btn reunite-primary-btn--full"
                onClick={onOrderCanvas}
              >
                {COPY.saved.orderCanvas}
              </button>
              <button
                type="button"
                className="reunite-ghost-btn reunite-ghost-btn--full"
                onClick={onStartAnother}
              >
                {COPY.saved.startAnother}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
