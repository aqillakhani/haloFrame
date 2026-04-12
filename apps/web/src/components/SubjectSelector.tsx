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
 * Renders the source image with bounding-box tap targets overlaid for each
 * detected subject. Tap targets are scaled to the rendered image size, not
 * the original pixel coordinates.
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
        setRenderedSize({
          w: imgRef.current.clientWidth,
          h: imgRef.current.clientHeight,
        });
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
        alt="source"
        onLoad={(e) => {
          const t = e.currentTarget;
          setRenderedSize({ w: t.clientWidth, h: t.clientHeight });
        }}
      />
      {renderedSize && <div className="dim-layer" />}
      {renderedSize &&
        subjects.map((s, i) => {
          const [x1, y1, x2, y2] = s.bbox;
          const left = x1 * scaleX;
          const top = y1 * scaleY;
          const width = (x2 - x1) * scaleX;
          const height = (y2 - y1) * scaleY;
          return (
            <button
              key={s.maskId}
              type="button"
              className={`subject-target${selectedIndex === i ? ' selected' : ''}`}
              style={{ left, top, width, height }}
              onClick={() => onSelect(i)}
              aria-label={`Select subject ${i + 1}`}
            >
              <span className="badge">{i + 1}</span>
            </button>
          );
        })}
    </div>
  );
}
