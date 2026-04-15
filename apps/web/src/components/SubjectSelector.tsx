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
 * Renders the source image with numbered circle badges centered on each
 * detected subject's bounding box. Tap the number to select.
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
          const isSelected = selectedIndex === i;
          // Center the badge on the bounding box center
          const cx = ((x1 + x2) / 2) * scaleX;
          const cy = ((y1 + y2) / 2) * scaleY;
          // Also draw a highlight outline around the bbox when selected
          const bboxLeft = x1 * scaleX;
          const bboxTop = y1 * scaleY;
          const bboxWidth = (x2 - x1) * scaleX;
          const bboxHeight = (y2 - y1) * scaleY;
          return (
            <div key={s.maskId}>
              {/* Highlight outline when selected */}
              {isSelected && (
                <div
                  className="subject-highlight"
                  style={{
                    left: bboxLeft,
                    top: bboxTop,
                    width: bboxWidth,
                    height: bboxHeight,
                  }}
                />
              )}
              {/* Numbered circle badge */}
              <button
                type="button"
                className={`subject-badge${isSelected ? ' selected' : ''}`}
                style={{
                  left: cx - 18,
                  top: cy - 18,
                }}
                onClick={() => onSelect(i)}
                aria-label={`Select person ${i + 1}`}
              >
                {i + 1}
              </button>
            </div>
          );
        })}
    </div>
  );
}
