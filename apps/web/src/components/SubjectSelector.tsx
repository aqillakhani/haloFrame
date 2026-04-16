import { useEffect, useRef, useState } from 'react';
import type { Subject } from '../lib/api';

interface SubjectSelectorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  subjects: Subject[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

/**
 * Renders the source image with a bronze ring around each detected
 * subject's bounding box, plus a rose pill in the top-left corner of the
 * ring labeled "Person N" / "Pet N". Tap anywhere in the ring to select.
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
      {renderedSize &&
        subjects.map((subj, i) => {
          const [x1, y1, x2, y2] = subj.bbox;
          const isSelected = selectedIndex === i;
          const kind = subj.label === 'pet' ? 'Pet' : 'Person';
          const label = `${kind} ${i + 1}`;
          const style = {
            left: x1 * scaleX + 8,
            top: y1 * scaleY + 8,
            width: (x2 - x1) * scaleX,
            height: (y2 - y1) * scaleY,
          };
          return (
            <button
              key={subj.maskId}
              type="button"
              className={`subject-ring${isSelected ? ' subject-ring--active' : ''}`}
              style={style}
              onClick={() => onSelect(i)}
              aria-label={`Select ${label}`}
              aria-pressed={isSelected}
            >
              <span className="subject-pill">{label}</span>
            </button>
          );
        })}
    </div>
  );
}
