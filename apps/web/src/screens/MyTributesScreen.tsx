import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Tribute } from '@haloframe/shared';
import { useNavigation } from '../lib/navigation';
import { useAuth } from '../hooks/useAuth';
import { useTributes } from '../hooks/useTributes';
import { triggerDownload } from '../lib/download';
import {
  ApiRequestError,
  startCanvasCheckout,
  type CanvasSize,
} from '../lib/api';
import { COPY } from '../lib/copy';
import { AIBadge } from '../components/AIBadge';

const CANVAS_SIZE_OPTIONS: Array<{ size: CanvasSize; price: string; label: string }> = [
  { size: '12x16', price: '$49', label: '12 × 16 in' },
  { size: '18x24', price: '$79', label: '18 × 24 in' },
  { size: '24x36', price: '$119', label: '24 × 36 in' },
  { size: '36x48', price: '$179', label: '36 × 48 in' },
];

/*
 * 2026-04-21 (Phase E). The header + empty state keep their editorial port
 * from the redesign. A populated state landed on top: a 2-col gallery of
 * saved tributes, a lightbox sheet with Download / Order Canvas / Delete,
 * and a confirm dialog for delete. Data comes from `useTributes()`.
 */

const gentleEase = [0.22, 0.61, 0.36, 1] as const;

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function flowLabel(t: Tribute): string {
  return t.flowType === 'reunite' || t.flowType === 'pet_reunite'
    ? COPY.myTributes.flowLabelReunite
    : COPY.myTributes.flowLabelEnhance;
}

