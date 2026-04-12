import { useEffect, useRef, useState } from 'react';
import type { TributeTemplate } from '@eternalframe/shared';
import {
  applyTemplate,
  type ApplySubjectContext,
  type ApplyResult,
} from '../lib/api';
import { ImageViewer } from '../components/ImageViewer';
import { TemplateGallery } from '../components/TemplateGallery';

export interface EditorProps {
  /** Source image every template is applied on top of. For Enhance this is
   *  the uploaded photo. For Reunite this is the merged photo. */
  baseImageUrl: string;
  /** Optional subject context to disambiguate multi-person photos. */
  subjects?: ApplySubjectContext[];
  selectedSubjectIndex?: number;
  imageWidth?: number;
  imageHeight?: number;
  subjectName?: string;
  isPet: boolean;
  /** Whole template catalog (both human and pet filters applied inside). */
  templates: TributeTemplate[];
  /** Called when user taps "Start over" — reset the entire flow. */
  onStartOver: () => void;
  /** Only provided for the Reunite flow — lets user change placement. */
  onTryDifferentPosition?: () => void;
  /** Optional label at the top of the editor (e.g., "Honoring Grandma Rose") */
  contextLabel?: string;
}

type Intensity = 'low' | 'medium' | 'high';

export function Editor({
  baseImageUrl,
  subjects,
  selectedSubjectIndex,
  imageWidth,
  imageHeight,
  subjectName,
  isPet,
  templates,
  onStartOver,
  onTryDifferentPosition,
  contextLabel,
}: EditorProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<Intensity>('medium');
  const [styledUrl, setStyledUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the most recent request so old in-flight responses don't overwrite
  // a newer styled result if the user taps quickly between templates.
  const requestIdRef = useRef(0);

  // When the base image changes (e.g., user re-merged with a new placement),
  // wipe the styled result so they see the new base.
  useEffect(() => {
    setStyledUrl(null);
    setSelectedTemplateId(null);
    setError(null);
  }, [baseImageUrl]);

  const runApply = async (templateId: string, nextIntensity: Intensity) => {
    setError(null);
    setIsApplying(true);
    const reqId = ++requestIdRef.current;
    try {
      const result: ApplyResult = await applyTemplate({
        imageUrl: baseImageUrl,
        templateId,
        intensity: nextIntensity,
        subjectName,
        isPet,
        subjects,
        selectedSubjectIndex,
        imageWidth,
        imageHeight,
      });
      // Ignore stale responses
      if (reqId !== requestIdRef.current) return;
      // Natural Blend returns the source URL unchanged
      setStyledUrl(result.imageUrl);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setError(
        `We couldn't quite create that one. Try another style, or try again in a moment.`,
      );
    } finally {
      if (reqId === requestIdRef.current) {
        setIsApplying(false);
      }
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setShowOriginal(false);
    void runApply(templateId, intensity);
  };

  const handleIntensityChange = (next: Intensity) => {
    setIntensity(next);
    if (selectedTemplateId) {
      setShowOriginal(false);
      void runApply(selectedTemplateId, next);
    }
  };

  const displayUrl = showOriginal || !styledUrl ? baseImageUrl : styledUrl;
  const hasStyled = styledUrl && styledUrl !== baseImageUrl;

  return (
    <div className="editor">
      <div className="editor-stage">
        {contextLabel && (
          <p className="muted" style={{ marginBottom: '0.5rem', textAlign: 'center' }}>
            {contextLabel}
          </p>
        )}
        <ImageViewer
          src={displayUrl}
          alt="Your tribute"
          loading={isApplying}
          loadingLabel="Creating your tribute…"
        />
        <div className="stage-toolbar">
          <div className="stage-toolbar-group">
            <button
              type="button"
              className={`chip${!showOriginal ? ' active' : ''}`}
              onClick={() => setShowOriginal(false)}
              disabled={!hasStyled}
            >
              Styled
            </button>
            <button
              type="button"
              className={`chip${showOriginal ? ' active' : ''}`}
              onClick={() => setShowOriginal(true)}
              disabled={!hasStyled}
            >
              Original
            </button>
          </div>
          <span className="helper muted" style={{ fontSize: '0.75rem' }}>
            Pinch or scroll to zoom · drag to pan · double-click to reset
          </span>
        </div>
        {error && <div className="error-banner" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </div>

      <div className="editor-controls">
        <div className="intensity-row" role="radiogroup" aria-label="Effect intensity">
          {(['low', 'medium', 'high'] as const).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={intensity === i}
              className={`intensity-pill${intensity === i ? ' active' : ''}`}
              onClick={() => handleIntensityChange(i)}
              disabled={isApplying}
            >
              {i === 'low' ? 'Subtle' : i === 'medium' ? 'Balanced' : 'Dramatic'}
            </button>
          ))}
        </div>

        <TemplateGallery
          templates={templates}
          selectedId={selectedTemplateId}
          isPet={isPet}
          onSelect={handleTemplateSelect}
          disabled={isApplying}
        />
      </div>

      <div className="action-bar editor-action-bar">
        {onTryDifferentPosition && (
          <button
            type="button"
            className="ghost"
            onClick={onTryDifferentPosition}
            disabled={isApplying}
          >
            Try a different position
          </button>
        )}
        <a
          className="gold"
          href={displayUrl}
          download="eternalframe-tribute.png"
          aria-disabled={isApplying}
        >
          Download
        </a>
        <button type="button" className="ghost" onClick={onStartOver} disabled={isApplying}>
          Start over
        </button>
      </div>
    </div>
  );
}
