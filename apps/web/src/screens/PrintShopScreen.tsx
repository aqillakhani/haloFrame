import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COPY } from '../lib/copy';
import { useNavigation } from '../lib/navigation';
import { useTributes } from '../hooks/useTributes';

type CanvasGroup = 'small' | 'medium' | 'large';
type Filter = 'all' | CanvasGroup;

interface CanvasOption {
  id: string;
  widthIn: number;
  heightIn: number;
  group: CanvasGroup;
  priceCents: number;
  /** Gold "Most loved" chip in the top-right of the card. At most one option. */
  mostLoved?: boolean;
}

// Canvas pricing — kept inline (not in shared constants) so the swap to real
// print-provider pricing stays a single-file change. Sizes + prices from the
// approved pricing sheet (2026-04-18). Per-size descriptions live in
// COPY.printShop.sizeDescriptions, keyed by id.
const CANVAS_OPTIONS: CanvasOption[] = [
  { id: 'canvas_8x10',  widthIn:  8, heightIn: 10, group: 'small',  priceCents: 4699 },
  { id: 'canvas_8x12',  widthIn:  8, heightIn: 12, group: 'small',  priceCents: 4799 },
  { id: 'canvas_12x12', widthIn: 12, heightIn: 12, group: 'small',  priceCents: 5099 },
  { id: 'canvas_12x16', widthIn: 12, heightIn: 16, group: 'medium', priceCents: 5299, mostLoved: true },
  { id: 'canvas_16x16', widthIn: 16, heightIn: 16, group: 'medium', priceCents: 5799 },
  { id: 'canvas_16x20', widthIn: 16, heightIn: 20, group: 'medium', priceCents: 6299 },
  { id: 'canvas_16x24', widthIn: 16, heightIn: 24, group: 'large',  priceCents: 6699 },
  { id: 'canvas_20x20', widthIn: 20, heightIn: 20, group: 'large',  priceCents: 7099 },
  { id: 'canvas_20x24', widthIn: 20, heightIn: 24, group: 'large',  priceCents: 7299 },
];

const FILTERS: Filter[] = ['all', 'small', 'medium', 'large'];

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Swatch dimensions scaled to the canvas aspect ratio. Width is fixed at
// 140px (matching the design handoff); height scales with the portrait
// ratio but caps at 170px so extreme portrait aspects (20×24) don't stack
// taller than their neighbors.
function swatchDimensions(option: CanvasOption): { width: number; height: number } {
  const ratio = option.heightIn / option.widthIn;
  if (ratio >= 1) {
    return { width: 140, height: Math.min(140 * ratio, 170) };
  }
  // Landscape — not in current set, but handle gracefully.
  const height = 110;
  return { width: height / ratio, height };
}

