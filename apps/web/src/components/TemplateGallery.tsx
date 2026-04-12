import type { TributeTemplate } from '@eternalframe/shared';

interface TemplateGalleryProps {
  templates: TributeTemplate[];
  selectedId: string | null;
  isPet: boolean;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function TemplateGallery({
  templates,
  selectedId,
  isPet,
  onSelect,
  disabled,
}: TemplateGalleryProps) {
  const filtered = templates.filter((t) =>
    isPet ? t.isPetCompatible : t.isHumanCompatible,
  );

  return (
    <div className="template-section">
      <div className="template-section-header">
        <h3>Tribute style</h3>
        <span className="helper">Tap any style to preview</span>
      </div>
      <div className="template-grid" role="radiogroup" aria-label="Tribute style">
        {filtered.map((t) => {
          const isSelected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`template-card${isSelected ? ' selected' : ''}`}
              onClick={() => onSelect(t.id)}
              disabled={disabled}
            >
              {isSelected && <span className="card-check" aria-hidden>✓</span>}
              <h4>{t.name}</h4>
              <p>{t.description}</p>
              <span className="category-tag">{t.category}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
