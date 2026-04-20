import { motion } from 'framer-motion';
import type { TributeTemplate } from '@haloframe/shared';

interface TemplateGalleryProps {
  templates: TributeTemplate[];
  /**
   * Single-select: the array is either empty or holds one id. Kept as a list
   * so this component can stay symmetric if we ever re-introduce mixing.
   */
  selectedIds: string[];
  /** Select the tile (or clear selection if it was already active). */
  onToggle: (id: string) => void;
  /**
   * IDs whose 1K preview render has landed. Tiles not in this set render
   * with a soft rose pulse and are not tappable.
   */
  readyIds?: Set<string>;
  /** Globally disable the gallery (e.g., while a final render is saving). */
  disabled?: boolean;
}

const gentleEase = [0.22, 0.61, 0.36, 1] as const;

// 2026-04-19 claude.ai/design port — the parent `.editor-gallery-section`
// supplies the heading, hairline, helper + preload banner. This component
// only renders the tile grid itself.
export function TemplateGallery({
  templates,
  selectedIds,
  onToggle,
  readyIds,
  disabled,
}: TemplateGalleryProps) {
  return (
    <div
      className="editor-tile-grid"
      role="radiogroup"
      aria-label="Memorial styles"
    >
      {templates.map((t, i) => {
        const selected = selectedIds.includes(t.id);
        const ready = !readyIds || readyIds.has(t.id);
        const isDisabled = !!disabled || !ready;
        const classes = [
          'editor-tile',
          selected ? 'editor-tile--selected' : '',
          ready ? '' : 'editor-tile--pending',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <motion.button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t.name}
            aria-busy={!ready}
            disabled={isDisabled}
            className={classes}
            onClick={() => onToggle(t.id)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: gentleEase, delay: 0.08 + i * 0.06 }}
          >
            <div className="editor-tile-media">
              {t.sampleImageUrl ? (
                <img
                  src={t.sampleImageUrl}
                  alt=""
                  decoding="async"
                  // @ts-expect-error fetchpriority is valid HTML but missing
                  // from React DOM types in this version.
                  fetchpriority="high"
                />
              ) : (
                <div className="editor-tile-media-empty" aria-hidden />
              )}
              {selected && (
                <span className="editor-tile-check" aria-hidden>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l4.5 4.5L19 7" />
                  </svg>
                </span>
              )}
              {!ready && <span className="editor-tile-rose-dot" aria-hidden />}
            </div>
            <div className="editor-tile-caption">
              <span className="editor-tile-cat">{t.category}</span>
              <span className="editor-tile-name">{t.name}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
