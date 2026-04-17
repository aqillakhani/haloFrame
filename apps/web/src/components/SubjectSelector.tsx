import { useEffect, useMemo, useRef, useState } from 'react';
import type { Subject } from '../lib/api';

interface SubjectSelectorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  subjects: Subject[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

// Badge geometry — kept in sync with the .subject-badge CSS rule (44×44px).
const BADGE_DIAMETER = 44;
const BADGE_RADIUS = BADGE_DIAMETER / 2;
// Minimum distance between two badge centers before they read as "overlapping".
// 8px buffer past edge-to-edge keeps numbers legible even on a ring border.
const MIN_CENTER_DIST = BADGE_DIAMETER + 8;
const CANVAS_PADDING = 8; // matches .subject-canvas padding so origin stays correct
const MAX_RELAXATION_ITERS = 60;

interface BadgePosition {
  /** Ideal position (centroid in screen coords). Kept for optional leader-line rendering. */
  originalX: number;
  originalY: number;
  /** Live position after overlap resolution. */
  x: number;
  y: number;
}

/**
 * Iterative force-relaxation: any pair of badges closer than MIN_CENTER_DIST
 * pushes each other apart along the axis between their centers. Converges in
 * a handful of iterations for typical 2–6 person photos. O(iters × N²) which
 * is trivial at this scale. Caller passes the rendered image box so we can
 * clamp positions to stay over the photo rather than leaking into the page.
 */
function resolveBadgeOverlap(
  initial: BadgePosition[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): BadgePosition[] {
  const positions = initial.map((p) => ({ ...p }));
  for (let iter = 0; iter < MAX_RELAXATION_ITERS; iter++) {
    let moved = false;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]!;
        const b = positions[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < MIN_CENTER_DIST) {
          const overlap = MIN_CENTER_DIST - d;
          const push = overlap / 2;
          // If the two centroids coincide exactly (rare but possible with
          // near-identical bboxes), pick a deterministic horizontal axis.
          const ux = d < 0.01 ? 1 : dx / d;
          const uy = d < 0.01 ? 0 : dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          moved = true;
        }
      }
    }
    // Clamp inside the rendered image box so badges never drift off-photo.
    for (const p of positions) {
      p.x = Math.max(bounds.minX, Math.min(bounds.maxX, p.x));
      p.y = Math.max(bounds.minY, Math.min(bounds.maxY, p.y));
    }
    if (!moved) break;
  }
  return positions;
}

/**
 * Renders the source image with a small numbered badge at the center of
 * each detected subject's bounding box. Tap the badge to select.
 *
 * When two subjects stand close in the photo (e.g. a child held by a parent),
 * their bbox centroids are almost coincident and the raw badges overlap into
 * an unreadable pile. We resolve this with a short force relaxation so every
 * badge keeps a minimum gap, and draw a subtle leader line from any displaced
 * badge back to the original centroid so the badge→subject mapping stays
 * obvious.
 */
export function SubjectSelector({
  imageUrl,
  imageWidth,
  imageHeight,
  subjects,
  selectedIndex,
  onSelect,
}: SubjectSelectorProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (imgRef.current) {
        setRenderedSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [imageUrl]);

  const scaleX = renderedSize ? renderedSize.w / imageWidth : 1;
  const scaleY = renderedSize ? renderedSize.h / imageHeight : 1;

  const badges = useMemo(() => {
    if (!renderedSize) return [] as BadgePosition[];
    const initial: BadgePosition[] = subjects.map((subj) => {
      const [x1, y1, x2, y2] = subj.bbox;
      const cx = ((x1 + x2) / 2) * scaleX + CANVAS_PADDING;
      const cy = ((y1 + y2) / 2) * scaleY + CANVAS_PADDING;
      return { originalX: cx, originalY: cy, x: cx, y: cy };
    });
    return resolveBadgeOverlap(initial, {
      minX: CANVAS_PADDING + BADGE_RADIUS,
      minY: CANVAS_PADDING + BADGE_RADIUS,
      maxX: CANVAS_PADDING + renderedSize.w - BADGE_RADIUS,
      maxY: CANVAS_PADDING + renderedSize.h - BADGE_RADIUS,
    });
  }, [subjects, renderedSize, scaleX, scaleY]);

  return (
    <div className="subject-canvas">
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        className="subject-image"
        onLoad={(e) => {
          const t = e.currentTarget;
          setRenderedSize({ w: t.clientWidth, h: t.clientHeight });
        }}
      />
      {renderedSize && badges.length > 0 && (
        <svg
          className="subject-leaders"
          width={renderedSize.w + CANVAS_PADDING * 2}
          height={renderedSize.h + CANVAS_PADDING * 2}
          aria-hidden
        >
          {badges.map((b, i) => {
            const dx = b.x - b.originalX;
            const dy = b.y - b.originalY;
            // Only draw the line when the badge is meaningfully displaced;
            // otherwise the 1px line just adds visual noise.
            if (Math.hypot(dx, dy) < 6) return null;
            return (
              <line
                key={i}
                x1={b.originalX}
                y1={b.originalY}
                x2={b.x}
                y2={b.y}
                className="subject-leader-line"
              />
            );
          })}
        </svg>
      )}
      {renderedSize &&
        badges.map((b, i) => {
          const subj = subjects[i]!;
          const isSelected = selectedIndex === i;
          const kind = subj.label === 'pet' ? 'Pet' : 'Person';
          const label = `${kind} ${i + 1}`;
          return (
            <button
              key={subj.maskId}
              type="button"
              className={`subject-badge${isSelected ? ' subject-badge--active' : ''}`}
              style={{ left: b.x - BADGE_RADIUS, top: b.y - BADGE_RADIUS }}
              onClick={() => onSelect(i)}
              aria-label={`Select ${label}`}
              aria-pressed={isSelected}
            >
              {i + 1}
            </button>
          );
        })}
    </div>
  );
}
