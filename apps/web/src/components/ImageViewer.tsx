import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

interface ImageViewerProps {
  src: string;
  alt: string;
  /** When true, show a loading shade over the image */
  loading?: boolean;
  loadingLabel?: string;
}

/**
 * Simple pan + zoom image viewer. Mouse wheel zooms (desktop), pointer drag
 * pans, double-tap resets. Mobile browsers handle pinch-zoom natively via
 * touch-action: pinch-zoom on the container, so we don't re-implement it.
 *
 * View transform is local — it does NOT affect the underlying image, so
 * switching styles mid-zoom preserves the composition exactly.
 */
export function ImageViewer({ src, alt, loading, loadingLabel }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  // Reset transform when the image changes
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [src]);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 20) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale((s) => Math.max(0.5, Math.min(5, s + delta)));
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    draggingRef.current = { x: e.clientX - tx, y: e.clientY - ty };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = draggingRef.current;
    if (!d) return;
    setTx(e.clientX - d.x);
    setTy(e.clientY - d.y);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = null;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleDoubleClick = () => {
    reset();
  };

  return (
    <div
      className={`image-viewport${loading ? ' loading' : ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: draggingRef.current ? 'grabbing' : 'grab' }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: draggingRef.current ? 'none' : 'transform 0.18s ease',
        }}
        draggable={false}
      />
      {loading && (
        <div className="loading-shade">
          <div className="loading-pill">
            <span className="spinner small" />
            <span>{loadingLabel ?? 'Creating your tribute…'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
