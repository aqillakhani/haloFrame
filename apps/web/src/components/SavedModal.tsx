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
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <motion.div
            className="saved-modal-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.56, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <motion.div
              className="saved-modal-badge"
              aria-hidden
              initial={{ scale: 0.82, opacity: 0 }}
              animate={{ scale: [0.82, 1.08, 1], opacity: 1 }}
              transition={{
                duration: 0.72,
                ease: [0.22, 0.61, 0.36, 1],
                delay: 0.16,
                times: [0, 0.6, 1],
              }}
            >
              <Icon name="check" size={26} />
            </motion.div>
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
