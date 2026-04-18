import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { TributeTemplate } from '@eternalframe/shared';
import {
  fetchTemplates,
  mergePhotos,
  preloadSampleImages,
  segmentImage,
  uploadFile,
} from '../lib/api';
import { triggerDownload } from '../lib/download';
import { COPY } from '../lib/copy';
import { useNavigation } from '../lib/navigation';
import { BackButton } from '../components/BackButton';
import { UploadZone } from '../components/UploadZone';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { SavedModal } from '../components/SavedModal';
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
  // Background-stripped version of the loved one photo. Used for the
  // placement preview overlay only; the merge endpoint still receives the
  // original photo (Nano Banana 2 handles lighting integration from full
  // photos better than from transparent cutouts).
  const [lovedCutoutUrl, setLovedCutoutUrl] = useState<string | null>(null);
  const [lovedIsPet, setLovedIsPet] = useState(false);

  // Default to 'left' per the product direction: the user almost always
  // wants a specific side, and starting at null forced an extra tap. Left
  // is a safe default because the pre-selection preview thumb used to
  // anchor bottom-right, which confused users about where the loved one
  // would actually land.
  const [placement, setPlacement] = useState<Placement>('left');
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);
  const [sizeAdjustment, setSizeAdjustment] = useState(1.0);
  const [savedModalOpen, setSavedModalOpen] = useState(false);

  const [templates, setTemplates] = useState<TributeTemplate[]>([]);

  useEffect(() => {
    // Cancel the template fetch if the user backs out of the flow before it
    // resolves — they're heading home and the preloaded thumbnails are
    // throwaway. Prevents stale promises from hammering the browser's
    // connection pool and blocking the next flow's upload.
    const controller = new AbortController();
    fetchTemplates(controller.signal)
      .then((t) => {
        setTemplates(t);
        preloadSampleImages(t);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.error('[ReuniteFlow] fetch-templates failed', err);
        setError(COPY.errors.loadStyles);
      });
    return () => controller.abort();
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
      console.error('[ReuniteFlow] main-upload failed', err);
      setError(COPY.errors.uploadPhoto);
    }
  };

  const handleLovedUpload = async (file: File) => {
    setError(null);
    setLovedCutoutUrl(null);
    try {
      const upload = await uploadFile(file);
      setLovedUrl(upload.url);
      try {
        // Ask the server for the subject cutout in the same call that
        // detects pet-vs-person — saves a round trip and keeps the preview
        // honest: the same mask that drives placement also drives pet
        // detection.
        const seg = await segmentImage(upload.url, true, true);
        const dominant = seg.subjects[0]?.label?.toLowerCase();
        setLovedIsPet(dominant ? PET_LABELS.has(dominant) : false);
        if (seg.cutoutUrl) setLovedCutoutUrl(seg.cutoutUrl);
      } catch {
        setLovedIsPet(false);
      }
    } catch (err) {
      console.error('[ReuniteFlow] loved-upload failed', err);
      setError(COPY.errors.uploadPhoto);
    }
  };

  const handleBringTogether = async () => {
    if (!mainUrl || !lovedUrl) return;
    setError(null);
    setStep('merging');
    try {
      const result = await mergePhotos({
        mainPhotoUrl: mainUrl,
        lovedOnePhotoUrl: lovedUrl,
        // Hand the server the transparent cutout so it can pre-composite
        // at exact target pixels. Without this the server falls back to
        // prompt-only sizing, which Nano Banana 2 consistently ignores.
        lovedOneCutoutUrl: lovedCutoutUrl ?? undefined,
        placement,
        isPet: lovedIsPet,
        sizeAdjustment,
      });
      setMergedUrl(result.imageUrl);
      setStep('review');
    } catch (err) {
      console.error('[ReuniteFlow] merge failed', err);
      setError(COPY.reunite.mergeFailed);
      setStep('placement');
    }
  };

  const handleAddStyles = () => {
    setStep('editor');
  };

  const handleSavePhoto = async () => {
    if (!mergedUrl) return;
    await triggerDownload(mergedUrl);
    setSavedModalOpen(true);
  };

  const handleStartOver = () => {
    setStep('upload');
    setMainUrl(null);
    setLovedUrl(null);
    setLovedCutoutUrl(null);
    setLovedIsPet(false);
    setPlacement('left');
    setMergedUrl(null);
    setSizeAdjustment(1.0);
    setSavedModalOpen(false);
    setError(null);
  };

  const handleOrderCanvas = () => {
    setSavedModalOpen(false);
    nav.push('PRINT_SHOP');
  };

  const handleStartAnother = () => {
    setSavedModalOpen(false);
    handleStartOver();
    nav.reset();
  };

  return (
    <div className="reunite">
      {step !== 'merging' && step !== 'editor' && (
        <header className="flow-header">
          <BackButton onClick={handleBack} />
          <span className="app-header-title">
            {step === 'upload' && COPY.reunite.upload.heading}
            {step === 'placement' && COPY.reunite.placement.heading}
            {step === 'review' && COPY.reunite.review.heading}
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
          <div className="flow-action">
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
              {(lovedCutoutUrl ?? lovedUrl) && (
                <img
                  src={lovedCutoutUrl ?? lovedUrl!}
                  alt=""
                  aria-hidden
                  className={`placement-live-overlay placement-overlay-${placement}${
                    lovedCutoutUrl ? ' placement-live-overlay--cutout' : ''
                  }`}
                  style={{ transform: `translate(-50%, -50%) scale(${sizeAdjustment})` }}
                />
              )}
              <span className="placement-rough-badge" aria-hidden>
                {COPY.reunite.placement.previewBadge}
              </span>
            </div>
          )}
          <p className="t-body-sm t-muted placement-rough-hint">
            {COPY.reunite.placement.previewHint}
          </p>

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
                onChange={(e) => setSizeAdjustment(parseFloat(e.target.value))}
                aria-label={COPY.reunite.placement.sizeLabel}
                className="placement-size-range"
              />
              <span className="t-body-sm t-muted">{COPY.reunite.placement.sizeLarger}</span>
            </div>
          </div>

          <div className="placement-action">
            <button
              type="button"
              className="btn btn-primary"
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
            message={COPY.reunite.merging.messages}
            hint={COPY.reunite.merging.hint}
          />
        </section>
      )}

      {step === 'review' && mergedUrl && (
        <section className="flow-pane reunite-review">
          <div className="reunite-review-frame">
            <img src={mergedUrl} alt="Merged result" className="reunite-review-image" />
          </div>
          <motion.div
            className="reunite-review-actions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.56, ease: [0.22, 0.61, 0.36, 1], delay: 0.32 }}
          >
            <button type="button" className="btn btn-ghost" onClick={handleAddStyles}>
              {COPY.reunite.review.addStyles}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSavePhoto}>
              {COPY.reunite.review.savePhoto}
            </button>
          </motion.div>
        </section>
      )}

      {step === 'editor' && mergedUrl && (
        <Editor
          baseImageUrl={mergedUrl}
          templates={templates}
          isPet={lovedIsPet}
          subjectName={
            PLACEMENT_SUBJECT_DESCRIPTION[placement][lovedIsPet ? 'pet' : 'person']
          }
          placement={placement}
          onOrderCanvas={() => nav.push('PRINT_SHOP')}
          onPaywall={() => nav.push('PAYWALL')}
          onBack={handleBack}
        />
      )}

      <SavedModal
        open={savedModalOpen}
        onOrderCanvas={handleOrderCanvas}
        onStartAnother={handleStartAnother}
        onClose={() => setSavedModalOpen(false)}
      />
    </div>
  );
}
