import { useEffect, useState } from 'react';
import type { TributeTemplate } from '@eternalframe/shared';
import {
  fetchTemplates,
  mergePhotos,
  preloadSampleImages,
  segmentImage,
  uploadFile,
} from '../lib/api';
import { COPY } from '../lib/copy';
import { useNavigation } from '../lib/navigation';
import { BackButton } from '../components/BackButton';
import { UploadZone } from '../components/UploadZone';
import { Editor } from './Editor';

type Placement = 'left' | 'right' | 'behind' | 'front';
type Step = 'upload' | 'placement' | 'merging' | 'review' | 'editor';

const PLACEMENT_KEYS: Placement[] = ['left', 'right', 'behind', 'front'];
const PET_LABELS = new Set(['dog', 'cat', 'pet', 'animal']);

// Natural-language descriptions that anchor Nano Banana 2 to the loved one
// we just merged in. Without these, the model picks a person at random from
// the merged scene and halos/wings land on the wrong subject.
const PLACEMENT_SUBJECT_DESCRIPTION: Record<Placement, Record<'person' | 'pet', string>> = {
  left: {
    person: 'the person on the far left side of the photo (the one most recently added to this group)',
    pet: 'the pet on the far left side of the photo (the one most recently added to this group)',
  },
  right: {
    person: 'the person on the far right side of the photo (the one most recently added to this group)',
    pet: 'the pet on the far right side of the photo (the one most recently added to this group)',
  },
  behind: {
    person: 'the person standing behind the others in the background (the one most recently added to this group)',
    pet: 'the pet standing behind the others in the background (the one most recently added to this group)',
  },
  front: {
    person: 'the person in the foreground closest to the camera (the one most recently added to this group)',
    pet: 'the pet in the foreground closest to the camera (the one most recently added to this group)',
  },
};

