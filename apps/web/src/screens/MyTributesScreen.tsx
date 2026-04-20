import { motion, useReducedMotion } from 'framer-motion';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';

/*
 * 2026-04-20 redesign port (claude.ai/design handoff).
 * Final screen of the redesign. Ports the `empty` state only; the
 * populated-state design is archived at
 * `design/MyTributes _standalone_.html` so a future feature sprint can
 * wire real tribute listing without re-designing the gallery.
 *
 * Contract: `useNavigation()` + `useReducedMotion()` preserved. Primary
 * CTA routes to HOME. `hasTributes` is hard-coded `false` until the
 * listing endpoint ships — keeps the populated-state JSX out of the
 * tree entirely rather than rendering hidden/placeholder data.
 */

const gentleEase = [0.22, 0.61, 0.36, 1] as const;
const hasTributes = false as const;

export function MyTributesScreen() {
  const nav = useNavigation();
  const reduceMotion = useReducedMotion();

  const createTribute = () => nav.setTab('HOME');

  const anim = (delay: number) =>
    reduceMotion
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, ease: gentleEase, delay },
        };

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
              <ellipse
                cx="50"
                cy="36"
                rx="30"
                ry="7"
                fill="none"
                stroke="#D4A95C"
                strokeWidth="1.2"
                opacity="0.9"
              />
              <ellipse
                cx="50"
                cy="36"
                rx="22"
                ry="5"
                fill="none"
                stroke="#D4A95C"
                strokeWidth="0.8"
                opacity="0.5"
              />
              <path
                d="M 50 46 Q 38 46 36 62 L 36 82 Q 36 86 40 86 L 60 86 Q 64 86 64 82 L 64 62 Q 62 46 50 46 Z"
                fill="none"
                stroke="#8A7E6E"
                strokeWidth="1"
                opacity="0.6"
              />
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
    </div>
  );
}
