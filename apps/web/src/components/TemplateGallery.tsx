import type { TributeTemplate } from '@eternalframe/shared';
import { COPY } from '../lib/copy';
import { Icon } from './icons/Icon';

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

export function TemplateGallery({
  templates,
  selectedIds,
  onToggle,
  readyIds,
  disabled,
}: TemplateGalleryProps) {
  return (
    <section className="template-section">
      <header className="template-section-header">
        <h3 className="t-display-md">{COPY.editor.styleHeading}</h3>
        <hr className="hairline-short" aria-hidden />
        <p className="t-body-sm t-muted">{COPY.editor.styleHelper}</p>
      </header>
      <div className="template-grid" role="radiogroup" aria-label="Tribute styles">
        {templates.map((t) => {
          const selected = selectedIds.includes(t.id);
          const ready = !readyIds || readyIds.has(t.id);
          const isDisabled = !!disabled || !ready;
          const classes = [
            'template-tile',
            selected ? 'template-tile--selected' : '',
            ready ? '' : 'template-tile--pending',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.name}
              aria-busy={!ready}
              disabled={isDisabled}
              className={classes}
              onClick={() => onToggle(t.id)}
            >
              <div className="template-tile-photo">
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
                  <div className="template-tile-photo-empty" aria-hidden />
                )}
                {selected && (
                  <span className="template-tile-check" aria-hidden>
                    <Icon name="check" size={14} />
                  </span>
                )}
                {!ready && <span className="template-tile-dot" aria-hidden />}
              </div>
              <div className="template-tile-meta">
                <p className="t-label-sm t-muted">{t.category}</p>
                <p className="t-label-md">{t.name}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