export function MyTributesScreen() {
  const nav = useNavigation();
  const reduceMotion = useReducedMotion();
  const { isAnonymous, isReady } = useAuth();
  const { tributes, isLoading, error, remove } = useTributes();
  const [openTribute, setOpenTribute] = useState<Tribute | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Tribute | null>(null);
  const [printPicker, setPrintPicker] = useState<Tribute | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printSubmitting, setPrintSubmitting] = useState<CanvasSize | null>(null);

  async function handleOrderCanvas(tribute: Tribute, size: CanvasSize) {
    setPrintSubmitting(size);
    setPrintError(null);
    try {
      const result = await startCanvasCheckout({
        tributeId: tribute.id,
        size,
        successUrl: `${window.location.origin}/?print=success`,
        cancelUrl: `${window.location.origin}/?print=cancel`,
      });
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        (err.details as { code?: string })?.code === 'web_checkout_not_configured'
      ) {
        setPrintError(
          'Canvas checkout is still spinning up. We\u2019ll open this shortly.',
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Checkout failed';
        setPrintError(msg);
      }
    } finally {
      setPrintSubmitting(null);
    }
  }

  const hasTributes = tributes.length > 0;
  const createTribute = () => nav.setTab('HOME');

  const anim = (delay: number) =>
    reduceMotion
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, ease: gentleEase, delay },
        };

  // Pre-compute per-tribute display metadata so the gallery render is lean.
  const cards = useMemo(
    () =>
      tributes.map((t) => ({
        tribute: t,
        name: t.state.textOverlay?.name ?? null,
        dateLabel: formatDateLabel(t.createdAt),
        imageUrl: t.signedImageUrl ?? null,
      })),
    [tributes],
  );

  return (
    <div className="my-tributes" data-state={hasTributes ? 'populated' : 'empty'}>
      <header className="my-tributes-header">
        <motion.div className="my-tributes-eyebrow" {...anim(0)}>
          {COPY.myTributes.eyebrow}
        </motion.div>
        <motion.h1 className="my-tributes-title" {...anim(0.06)}>
          {COPY.myTributes.headingBefore}
          <span className="my-tributes-italic-accent">
            {COPY.myTributes.headingItalic}
            <svg
              className="my-tributes-underline"
              viewBox="0 0 120 8"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M 2 5 Q 30 1, 60 4 T 118 3" />
            </svg>
          </span>
          {COPY.myTributes.headingAfter}
        </motion.h1>
        <motion.p className="my-tributes-subhead" {...anim(0.12)}>
          {COPY.myTributes.subhead}
        </motion.p>
      </header>

      {/* Anon users can't have persisted tributes — bridge is disabled. */}
      {isReady && isAnonymous && (
        <section className="my-tributes-anon">
          <h2>{COPY.myTributes.signedInRequiredHeading}</h2>
          <p>{COPY.myTributes.signedInRequiredBody}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => nav.push('SIGN_IN')}
          >
            {COPY.myTributes.signedInRequiredCta}
          </button>
        </section>
      )}

      {isReady && !isAnonymous && isLoading && !hasTributes && (
        <p className="my-tributes-loading" aria-live="polite">
          {COPY.myTributes.loadingLabel}
        </p>
      )}

      {isReady && !isAnonymous && error && !isLoading && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      {isReady && !isAnonymous && hasTributes && (
        <>
          <motion.ul
            className="my-tributes-grid"
            role="list"
            {...anim(0.18)}
          >
            {cards.map(({ tribute, name, dateLabel, imageUrl }) => (
              <li key={tribute.id} className="my-tributes-card">
                <button
                  type="button"
                  className="my-tributes-card-btn"
                  aria-label={COPY.myTributes.cardAriaLabel(name, dateLabel)}
                  onClick={() => setOpenTribute(tribute)}
                >
                  <span className="my-tributes-card-frame">
                    {imageUrl ? (
                      <img src={imageUrl} alt={name ?? ''} loading="lazy" />
                    ) : (
                      <span className="my-tributes-card-placeholder" />
                    )}
                  </span>
                  <span className="my-tributes-card-meta">
                    <span className="my-tributes-card-name">
                      {name ?? COPY.myTributes.cardUntitled}
                    </span>
                    <span className="my-tributes-card-date">
                      {flowLabel(tribute)} · {dateLabel}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
          <motion.p className="my-tributes-footline" {...anim(0.28)}>
            {COPY.myTributes.galleryFootline(tributes.length)}
          </motion.p>
        </>
      )}

      {isReady && !isAnonymous && !hasTributes && !isLoading && (
        <section className="my-tributes-empty-wrap" aria-labelledby="my-tributes-empty-title">
          <motion.div
            className="my-tributes-ghost-frame my-tributes-framed"
            aria-hidden="true"
            {...anim(0.18)}
          >
            <span className="my-tributes-corner tl" />
            <span className="my-tributes-corner tr" />
            <span className="my-tributes-corner bl" />
            <span className="my-tributes-corner br" />
            <div className="my-tributes-halo-glyph">
              <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
                <ellipse cx="50" cy="36" rx="30" ry="7" fill="none" stroke="#D4A95C" strokeWidth="1.2" opacity="0.9" />
                <ellipse cx="50" cy="36" rx="22" ry="5" fill="none" stroke="#D4A95C" strokeWidth="0.8" opacity="0.5" />
                <path d="M 50 46 Q 38 46 36 62 L 36 82 Q 36 86 40 86 L 60 86 Q 64 86 64 82 L 64 62 Q 62 46 50 46 Z" fill="none" stroke="#8A7E6E" strokeWidth="1" opacity="0.6" />
              </svg>
            </div>
          </motion.div>

          <motion.h2 className="my-tributes-empty-title" id="my-tributes-empty-title" {...anim(0.24)}>
            {COPY.myTributes.emptyTitle}
          </motion.h2>

          <motion.p className="my-tributes-empty-body" {...anim(0.3)}>
            {COPY.myTributes.emptyBody}
          </motion.p>

          <motion.div className="my-tributes-empty-ctas" {...anim(0.36)}>
            <button
              type="button"
              className="btn btn-primary"
              aria-label={COPY.myTributes.emptyCtaAria}
              onClick={createTribute}
            >
              {COPY.myTributes.emptyCta}
            </button>
            <button type="button" className="btn btn-ghost" onClick={createTribute}>
              {COPY.myTributes.emptySecondaryCta}
            </button>
          </motion.div>

          <motion.div className="my-tributes-ornament" aria-hidden="true" {...anim(0.42)}>
            <span className="my-tributes-ornament-line" />
            <span className="my-tributes-ornament-dot" />
            <span className="my-tributes-ornament-line" />
          </motion.div>
        </section>
      )}

      <AnimatePresence>
        {openTribute && (
          <motion.div
            className="my-tributes-lightbox-scrim"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpenTribute(null);
            }}
          >
            <motion.div
              className="my-tributes-lightbox-sheet"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            >
              <button
                type="button"
                className="my-tributes-lightbox-close"
                aria-label={COPY.myTributes.lightbox.closeAria}
                onClick={() => setOpenTribute(null)}
              >
                {'\u00d7'}
              </button>
              {openTribute.signedImageUrl ? (
                <div className="my-tributes-lightbox-img-wrap">
                  <img
                    src={openTribute.signedImageUrl}
                    alt={openTribute.state.textOverlay?.name ?? ''}
                    className="my-tributes-lightbox-img"
                  />
                  <div className="lightbox-ai-badge">
                    <AIBadge size="sm" />
                  </div>
                </div>
              ) : (
                <div className="my-tributes-lightbox-placeholder" />
              )}
              <div className="my-tributes-lightbox-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!openTribute.signedImageUrl}
                  onClick={() => {
                    if (openTribute.signedImageUrl) {
                      void triggerDownload(openTribute.signedImageUrl);
                    }
                  }}
                >
                  {COPY.myTributes.lightbox.download}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPrintPicker(openTribute);
                    setPrintError(null);
                  }}
                >
                  {COPY.myTributes.lightbox.orderCanvas}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost my-tributes-lightbox-delete"
                  onClick={() => setConfirmDelete(openTribute)}
                >
                  {COPY.myTributes.lightbox.deleteCta}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {printPicker && (
          <motion.div
            className="my-tributes-confirm-scrim"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPrintPicker(null);
            }}
          >
            <motion.div
              className="my-tributes-confirm-sheet"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            >
              <h3>Choose a canvas size</h3>
              <p>A museum-quality wrapped canvas, shipped in 5–7 business days.</p>
              {printError && <p className="auth-error" role="alert">{printError}</p>}
              <ul className="my-tributes-print-sizes" role="list">
                {CANVAS_SIZE_OPTIONS.map((opt) => (
                  <li key={opt.size}>
                    <button
                      type="button"
                      className="btn btn-ghost my-tributes-print-size"
                      disabled={printSubmitting !== null}
                      onClick={() => {
                        if (printPicker) void handleOrderCanvas(printPicker, opt.size);
                      }}
                    >
                      <span>{opt.label}</span>
                      <span className="my-tributes-print-size-price">
                        {printSubmitting === opt.size ? '\u2026' : opt.price}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="my-tributes-confirm-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPrintPicker(null)}
                  disabled={printSubmitting !== null}
                >
                  Never mind
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="my-tributes-confirm-scrim"
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="my-tributes-confirm-sheet"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            >
              <h3>{COPY.myTributes.lightbox.deleteConfirmTitle}</h3>
              <p>{COPY.myTributes.lightbox.deleteConfirmBody}</p>
              <div className="my-tributes-confirm-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setConfirmDelete(null)}
                >
                  {COPY.myTributes.lightbox.deleteConfirmCancel}
                </button>
                <button
                  type="button"
                  className="btn btn-primary my-tributes-confirm-danger"
                  onClick={async () => {
                    const victim = confirmDelete;
                    setConfirmDelete(null);
                    setOpenTribute(null);
                    if (victim) {
                      await remove(victim.id);
                    }
                  }}
                >
                  {COPY.myTributes.lightbox.deleteConfirmConfirm}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