export function PrintShopScreen() {
  const nav = useNavigation();
  const { tributes } = useTributes();
  const [filter, setFilter] = useState<Filter>('all');
  const [modalOpen, setModalOpen] = useState(false);

  // Which generated image to preview on the canvas mockups.
  //   • From Editor/Reunite "Order canvas": the exact image they're looking at,
  //     handed over as a nav param (always directly loadable).
  //   • From the Prints tab (no param): fall back to the most-recent saved
  //     tribute's signed image URL. Sorted client-side by createdAt so we don't
  //     depend on the list endpoint's ordering.
  const fallbackUrl = useMemo(() => {
    const newest = [...tributes]
      .filter((t) => Boolean(t.signedImageUrl))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return newest?.signedImageUrl ?? null;
  }, [tributes]);

  const previewUrl = nav.params.imageUrl ?? fallbackUrl;
  // Retained so the coming-soon modal can announce which size triggered
  // it in `aria-describedby`, and so focus can return to that specific
  // card's Order button on close.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const visible = CANVAS_OPTIONS.filter((o) => filter === 'all' || o.group === filter);

  const handleOrder = (e: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = e.currentTarget;
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeepTribute = () => {
    setModalOpen(false);
    nav.pop();
  };

  return (
    <div className="print-shop" data-state={modalOpen ? 'coming-soon-modal' : 'browsing'}>
      <header className="print-shop-chrome">
        <button
          type="button"
          className="print-shop-back"
          onClick={() => nav.pop()}
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="print-shop-step">{COPY.printShop.stepLabel.toUpperCase()}</span>
        <span className="print-shop-back-placeholder" aria-hidden />
      </header>

      <main className="print-shop-shell">
        <div className="print-shop-heading-block">
          <span className="print-shop-numeral" aria-hidden>
            <em>07</em>
            <span className="print-shop-numeral-slash">/</span>
            <span className="print-shop-numeral-of">09</span>
          </span>
          <span className="print-shop-eyebrow">
            {COPY.printShop.eyebrow.toUpperCase()}
          </span>
          <h1 className="print-shop-display">
            {COPY.printShop.headingBefore}
            <em>{COPY.printShop.headingItalic}</em>
            {COPY.printShop.headingAfter}
          </h1>
          <p className="print-shop-subhead">{COPY.printShop.subheading}</p>
        </div>

        <section
          className="print-shop-hero"
          aria-label="Preview of your canvas on a wall"
        >
          <div className="print-shop-hero-eyebrow">
            <span className="print-shop-hero-eyebrow-dot" aria-hidden />
            <span className="print-shop-hero-eyebrow-label">
              {COPY.printShop.heroEyebrow.toUpperCase()}
            </span>
          </div>
          <div
            className="print-shop-wall"
            role="img"
            aria-label={
              previewUrl
                ? COPY.printShop.heroAriaWithTribute
                : COPY.printShop.heroAriaEmpty
            }
          >
            <span className="print-shop-sconce" aria-hidden />
            <span className="print-shop-rail" aria-hidden />
            <div className="print-shop-canvas-mount">
              <div className="print-shop-canvas-face">
                {previewUrl ? (
                  <img
                    className="print-shop-canvas-photo"
                    src={previewUrl}
                    alt=""
                    aria-hidden
                  />
                ) : (
                  <div className="print-shop-canvas-silhouette" aria-hidden />
                )}
                <div className="print-shop-canvas-halo" aria-hidden />
              </div>
              <span className="print-shop-canvas-corner print-shop-canvas-corner--tl" aria-hidden />
              <span className="print-shop-canvas-corner print-shop-canvas-corner--tr" aria-hidden />
              <span className="print-shop-canvas-corner print-shop-canvas-corner--bl" aria-hidden />
              <span className="print-shop-canvas-corner print-shop-canvas-corner--br" aria-hidden />
            </div>
          </div>
          <div className="print-shop-hero-ornament" aria-hidden>
            <span className="print-shop-hero-ornament-hairline" />
            <div className="print-shop-hero-ornament-flourish">
              <span />
              <span />
              <span />
            </div>
          </div>
          <p className="print-shop-hero-caption">{COPY.printShop.heroCaption}</p>
          {!previewUrl && (
            <div className="print-shop-hero-empty">
              <span className="print-shop-hero-empty-eyebrow">
                {COPY.printShop.emptyPreviewEyebrow.toUpperCase()}
              </span>
              <p className="print-shop-hero-empty-body">
                {COPY.printShop.emptyPreviewBody}
              </p>
              <button
                type="button"
                className="print-shop-hero-empty-cta"
                onClick={() => nav.setTab('HOME')}
              >
                {COPY.printShop.emptyPreviewCta}
              </button>
            </div>
          )}
        </section>

        <section className="print-shop-section-head" aria-labelledby="print-shop-size-heading">
          <svg
            className="print-shop-section-arc"
            viewBox="0 0 78 40"
            aria-hidden
            fill="none"
            stroke="#D4A95C"
            strokeLinecap="round"
          >
            <path d="M2 36 C 20 6, 58 6, 76 36" strokeWidth="1.2" />
            <circle cx="39" cy="12" r="1.6" fill="#D4A95C" stroke="none" />
          </svg>
          <h2 className="print-shop-section-heading" id="print-shop-size-heading">
            {COPY.printShop.sizeHeadingBefore}
            <em>{COPY.printShop.sizeHeadingItalic}</em>
            {COPY.printShop.sizeHeadingAfter}
          </h2>
          <div className="print-shop-section-hairline" aria-hidden />
          <span className="print-shop-section-helper">
            {COPY.printShop.sizeHelper.toUpperCase()}
          </span>

          <div
            className="print-shop-chips"
            role="tablist"
            aria-label="Filter canvas sizes"
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className="print-shop-chip"
                onClick={() => setFilter(f)}
              >
                {COPY.printShop.filters[f]}
              </button>
            ))}
          </div>
        </section>

        <ul className="print-shop-grid" role="list" aria-label="Canvas sizes">
          {visible.map((option) => {
            const { width, height } = swatchDimensions(option);
            const description = COPY.printShop.sizeDescriptions[option.id] ?? '';
            const groupLabel = COPY.printShop.groupLabels[option.group] ?? option.group.toUpperCase();
            return (
              <li
                key={option.id}
                className="print-shop-card"
                role="listitem"
                data-group={option.group}
              >
                {option.mostLoved && (
                  <span
                    className="print-shop-card-loved"
                    aria-label={`${COPY.printShop.mostLovedTag} size`}
                  >
                    {COPY.printShop.mostLovedTag}
                  </span>
                )}
                <div className="print-shop-swatch-wrap">
                  <span className="print-shop-swatch-nail" aria-hidden />
                  <span className="print-shop-swatch-thread" aria-hidden />
                  <div
                    className="print-shop-swatch"
                    data-has-photo={previewUrl ? 'true' : undefined}
                    style={{
                      ['--sw-w' as string]: `${width}px`,
                      ['--sw-h' as string]: `${height}px`,
                    }}
                    aria-hidden
                  >
                    {previewUrl && (
                      <img
                        className="print-shop-swatch-photo"
                        src={previewUrl}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <span className="print-shop-swatch-corner print-shop-swatch-corner--tr" />
                    <span className="print-shop-swatch-corner print-shop-swatch-corner--bl" />
                  </div>
                  <span className="print-shop-measure" aria-hidden>
                    {option.widthIn}&thinsp;&times;&thinsp;{option.heightIn}
                    {' · '}
                    {groupLabel}
                  </span>
                </div>
                <div className="print-shop-card-body">
                  <h3 className="print-shop-card-title">
                    Canvas {option.widthIn} &times; {option.heightIn} inches
                  </h3>
                  <p className="print-shop-card-desc">{description}</p>
                </div>
                <div className="print-shop-card-foot">
                  <span
                    className="print-shop-card-price"
                    aria-label={`Price ${formatPrice(option.priceCents)}`}
                  >
                    {formatPrice(option.priceCents)}
                  </span>
                  <button
                    type="button"
                    className="print-shop-order-btn"
                    onClick={handleOrder}
                    data-order={option.id}
                    aria-label={`Order canvas ${option.widthIn} inches by ${option.heightIn} inches`}
                  >
                    {COPY.printShop.cta}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <section className="print-shop-foot" aria-label={COPY.printShop.aboutLabel}>
          <div className="print-shop-foot-hairline" aria-hidden />
          <span className="print-shop-foot-label">
            {COPY.printShop.aboutLabel.toUpperCase()}
          </span>
          <div className="print-shop-foot-lines">
            {COPY.printShop.aboutLines.map((line) => (
              <p key={line}>
                <em>{line}</em>
              </p>
            ))}
          </div>
          <a
            className="print-shop-contact-pill"
            href="mailto:hello@gethaloframe.com?subject=Canvas%20sizing%20question"
          >
            <span className="print-shop-contact-pill-dot" aria-hidden />
            {COPY.printShop.contactPill}
          </a>
        </section>
      </main>

      <ComingSoonModal
        open={modalOpen}
        onClose={handleClose}
        onKeepTribute={handleKeepTribute}
      />
    </div>
  );
}

/* ---------- Coming-soon modal (scrim + ornament + focus trap) ---------- */

interface ComingSoonModalProps {
  open: boolean;
  onClose: () => void;
  onKeepTribute: () => void;
}

function ComingSoonModal({ open, onClose, onKeepTribute }: ComingSoonModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => primaryRef.current?.focus(), 40);
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
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="print-shop-scrim"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <motion.div
            ref={cardRef}
            className="print-shop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-shop-modal-title"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <button
              type="button"
              className="print-shop-modal-close"
              onClick={onClose}
              aria-label={COPY.printShop.modalCloseAria}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <div className="print-shop-modal-ornament" aria-hidden>
              <span className="print-shop-modal-ornament-line" />
              <span className="print-shop-modal-ornament-line print-shop-modal-ornament-line--short" />
              <span className="print-shop-modal-ornament-dot" />
              <span className="print-shop-modal-ornament-ring" />
            </div>
            <h2 id="print-shop-modal-title" className="print-shop-modal-title">
              {COPY.printShop.modalTitle}
            </h2>
            <p className="print-shop-modal-sub">{COPY.printShop.modalSub}</p>
            <div className="print-shop-modal-actions">
              <button
                ref={primaryRef}
                type="button"
                className="print-shop-modal-primary"
                onClick={onClose}
              >
                {COPY.printShop.modalWaitCta}
              </button>
              <button
                type="button"
                className="print-shop-modal-ghost"
                onClick={onKeepTribute}
              >
                {COPY.printShop.modalKeepCta}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
