import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type SyntheticEvent,
  type WheelEvent,
} from 'react';

export interface ImageOverlay {
  /** Unique key — typically the template id. */
  id: string;
  /** URL of the overlay image (transparent PNG or flat JPG). */
  src: string;
}

interface ImageViewerProps {
  src: string;
  alt: string;
  /**
   * When true, the viewport gets a `loading` class so the outer stage
   * CSS can dim the photo + surface a breathing halo. The caller owns
   * the loading caption (rendered as a sibling of the viewer, not an
   * overlay) per the 2026-04-19 redesign — keeps the frame visually
   * uncluttered while work is in-flight.
   */
  loading?: boolean;
  /**
   * Rough static overlays stacked on top of the base image. Used during
   * exploration to hint what the final render will include, without
   * firing a real AI render per toggle.
   */
  overlays?: ImageOverlay[];
}

/**
 * Simple pan + zoom image viewer. Mouse wheel zooms (desktop), pointer drag
 * pans, double-tap resets. Mobile browsers handle pinch-zoom natively via
 * touch-action: pinch-zoom on the container, so we don't re-implement it.
 *
 * View transform is local — it does NOT affect the underlying image, so
 * switching styles mid-zoom preserves the composition exactly.
 */
export function ImageViewer({ src, alt, loading, overlays }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Aspect of the loaded image. Drives `--image-aspect` on the viewport so
  // the frame reshapes to match the photo (landscape merge → landscape
  // frame), preventing the cover-fit crop that made landscape photos look
  // "zoomed in" inside the previously-portrait 4/5 box.
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  // Reset transform when the image changes
  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [src]);

  const handleImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImageAspect(img.naturalWidth / img.naturalHeight);
    }
  };

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

  const transformStyle = {
    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
    transition: draggingRef.current ? 'none' : 'transform 0.18s ease',
  };

  const viewportStyle: CSSProperties = {
    cursor: draggingRef.current ? 'grabbing' : 'grab',
    ...(imageAspect ? ({ ['--image-aspect']: `${imageAspect}` } as CSSProperties) : {}),
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
      style={viewportStyle}
    >
      <div className="image-stack" style={transformStyle}>
        <img
          src={src}
          alt={alt}
          className="image-base"
          draggable={false}
          onLoad={handleImageLoad}
        />
        {overlays?.map((ov) => (
          <img
            key={ov.id}
            src={ov.src}
            alt=""
            className="preview-overlay"
            draggable={false}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
