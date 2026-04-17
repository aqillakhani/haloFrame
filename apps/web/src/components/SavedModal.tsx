import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COPY } from '../lib/copy';
import { Icon } from './icons/Icon';

interface SavedModalProps {
  open: boolean;
  onOrderCanvas: () => void;
  onStartAnother: () => void;
  onClose: () => void;
}

// Confirmation modal shown after the user saves a tribute to their photos.
// Two outbound actions — print purchase path and "start another" — plus a
// backdrop/Esc close that returns focus to the review screen.
export function SavedModal({ open, onOrderCanvas, onStartAnother, onClose }: SavedModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="saved-modal-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="saved-modal-badge" aria-hidden>
              <Icon name="check" size={24} />
            </div>
            <h2 id="saved-modal-title" className="t-display-md">
              {COPY.saved.title}
            </h2>
            <p className="t-body-md t-muted saved-modal-sub">{COPY.saved.subtitle}</p>
            <div className="saved-modal-actions">
              <button
                type="button"
                className="btn btn-primary saved-modal-action"
                onClick={onOrderCanvas}
              >
                {COPY.saved.orderCanvas}
              </button>
              <button
                type="button"
                className="btn btn-ghost saved-modal-action"
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
