import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { reportContent } from '../lib/api';
import type { ReportContentInput, ReportReason } from '../lib/api';

/**
 * Bottom sheet shown when a viewer wants to report a tribute. Five canonical
 * reason radios + optional note. Submits to /api/report; the server records
 * to the `reports` table and tags `tributes.flagged_at`. Required by Google
 * Play AI Content Policy (user-side reporting).
 */
export interface ReportContentSheetProps {
  open: boolean;
  tributeId: string;
  onClose: () => void;
}

const REASONS: Array<{ id: ReportReason; label: string }> = [
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'misuse', label: 'Misuse / impersonation' },
  { id: 'wrong_person', label: 'Wrong person rendered' },
  { id: 'quality', label: 'Quality issue' },
  { id: 'other', label: 'Something else' },
];

export function ReportContentSheet({
  open,
  tributeId,
  onClose,
}: ReportContentSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset state when the sheet closes so a re-open is fresh.
  useEffect(() => {
    if (!open) {
      setReason(null);
      setNote('');
      setSubmitting(false);
      setErr(null);
    }
  }, [open]);

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setErr(null);
    try {
      const input: ReportContentInput = {
        tributeId,
        reason,
        note: note.trim() || undefined,
      };
      await reportContent(input);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit report');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="report-sheet-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-sheet-heading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="report-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <h3 id="report-sheet-heading" className="report-sheet-heading">
              Report this tribute
            </h3>
            <p className="report-sheet-sub">
              Tell us what&rsquo;s wrong. We review every report within 24 hours.
            </p>

            <fieldset className="report-sheet-reasons">
              <legend className="visually-hidden">Reason</legend>
              {REASONS.map((r) => (
                <label key={r.id} className="report-sheet-reason">
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.id}
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>

            <textarea
              className="report-sheet-note"
              placeholder="Anything else we should know? (optional)"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {err && (
              <p className="report-sheet-error" role="alert">
                {err}
              </p>
            )}

            <div className="report-sheet-actions">
              <button
                type="button"
                className="report-sheet-cancel"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="report-sheet-submit"
                onClick={() => void handleSubmit()}
                disabled={!reason || submitting}
              >
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
