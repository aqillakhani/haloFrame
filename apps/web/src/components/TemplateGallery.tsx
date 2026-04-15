import type { TributeTemplate } from '@eternalframe/shared';
import { COPY } from '../lib/copy';

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
   * with a loading shimmer and are not tappable.
   */
  readyIds?: Set<string>;
  /** Globally disable the gallery (e.g., while a final render is saving). */
  disabled?: boolean;
}

export function TemplateGallery({
  templates,
  selectedIds,
  onToggle,
  readyIds,
  disabled,
}: TemplateGalleryProps) {
  return (
    <div className="template-section">
      <div className="template-section-header">
        <h3>{COPY.editor.styleHeading}</h3>
        <span className="helper">{COPY.editor.styleHelper}</span>
      </div>
      <div className="template-grid" role="group" aria-label="Tribute styles">
        {templates.map((t) => {
          const isSelected = selectedIds.includes(t.id);
          const isReady = !readyIds || readyIds.has(t.id);
          const isDisabled = !!disabled || !isReady;
          const classes = [
            'template-card',
            isSelected ? 'selected' : '',
            !isReady ? 'not-ready' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isSelected}
              aria-busy={!isReady}
              className={classes}
              onClick={() => onToggle(t.id)}
              disabled={isDisabled}
            >
              {isSelected && <span className="card-check" aria-hidden>&#x2713;</span>}
              {t.sampleImageUrl ? (
                <img
                  src={t.sampleImageUrl}
                  alt=""
                  className="template-tile-thumb"
                  decoding="async"
                  // @ts-expect-error fetchpriority is valid HTML but missing
                  // from React's DOM types in this version. Drops first paint
                  // delay on these tiny static thumbs noticeably.
                  fetchpriority="high"
                />
              ) : (
                <div className="template-tile-thumb template-tile-thumb-empty" aria-hidden />
              )}
              {!isReady && (
                <span className="tile-loading" aria-hidden>
                  <span className="spinner small" />
                </span>
              )}
              <h4>{t.name}</h4>
              <p className="template-desc">{t.description}</p>
              <span className="category-tag">{t.category}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
