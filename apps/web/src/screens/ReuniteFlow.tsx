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
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Icon } from '../components/icons/Icon';
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
      .catch((err) => setError(`Couldn't load styles. ${err.message} (tag: fetch-templates)`));
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
      setError(`Couldn't receive the main photo. ${(err as Error).message} (tag: main-upload)`);
    }
  };

  const handleLovedUpload = async (file: File) => {
    setError(null);
    try {
      const upload = await uploadFile(file);
      setLovedUrl(upload.url);
      try {
        const seg = await segmentImage(upload.url, true);
        const dominant = seg.subjects[0]?.label?.toLowerCase();
        setLovedIsPet(dominant ? PET_LABELS.has(dominant) : false);
      } catch {
        setLovedIsPet(false);
      }
    } catch (err) {
      setError(`Couldn't receive the photo. ${(err as Error).message} (tag: loved-upload)`);
    }
  };

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
      setError(`${COPY.reunite.mergeFailed} (tag: merge: ${msg})`);
      setStep('placement');
    }
  };

  const handleTryAgain = () => {
    setMergedUrl(null);
    setStep('placement');
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
    <div className="reunite">
      {step !== 'merging' && (
        <header className="flow-header">
          <BackButton onClick={handleBack} />
          <span className="app-header-title">
            {step === 'upload' && COPY.reunite.upload.heading}
            {step === 'placement' && COPY.reunite.placement.heading}
            {step === 'review' && COPY.reunite.review.heading}
            {step === 'editor' && COPY.home.reunite.title}
          </span>
          <span className="flow-header-spacer" aria-hidden />
        </header>
      )}

      {error && (
        <div className="flow-error" role="alert">
          <p className="t-body-md">{error}</p>
          <div className="flow-error-actions">
            <button type="button" className="btn btn-ghost" onClick={handleBack}>
              {COPY.errors.mergeWrong.goBack}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setError(null)}>
              {COPY.errors.general.button}
            </button>
          </div>
        </div>
      )}

      {step === 'upload' && (
        <section className="flow-pane reunite-upload">
          <p className="t-body-lg t-muted reunite-helper">{COPY.reunite.upload.subtext}</p>
          <div className="reunite-dual">
            <div className="reunite-dual-slot">
              <h3 className="t-display-md reunite-slot-label">{COPY.reunite.upload.heading}</h3>
              <UploadZone
                label={COPY.reunite.upload.heading}
                hint={COPY.reunite.upload.subtext}
                onFileSelected={handleMainUpload}
                previewUrl={mainUrl}
              />
            </div>
            <div className="reunite-dual-slot">
              <h3 className="t-display-md reunite-slot-label">{COPY.reunite.upload.lovedHeading}</h3>
              <UploadZone
                label={COPY.reunite.upload.lovedHeading}
                hint={COPY.reunite.upload.lovedSubtext}
                onFileSelected={handleLovedUpload}
                previewUrl={lovedUrl}
              />
            </div>
          </div>
          <div className="sticky-action">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!mainUrl || !lovedUrl}
              onClick={() => setStep('placement')}
            >
              {COPY.reunite.upload.continueButton} <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 'placement' && (
        <section className="flow-pane reunite-placement">
          {mainUrl && (
            <div className="placement-photo-frame">
              <img src={mainUrl} alt="Main photo" className="placement-main-photo" />
              {lovedUrl && !placement && (
                <img src={lovedUrl} alt="" className="placement-corner-thumb" aria-hidden />
              )}
              {lovedUrl && placement && (
                <img
                  src={lovedUrl}
                  alt=""
                  aria-hidden
                  className={`placement-live-overlay placement-overlay-${placement}`}
                  style={{ transform: `translate(-50%, -50%) scale(${sizeAdjustment})` }}
                />
              )}
            </div>
          )}

          <div className="placement-grid" role="radiogroup" aria-label="Placement">
            {PLACEMENT_KEYS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={placement === p}
                className={`placement-pill${placement === p ? ' placement-pill--active' : ''}`}
                onClick={() => setPlacement(p)}
              >
                {COPY.reunite.placement.options[p]}
              </button>
            ))}
          </div>

          <div className="placement-size">
            <label className="t-label-md placement-size-label">
              {COPY.reunite.placement.sizeLabel}
            </label>
            <div className="placement-size-track">
              <span className="t-body-sm t-muted">{COPY.reunite.placement.sizeSmaller}</span>
              <input
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                value={sizeAdjustment}
                disabled={!placement}
                onChange={(e) => setSizeAdjustment(parseFloat(e.target.value))}
                aria-label={COPY.reunite.placement.sizeLabel}
                className="placement-size-range"
              />
              <span className="t-body-sm t-muted">{COPY.reunite.placement.sizeLarger}</span>
            </div>
          </div>

          <div className="sticky-action">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!placement}
              onClick={handleBringTogether}
            >
              {COPY.reunite.placement.confirmButton} <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 'merging' && (
        <section className="flow-pane reunite-merging">
          <LoadingOverlay
            message={COPY.reunite.merging.message}
            hint={COPY.reunite.merging.hint}
          />
        </section>
      )}

      {step === 'review' && mergedUrl && (
        <section className="flow-pane reunite-review">
          <div className="reunite-review-frame">
            <img src={mergedUrl} alt="Merged result" className="reunite-review-image" />
          </div>
          <div className="reunite-review-actions">
            <button type="button" className="btn btn-ghost" onClick={handleTryAgain}>
              {COPY.reunite.review.tryDifferent}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleLooksGood}>
              {COPY.reunite.review.looksGood} <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 'editor' && mergedUrl && (
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
      )}
    </div>
  );
}