export function ReuniteFlow() {
  const nav = useNavigation();
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);

  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [lovedUrl, setLovedUrl] = useState<string | null>(null);
  const [lovedIsPet, setLovedIsPet] = useState(false);

  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [sizeAdjustment, setSizeAdjustment] = useState(1.0);

  const [templates, setTemplates] = useState<TributeTemplate[]>([]);

  useEffect(() => {
    fetchTemplates()
      .then((t) => {
        setTemplates(t);
        preloadSampleImages(t);
      })
      .catch((err) => setError(`Couldn't load styles. ${err.message}`));
  }, []);

  const handleBack = () => {
    switch (step) {
      case 'upload':
        nav.pop();
        break;
      case 'placement':
        setStep('upload');
        break;
      case 'review':
        setMergedUrl(null);
        setStep('placement');
        break;
      case 'editor':
        setStep('review');
        break;
      default:
        break;
    }
  };

  const handleMainUpload = async (file: File) => {
    setError(null);
    try {
      const upload = await uploadFile(file);
      setMainUrl(upload.url);
    } catch (err) {
      setError(`Couldn't receive the main photo. ${(err as Error).message}`);
    }
  };

  const handleLovedUpload = async (file: File) => {
    setError(null);
    try {
      const upload = await uploadFile(file);
      setLovedUrl(upload.url);
      // Probe the loved-one photo to see if they uploaded a pet. SAM 3 labels
      // are "person"/"dog"/"cat" — the dominant subject tells us which
      // template set to show in the editor later on.
      try {
        const seg = await segmentImage(upload.url, true);
        const dominant = seg.subjects[0]?.label?.toLowerCase();
        setLovedIsPet(dominant ? PET_LABELS.has(dominant) : false);
      } catch {
        setLovedIsPet(false); // Safe default — human templates.
      }
    } catch (err) {
      setError(`Couldn't receive the photo. ${(err as Error).message}`);
    }
  };

  // Single API call with both placement AND size
  const handleBringTogether = async () => {
    if (!mainUrl || !lovedUrl || !placement) return;
    setError(null);
    setStep('merging');
    try {
      const result = await mergePhotos({
        mainPhotoUrl: mainUrl,
        lovedOnePhotoUrl: lovedUrl,
        placement,
        isPet: lovedIsPet,
        sizeAdjustment: sizeAdjustment !== 1.0 ? sizeAdjustment : undefined,
      });
      setMergedUrl(result.imageUrl);
      setStep('review');
    } catch (err) {
      console.error('[ReuniteFlow] merge failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`${COPY.reunite.mergeFailed} (merge: ${msg})`);
      setStep('placement');
    }
  };

  const handleTryAgain = () => {
    setMergedUrl(null);
    setStep('placement');
    // Keep placement and size selections so user can tweak
  };

  const handleLooksGood = () => {
    setStep('editor');
  };

  const handleStartOver = () => {
    setStep('upload');
    setMainUrl(null);
    setLovedUrl(null);
    setLovedIsPet(false);
    setPlacement(null);
    setMergedUrl(null);
    setSizeAdjustment(1.0);
    setError(null);
  };

  return (
    <div className="screen-content">
      {step !== 'merging' && (
        <div className="screen-header">
          <BackButton onClick={handleBack} />
          <h2>
            {step === 'upload' && COPY.reunite.upload.heading}
            {step === 'placement' && COPY.reunite.placement.heading}
            {step === 'review' && COPY.reunite.review.heading}
            {step === 'editor' && COPY.home.reunite.title}
          </h2>
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ margin: '0 1.25rem 1rem' }}>
          {error}
          <div className="error-actions">
            <button type="button" className="ghost" onClick={handleBack}>
              {COPY.errors.mergeWrong.goBack}
            </button>
            <button type="button" className="primary" onClick={() => setError(null)}>
              {COPY.errors.general.button}
            </button>
          </div>
        </div>
      )}

      {step === 'upload' && (
        <div style={{ padding: '0 1.25rem' }}>
          <div className="card">
            <p>{COPY.reunite.upload.subtext}</p>
            <div className="dual-upload">
              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  {COPY.reunite.upload.heading}
                </p>
                <UploadZone
                  label={COPY.reunite.upload.heading}
                  hint={COPY.reunite.upload.subtext}
                  onFileSelected={handleMainUpload}
                />
              </div>
              <div>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  {COPY.reunite.upload.lovedHeading}
                </p>
                <UploadZone
                  label={COPY.reunite.upload.lovedHeading}
                  hint={COPY.reunite.upload.lovedSubtext}
                  onFileSelected={handleLovedUpload}
                />
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                marginTop: '1rem',
              }}
            >
              <span className="muted">
                {mainUrl ? '\u2713 Main photo' : '\u25CB Main photo'}
                {' \u00b7 '}
                {lovedUrl ? '\u2713 Their photo' : '\u25CB Their photo'}
              </span>
              <button
                className="primary"
                disabled={!mainUrl || !lovedUrl}
                onClick={() => setStep('placement')}
              >
                {COPY.reunite.upload.continueButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combined placement + size screen with reference photo and live overlay */}
      {step === 'placement' && (
        <div style={{ padding: '0 1.25rem' }}>
          <div className="card">
            {/* Main photo. Before a placement is picked, show a small corner
                thumbnail for context. After a placement is picked, render a
                larger overlay anchored to that region and scale it live with
                the size slider — no API call on drag. */}
            <div className="placement-photo-preview">
              {mainUrl && (
                <div className="placement-photo-frame">
                  <img src={mainUrl} alt="Main photo" className="placement-main-photo" />
                  {lovedUrl && !placement && (
                    <img
                      src={lovedUrl}
                      alt="Loved one"
                      className="placement-corner-thumb"
                    />
                  )}
                  {lovedUrl && placement && (
                    <img
                      src={lovedUrl}
                      alt="Loved one preview"
                      className={`placement-live-overlay placement-overlay-${placement}`}
                      style={{ transform: `translate(-50%, -50%) scale(${sizeAdjustment})` }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="placement-grid" role="radiogroup" aria-label="Placement">
              {PLACEMENT_KEYS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={placement === p}
                  className={`placement-card${placement === p ? ' selected' : ''}`}
                  onClick={() => setPlacement(p)}
                >
                  {COPY.reunite.placement.options[p]}
                </button>
              ))}
            </div>

            <div className="size-slider">
              <label>{COPY.reunite.placement.sizeLabel}</label>
              <div className="size-slider-track">
                <span>{COPY.reunite.placement.sizeSmaller}</span>
                <input
                  type="range"
                  min="0.7"
                  max="1.4"
                  step="0.05"
                  value={sizeAdjustment}
                  disabled={!placement}
                  onChange={(e) => setSizeAdjustment(parseFloat(e.target.value))}
                  aria-label={COPY.reunite.placement.sizeLabel}
                />
                <span>{COPY.reunite.placement.sizeLarger}</span>
              </div>
            </div>

            <button
              type="button"
              className="primary"
              style={{ width: '100%' }}
              disabled={!placement}
              onClick={handleBringTogether}
            >
              {COPY.reunite.placement.confirmButton}
            </button>
          </div>
        </div>
      )}

      {step === 'merging' && (
        <div className="loading-overlay" style={{ margin: '2rem 1.25rem' }}>
          <div className="spinner" />
          <h3>{COPY.reunite.merging.message}</h3>
          <p className="muted">{COPY.reunite.merging.hint}</p>
        </div>
      )}

      {step === 'review' && mergedUrl && (
        <div className="merge-review">
          <div className="review-image">
            <img src={mergedUrl} alt="Merged result" />
          </div>
          <div className="review-actions">
            <button type="button" className="ghost" onClick={handleTryAgain}>
              {COPY.reunite.review.tryDifferent}
            </button>
            <button type="button" className="primary" onClick={handleLooksGood}>
              {COPY.reunite.review.looksGood}
            </button>
          </div>
        </div>
      )}

      {step === 'editor' && mergedUrl && (
        <div style={{ padding: '0 1.25rem' }}>
          <Editor
            baseImageUrl={mergedUrl}
            templates={templates}
            isPet={lovedIsPet}
            subjectName={
              placement
                ? PLACEMENT_SUBJECT_DESCRIPTION[placement][lovedIsPet ? 'pet' : 'person']
                : undefined
            }
            onStartOver={handleStartOver}
            onTryDifferentPosition={handleTryAgain}
            onBack={handleBack}
          />
        </div>
      )}
    </div>
  );
}
