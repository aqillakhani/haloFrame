import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TributeTemplate } from '@haloframe/shared';
import { motion, useReducedMotion } from 'framer-motion';
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
import { SavedModal } from '../components/SavedModal';
import { AIConsentModal } from '../components/AIConsentModal';
import { useConsent } from '../hooks/useConsent';
import { hasConsented as hasConsentedSync } from '../lib/consent';
import { pickPhoto, type PickedPhoto } from '../lib/photoPicker';
import { heroText, cardReveal } from '../lib/motion';
import { Editor } from './Editor';

type Placement = 'left' | 'right' | 'behind' | 'front';
type Step = 'upload' | 'placement' | 'merging' | 'review' | 'editor';

interface FileMeta {
  name: string;
  sizeKb: number;
}

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
  const [mainMeta, setMainMeta] = useState<FileMeta | null>(null);
  const [lovedUrl, setLovedUrl] = useState<string | null>(null);
  const [lovedMeta, setLovedMeta] = useState<FileMeta | null>(null);
  // Background-stripped version of the loved one photo. Used for the
  // placement preview overlay only; the merge endpoint still receives the
  // original photo (Nano Banana 2 handles lighting integration from full
  // photos better than from transparent cutouts).
  const [lovedCutoutUrl, setLovedCutoutUrl] = useState<string | null>(null);
  const [lovedIsPet, setLovedIsPet] = useState(false);

  // Subject-size metadata used to keep the placement preview in sync with
  // the server's `mergeSizeEnforcer`, which scales the loved one RELATIVE
  // to the average existing-person bbox height in the main photo. Without
  // these, the preview was a fixed 24%-of-frame box — too small for close
  // family portraits where neighbors fill most of the frame.
  const [mainNeighborRelHeight, setMainNeighborRelHeight] = useState<number | null>(null);
  const [lovedSubjectRelHeight, setLovedSubjectRelHeight] = useState<number | null>(null);

  // Main-photo geometry used by the placement preview. Without these, the
  // .reunite-photo-inner is hardcoded 4:5 portrait + object-fit:cover, which
  // crops landscape main photos so badly that the user sees only ~53% of
  // the original (plus the loved-one overlay sits at frame-bottom 6%, well
  // BELOW the family's actual ground line). Setting both lets the preview
  // mirror the final composition: the FULL main is visible, and the loved
  // one anchors at the family's hip/foot line instead of the frame edge.
  //   - mainAspect: width / height of the uploaded main (e.g. 1.503 for a
  //     landscape 1536×1022). Drives `--main-aspect` on the photo-inner.
  //   - mainGroundLineFromBottom: distance from the frame bottom to the
  //     family's lowest bbox bottom, as a fraction of frame height. Drives
  //     `--cutout-bottom-frac` for the cutout overlay.
  const [mainAspect, setMainAspect] = useState<number | null>(null);
  const [mainGroundLineFromBottom, setMainGroundLineFromBottom] = useState<number | null>(null);

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

  // AI consent gate — Apple guideline 5.1.2(i). Modal is shown before the
  // first upload of either photo; once granted, all subsequent uploads pass
  // straight through. We bypass useConsent's React state for the gate check
  // (hasConsentedSync reads localStorage directly) so the recursive re-call
  // after `await grant()` doesn't see a stale closure.
  const { grant: grantConsent } = useConsent();
  const [pendingUpload, setPendingUpload] = useState<
    { kind: 'main' | 'loved'; file: File } | null
  >(null);
  const [consentOpen, setConsentOpen] = useState(false);

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
    if (!hasConsentedSync()) {
      setPendingUpload({ kind: 'main', file });
      setConsentOpen(true);
      return;
    }
    setError(null);
    setMainMeta({ name: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)) });
    setMainNeighborRelHeight(null);
    setMainAspect(null);
    setMainGroundLineFromBottom(null);
    try {
      const upload = await uploadFile(file);
      setMainUrl(upload.url);
      // Segment the main photo in the background so the placement preview
      // can size the loved-one cutout the same way the server does
      // (avgNeighborHeight × sizeAdjustment) AND anchor it at the family's
      // ground line instead of the frame edge. Runs in parallel with the
      // user picking a placement — if it's still pending when they reach
      // the preview, the CSS falls back to a neutral default.
      try {
        const seg = await segmentImage(upload.url, false, false);
        if (seg.imageWidth > 0 && seg.imageHeight > 0) {
          setMainAspect(seg.imageWidth / seg.imageHeight);
        }
        if (seg.subjects.length > 0 && seg.imageHeight > 0) {
          const totalH = seg.subjects.reduce(
            (sum, s) => sum + (s.bbox[3] - s.bbox[1]),
            0,
          );
          const avgH = totalH / seg.subjects.length;
          if (avgH > 0) setMainNeighborRelHeight(avgH / seg.imageHeight);

          // Family ground line = lowest bbox bottom across all detected
          // subjects, expressed as fraction-from-frame-bottom. For a
          // family sitting in grass with hips at y=850 / imageH=1022,
          // this is 1 - (850 / 1022) = 0.168 → cutout overlay anchors
          // at 16.8% from frame bottom, lining up with their hips.
          // Anchoring at frame bottom (the 6% legacy default) puts the
          // loved one BELOW the ground line, which reads as "she's
          // sunken into the ground" or "her body is cut off."
          const lowestBottom = seg.subjects.reduce(
            (lo, s) => Math.max(lo, s.bbox[3]),
            0,
          );
          if (lowestBottom > 0 && lowestBottom <= seg.imageHeight) {
            setMainGroundLineFromBottom(1 - lowestBottom / seg.imageHeight);
          }
        }
      } catch (segErr) {
        // Non-fatal; preview uses a neutral default.
        console.warn('[ReuniteFlow] main-segmentation failed', segErr);
      }
    } catch (err) {
      console.error('[ReuniteFlow] main-upload failed', err);
      setError(COPY.errors.uploadPhoto);
      setMainMeta(null);
    }
  };

  const handleMainClear = () => {
    setMainUrl(null);
    setMainMeta(null);
    setMainNeighborRelHeight(null);
    setMainAspect(null);
    setMainGroundLineFromBottom(null);
  };

  const handleLovedUpload = async (file: File) => {
    if (!hasConsentedSync()) {
      setPendingUpload({ kind: 'loved', file });
      setConsentOpen(true);
      return;
    }
    setError(null);
    setLovedCutoutUrl(null);
    setLovedSubjectRelHeight(null);
    setLovedMeta({ name: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)) });
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
        // Subject's vertical span inside the source photo. Paired with
        // mainNeighborRelHeight, this lets the preview display the cutout
        // such that the VISIBLE person tracks the server's merge target.
        const subjectBbox = seg.subjects[0]?.bbox;
        if (subjectBbox && seg.imageHeight > 0) {
          const h = subjectBbox[3] - subjectBbox[1];
          if (h > 0) setLovedSubjectRelHeight(h / seg.imageHeight);
        }
      } catch {
        setLovedIsPet(false);
      }
    } catch (err) {
      console.error('[ReuniteFlow] loved-upload failed', err);
      setError(COPY.errors.uploadPhoto);
      setLovedMeta(null);
    }
  };

  const handleLovedClear = () => {
    setLovedUrl(null);
    setLovedCutoutUrl(null);
    setLovedMeta(null);
    setLovedIsPet(false);
    setLovedSubjectRelHeight(null);
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

  const handleTryAgain = () => {
    setMergedUrl(null);
    setStep('placement');
  };

  const handleStartOver = () => {
    setStep('upload');
    setMainUrl(null);
    setMainMeta(null);
    setLovedUrl(null);
    setLovedMeta(null);
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

  // The editor is its own screen (own header, own layout) — render it
  // bare without any ReuniteFlow chrome.
  if (step === 'editor' && mergedUrl) {
    return (
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
    );
  }

  return (
    <div className="reunite" data-step={step}>
      <header className="reunite-chrome">
        <button
          type="button"
          className="reunite-back"
          onClick={handleBack}
          disabled={step === 'merging'}
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <StepDots step={step} />
      </header>

      <main className="reunite-content">
        {error && (
          <div className="reunite-inline-error" role="alert" aria-live="polite">
            {error}
          </div>
        )}

        {step === 'upload' && (
          <UploadPane
            mainUrl={mainUrl}
            mainMeta={mainMeta}
            lovedUrl={lovedUrl}
            lovedMeta={lovedMeta}
            lovedCutoutUrl={lovedCutoutUrl}
            onMainUpload={handleMainUpload}
            onMainClear={handleMainClear}
            onLovedUpload={handleLovedUpload}
            onLovedClear={handleLovedClear}
            onContinue={() => setStep('placement')}
          />
        )}

        {step === 'placement' && mainUrl && (
          <PlacementPane
            mainUrl={mainUrl}
            lovedCutoutUrl={lovedCutoutUrl}
            lovedUrl={lovedUrl}
            placement={placement}
            sizeAdjustment={sizeAdjustment}
            mainNeighborRelHeight={mainNeighborRelHeight}
            lovedSubjectRelHeight={lovedSubjectRelHeight}
            mainAspect={mainAspect}
            mainGroundLineFromBottom={mainGroundLineFromBottom}
            onPlacementChange={setPlacement}
            onSizeChange={setSizeAdjustment}
            onConfirm={handleBringTogether}
          />
        )}

        {step === 'merging' && (
          <MergingPane photoUrl={mainUrl} mainAspect={mainAspect} />
        )}

        {step === 'review' && mergedUrl && (
          <ReviewPane
            mergedUrl={mergedUrl}
            mainAspect={mainAspect}
            onAddStyles={handleAddStyles}
            onSave={handleSavePhoto}
            onTryAgain={handleTryAgain}
          />
        )}
      </main>

      <SavedModal
        open={savedModalOpen}
        onOrderCanvas={handleOrderCanvas}
        onStartAnother={handleStartAnother}
        onClose={() => setSavedModalOpen(false)}
      />

      <AIConsentModal
        open={consentOpen}
        onAccept={async () => {
          await grantConsent();
          setConsentOpen(false);
          if (pendingUpload) {
            const { kind, file } = pendingUpload;
            setPendingUpload(null);
            // hasConsentedSync now returns true (localStorage just updated),
            // so the recursive call falls through to the real upload logic.
            if (kind === 'main') {
              void handleMainUpload(file);
            } else {
              void handleLovedUpload(file);
            }
          }
        }}
        onDecline={() => {
          setConsentOpen(false);
          setPendingUpload(null);
        }}
      />
    </div>
  );
}

/* ---------- Step dots ---------- */

interface StepDotsProps {
  step: Step;
}

function StepDots({ step }: StepDotsProps) {
  const STEPS: Step[] = ['upload', 'placement', 'merging', 'review'];
  const currentIndex = Math.max(STEPS.indexOf(step), 0);
  const label = COPY.reunite
    .stepLabel(currentIndex + 1, STEPS.length)
    .toUpperCase();
  return (
    <div className="reunite-stepdots" aria-label="Step indicator">
      <span className="reunite-stepdots-label">{label}</span>
      <span className="reunite-stepdots-dots" aria-hidden>
        {STEPS.map((s, i) => {
          let cls = 'reunite-stepdot';
          if (i < currentIndex) cls += ' reunite-stepdot--done';
          else if (i === currentIndex) cls += ' reunite-stepdot--on';
          return <i key={s} className={cls} />;
        })}
      </span>
    </div>
  );
}

/* ---------- Upload pane ---------- */

interface UploadPaneProps {
  mainUrl: string | null;
  mainMeta: FileMeta | null;
  lovedUrl: string | null;
  lovedMeta: FileMeta | null;
  lovedCutoutUrl: string | null;
  onMainUpload: (file: File) => void;
  onMainClear: () => void;
  onLovedUpload: (file: File) => void;
  onLovedClear: () => void;
  onContinue: () => void;
}

function UploadPane({
  mainUrl,
  mainMeta,
  lovedUrl,
  lovedMeta,
  lovedCutoutUrl,
  onMainUpload,
  onMainClear,
  onLovedUpload,
  onLovedClear,
  onContinue,
}: UploadPaneProps) {
  const bothReady = Boolean(mainUrl && lovedUrl);
  return (
    <motion.section
      className="reunite-pane reunite-pane-upload"
      aria-labelledby="reunite-upload-heading"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="reunite-eyebrow">
        <span className="reunite-eyebrow-dot" aria-hidden />
        {COPY.reunite.uploadEyebrow.toUpperCase()}
      </span>
      <h1 className="reunite-display" id="reunite-upload-heading">
        {COPY.reunite.upload.headingBefore}
        <em>{COPY.reunite.upload.headingItalic}</em>
        {COPY.reunite.upload.headingAfter}
      </h1>
      <p className="reunite-subhead">{COPY.reunite.upload.subhead}</p>

      <motion.div
        className="reunite-cards-grid"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={0}
      >
        <UploadCard
          kicker={COPY.reunite.cardKickerMain}
          heading={COPY.reunite.upload.heading}
          sub={COPY.reunite.upload.subtext}
          illustration={<MainPhotoIllustration />}
          uploadLabel={COPY.reunite.chooseMainCta}
          previewUrl={mainUrl}
          previewUsesCutout={false}
          meta={mainMeta}
          onFile={onMainUpload}
          onClear={onMainClear}
        />
        <UploadCard
          kicker={COPY.reunite.cardKickerLoved}
          heading={COPY.reunite.upload.lovedHeading}
          sub={COPY.reunite.upload.lovedSubtext}
          illustration={<LovedPhotoIllustration />}
          uploadLabel={COPY.reunite.chooseLovedCta}
          previewUrl={lovedCutoutUrl ?? lovedUrl}
          previewUsesCutout={Boolean(lovedCutoutUrl)}
          meta={lovedMeta}
          onFile={onLovedUpload}
          onClear={onLovedClear}
        />
      </motion.div>

      <div className="reunite-cta-footer">
        <button
          type="button"
          className="reunite-primary-btn reunite-primary-btn--full"
          disabled={!bothReady}
          onClick={onContinue}
        >
          {bothReady
            ? COPY.reunite.upload.continueButton
            : COPY.reunite.continueDisabledCta}
        </button>
      </div>
    </motion.section>
  );
}

/* ---------- Upload card (single photo slot) ---------- */

interface UploadCardProps {
  kicker: string;
  heading: string;
  sub: string;
  illustration: React.ReactNode;
  uploadLabel: string;
  previewUrl: string | null;
  previewUsesCutout: boolean;
  meta: FileMeta | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

function UploadCard({
  kicker,
  heading,
  sub,
  illustration,
  uploadLabel,
  previewUrl,
  previewUsesCutout,
  meta,
  onFile,
  onClear,
}: UploadCardProps) {
  // Local error for a pick that opened but couldn't produce bytes — without
  // it a failed read bailed silently and the user's tap did nothing (the
  // TestFlight gallery-upload bug's UX symptom).
  const [pickError, setPickError] = useState<string | null>(null);

  // Platform-aware picker: native uses Capacitor's out-of-process picker
  // (Apple 5.1.1(iii)); web falls back to <input type=file>. The wrapper
  // returns a Blob we wrap in a File so onFile's contract is unchanged.
  const openPicker = async () => {
    setPickError(null);
    let photo: PickedPhoto | null = null;
    try {
      photo = await pickPhoto();
    } catch (err) {
      console.error('[ReuniteFlow] photo picker failed', err);
      setPickError(COPY.errors.readPhoto);
      return;
    }
    if (!photo) return; // user cancelled
    if (!photo.blob) {
      setPickError(COPY.errors.readPhoto);
      return;
    }
    const ext = photo.format?.includes('png') ? 'png' : 'jpg';
    const file = new File([photo.blob], `upload.${ext}`, {
      type: photo.format ?? 'image/jpeg',
    });
    onFile(file);
  };
  const filled = Boolean(previewUrl && meta);
  return (
    <div className={`reunite-card${filled ? ' reunite-card--filled' : ''}`}>
      <div className="reunite-card-kicker">{kicker}</div>
      <h2 className="reunite-card-heading">{heading}</h2>
      <p className="reunite-card-sub">{sub}</p>

      {filled && previewUrl && meta ? (
        <div className="reunite-uploader reunite-uploader--filled">
          <div
            className={`reunite-preview-thumb${
              previewUsesCutout ? ' reunite-preview-thumb--cutout' : ''
            }`}
          >
            <img src={previewUrl} alt="" aria-hidden />
          </div>
          <div className="reunite-preview-meta">
            <div className="reunite-preview-name">{meta.name}</div>
            <div className="reunite-preview-ready">
              {meta.sizeKb} KB · {COPY.reunite.previewFileReady.toUpperCase()}
            </div>
          </div>
          <button
            type="button"
            className="reunite-quiet-btn"
            onClick={onClear}
          >
            {COPY.reunite.changeCta}
          </button>
        </div>
      ) : (
        <div className="reunite-uploader">
          <div className="reunite-uploader-illus" aria-hidden>
            {illustration}
          </div>
          <div className="reunite-mono-caps">
            {COPY.reunite.uploadHint}
          </div>
          <button
            type="button"
            className="reunite-primary-btn"
            onClick={() => {
              void openPicker();
            }}
            aria-label={uploadLabel}
          >
            {uploadLabel}
          </button>
          {pickError && (
            <div
              className="reunite-inline-error"
              role="alert"
              aria-live="polite"
            >
              {pickError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Placement pane ---------- */

interface PlacementPaneProps {
  mainUrl: string;
  lovedCutoutUrl: string | null;
  lovedUrl: string | null;
  placement: Placement;
  sizeAdjustment: number;
  mainNeighborRelHeight: number | null;
  lovedSubjectRelHeight: number | null;
  mainAspect: number | null;
  mainGroundLineFromBottom: number | null;
  onPlacementChange: (p: Placement) => void;
  onSizeChange: (n: number) => void;
  onConfirm: () => void;
}

function PlacementPane({
  mainUrl,
  lovedCutoutUrl,
  lovedUrl,
  placement,
  sizeAdjustment,
  mainNeighborRelHeight,
  lovedSubjectRelHeight,
  mainAspect,
  mainGroundLineFromBottom,
  onPlacementChange,
  onSizeChange,
  onConfirm,
}: PlacementPaneProps) {
  // Aspect of the trimmed cutout PNG (width / height of the rembg-trimmed
  // bbox). Used to estimate what fraction of a "full body" the cutout
  // actually contains: head-shots come out square (~1.0), half-body is
  // ~0.5, full-body is ~0.3. Without this we can't tell whether the cutout
  // image fills its render box with just a head or with a whole person —
  // and that's what determines the right box size for "loved one looks
  // proportional to the family."
  const [lovedCutoutAspect, setLovedCutoutAspect] = useState<number | null>(null);
  // Prefer the background-stripped PNG; fall back to the raw upload so
  // users still see SOMETHING if rembg fails or is still in flight. The
  // CSS now uses `object-fit: contain` in both cases, so the raw-upload
  // fallback no longer crops the loved one's head (previously `cover`
  // clipped heads/feet on typical aspect ratios — the "cut off" bug).
  const overlaySrc = lovedCutoutUrl ?? lovedUrl;
  const usingTrimmedCutout = lovedCutoutUrl != null;

  // Compute the cutout box height as a fraction of frame-height. The
  // cutout PNG fills the box edge-to-edge, so this directly determines
  // the visible loved-one size in preview.
  //
  // Naive sizing — cutoutHFrac = mainNeighborRelHeight (so loved-one
  // bbox visually matches family bbox) — produces a "head balloon" for
  // head-shot sources: the trimmed cutout contains ONLY her head and
  // shoulders, so when that fills a box sized for "head-to-hips," her
  // head ends up roughly twice the size of any family member's head.
  //
  // Fix: scale the box by `bodyFraction(cutoutAspect)` — an estimate of
  // what fraction of a full body the trimmed cutout actually depicts.
  // The cutout PNG's natural aspect (W/H) is the cheapest proxy:
  //
  //   - aspect ≥ 0.85 (square-ish): head or head+shoulders crop. Visible
  //     content represents ~head+shoulders of a person → ~40% of body.
  //   - aspect 0.60–0.85: head + chest, ~55% of body.
  //   - aspect 0.40–0.60: half-body / waist-up, ~75% of body.
  //   - aspect < 0.40: full body, 100%.
  //
  // Net result for the calibration test pair (head-shot loved one,
  // mainNeighborRelHeight=0.455): cutoutHFrac drops from 0.455 → 0.182,
  // and her face renders at roughly the same size as the family's faces
  // instead of dominating the frame.
  //
  // Raw-upload fallback (rembg failed): the cutout shows the whole
  // source, so we have to inflate by 1/lovedSubjectRelHeight to extract
  // the same visible-subject size. The 0.55 here is the average of the
  // bodyFraction tiers above — best guess without the cutout aspect.
  //
  // Cap at 0.95 so a freakish measurement doesn't render a box taller
  // than the frame itself.
  const cutoutHFrac = (() => {
    if (mainNeighborRelHeight == null) return null;
    if (usingTrimmedCutout) {
      const aspect = lovedCutoutAspect ?? 1.0;
      const bodyFraction =
        aspect >= 0.85 ? 0.40
        : aspect >= 0.60 ? 0.55
        : aspect >= 0.40 ? 0.75
        : 1.0;
      return Math.min(mainNeighborRelHeight * bodyFraction, 0.95);
    }
    if (lovedSubjectRelHeight == null || lovedSubjectRelHeight <= 0) {
      return null;
    }
    return Math.min((mainNeighborRelHeight * 0.55) / lovedSubjectRelHeight, 0.95);
  })();

  // Family bbox TOP from frame TOP, used to anchor the cutout's top
  // edge at the family's head line. Without this, a small (head-shot)
  // cutout bottom-anchored at the ground line puts the loved one's
  // head at the family's KNEE level — she reads as kneeling/sunken.
  // Top-anchoring at the family head line keeps her face-to-face with
  // the family no matter how small the cutout is.
  const cutoutTopFromTop =
    mainGroundLineFromBottom != null && mainNeighborRelHeight != null
      ? Math.max(0, 1 - mainGroundLineFromBottom - mainNeighborRelHeight)
      : null;

  const innerStyle: Record<string, string | number> = {
    ['--scale']: sizeAdjustment,
  };
  if (cutoutHFrac != null) {
    innerStyle['--cutout-h-frac'] = cutoutHFrac;
  }
  // Make the frame's aspect match the main photo. Without this it's
  // hardcoded 4:5 portrait + object-fit:cover, which crops landscape
  // mains so badly the user sees only the middle ~53% — and the
  // loved-one overlay then sits at the wrong spot relative to the
  // visible family.
  if (mainAspect != null && mainAspect > 0) {
    innerStyle['--main-aspect'] = `${mainAspect}`;
  }
  // Anchor the cutout's TOP at the family's head TOP. This pairs with
  // the bodyFraction-based cutoutHFrac above so a head-shot loved one
  // lands face-to-face with the family instead of either (a) ballooning
  // to family-body size or (b) sinking her head down to family knee
  // level. CSS uses --cutout-top-frac via top:; the prior --cutout-
  // bottom-frac approach is no longer set.
  if (cutoutTopFromTop != null) {
    innerStyle['--cutout-top-frac'] = cutoutTopFromTop;
  }
  return (
    <motion.section
      className="reunite-pane reunite-pane-placement"
      aria-labelledby="reunite-place-heading"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="reunite-eyebrow reunite-eyebrow--terracotta">
        <span className="reunite-eyebrow-dot" aria-hidden />
        {COPY.reunite.placementEyebrow.toUpperCase()}
      </span>
      <h1 className="reunite-display" id="reunite-place-heading">
        {COPY.reunite.placement.headingBefore}
        <em>{COPY.reunite.placement.headingItalic}</em>
        {COPY.reunite.placement.headingAfter}
      </h1>
      <p className="reunite-subhead">{COPY.reunite.placement.subhead}</p>

      <div className="reunite-photo-frame">
        <span className="reunite-corner reunite-corner--tl" aria-hidden />
        <span className="reunite-corner reunite-corner--tr" aria-hidden />
        <span className="reunite-corner reunite-corner--bl" aria-hidden />
        <span className="reunite-corner reunite-corner--br" aria-hidden />
        <div
          className="reunite-photo-inner"
          data-placement={placement}
          style={innerStyle as CSSProperties}
        >
          <img
            src={mainUrl}
            alt="Main photo"
            className="reunite-photo-main"
          />
          {overlaySrc && (
            <div className="reunite-cutout reunite-cutout--transparent">
              <span className="reunite-rough-badge" aria-hidden>
                {COPY.reunite.placement.roughBadge}
              </span>
              <img
                src={overlaySrc}
                alt=""
                aria-hidden
                onLoad={(e) => {
                  // Size the cutout box to the PNG's natural aspect so the
                  // image fills the box cleanly (no letterboxing/pillaring).
                  // Falls back to the 3/5 CSS default if this never fires.
                  // Also lift the aspect into React state so cutoutHFrac's
                  // body-fraction heuristic can use it (head-shot crops are
                  // square-ish; full-body crops are tall+narrow).
                  const img = e.currentTarget;
                  const host = img.parentElement;
                  if (host && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    host.style.setProperty(
                      '--cutout-aspect',
                      `${img.naturalWidth} / ${img.naturalHeight}`,
                    );
                    setLovedCutoutAspect(img.naturalWidth / img.naturalHeight);
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="reunite-control-row">
        <div className="reunite-control-label">
          <span>
            {COPY.reunite.placement.placeLabelBefore}
            <em className="reunite-italic-accent">
              {COPY.reunite.placement.placeLabelItalic}
            </em>
          </span>
        </div>
        <div
          className="reunite-segmented"
          role="radiogroup"
          aria-label="Placement"
        >
          {PLACEMENT_KEYS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={placement === p}
              aria-pressed={placement === p}
              className="reunite-segment"
              onClick={() => onPlacementChange(p)}
            >
              {COPY.reunite.placement.optionsShort[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="reunite-control-row">
        <div className="reunite-control-label">
          <span>
            {COPY.reunite.placement.sizeLabelBefore}
            <em className="reunite-italic-accent">
              {COPY.reunite.placement.sizeLabelItalic}
            </em>
          </span>
        </div>
        <div className="reunite-slider-wrap">
          <span className="reunite-end-label">
            {COPY.reunite.placement.sizeSmaller}
          </span>
          <input
            type="range"
            min="0.7"
            max="1.4"
            step="0.01"
            value={sizeAdjustment}
            onChange={(e) => onSizeChange(parseFloat(e.target.value))}
            aria-label={COPY.reunite.placement.sizeLabel}
            className="reunite-size-slider"
          />
          <span className="reunite-end-label">
            {COPY.reunite.placement.sizeLarger}
          </span>
        </div>
      </div>

      <div className="reunite-cta-footer">
        <button
          type="button"
          className="reunite-primary-btn reunite-primary-btn--full"
          onClick={onConfirm}
        >
          {COPY.reunite.placement.confirmCta}
        </button>
      </div>
    </motion.section>
  );
}

/* ---------- Merging pane ---------- */

interface MergingPaneProps {
  photoUrl: string | null;
  mainAspect: number | null;
}

function MergingPane({ photoUrl, mainAspect }: MergingPaneProps) {
  const innerStyle: CSSProperties | undefined =
    mainAspect != null && mainAspect > 0
      ? ({ ['--main-aspect']: `${mainAspect}` } as CSSProperties)
      : undefined;
  const prefersReduced = useReducedMotion() ?? false;
  const [captionIndex, setCaptionIndex] = useState(0);
  const messages = COPY.reunite.merging.messages;
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => {
      setCaptionIndex((i) => (i + 1) % messages.length);
    }, 4000);
    return () => clearInterval(id);
  }, [prefersReduced, messages.length]);
  const caption = messages[captionIndex] ?? messages[0];
  return (
    <motion.section
      className="reunite-pane reunite-pane-merging"
      aria-labelledby="reunite-merge-heading"
      aria-live="polite"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="reunite-eyebrow">
        <span className="reunite-eyebrow-dot" aria-hidden />
        {COPY.reunite.mergingEyebrow.toUpperCase()}
      </span>
      <h1 className="reunite-display" id="reunite-merge-heading">
        {COPY.reunite.merging.headingBefore}
        <em>{COPY.reunite.merging.headingItalic}</em>
        {COPY.reunite.merging.headingAfter}
      </h1>

      <div className="reunite-merging-stage">
        <div className="reunite-photo-frame">
          <span className="reunite-corner reunite-corner--tl" aria-hidden />
          <span className="reunite-corner reunite-corner--tr" aria-hidden />
          <span className="reunite-corner reunite-corner--bl" aria-hidden />
          <span className="reunite-corner reunite-corner--br" aria-hidden />
          <div className="reunite-photo-inner reunite-photo-inner--merging" style={innerStyle}>
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="reunite-photo-main reunite-photo-main--dim"
                aria-hidden
              />
            ) : (
              <div className="reunite-photo-placeholder" aria-hidden />
            )}
            <div
              className="reunite-halo"
              data-reduced={prefersReduced ? 'true' : 'false'}
              aria-hidden
            />
            <div
              className="reunite-halo-ring"
              data-reduced={prefersReduced ? 'true' : 'false'}
              aria-hidden
            />
            {!prefersReduced && (
              <div className="reunite-motes" aria-hidden>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            )}
            <div className="reunite-arcs" aria-hidden>
              <div className="reunite-arc reunite-arc--left" />
              <div className="reunite-arc reunite-arc--right" />
            </div>
          </div>
        </div>
      </div>

      <p className="reunite-merging-caption">{caption}</p>
      <p className="reunite-merging-hint">
        {COPY.reunite.merging.hint.toUpperCase()}
      </p>
    </motion.section>
  );
}

/* ---------- Review pane ---------- */

interface ReviewPaneProps {
  mergedUrl: string;
  mainAspect: number | null;
  onAddStyles: () => void;
  onSave: () => void;
  onTryAgain: () => void;
}

function ReviewPane({ mergedUrl, mainAspect, onAddStyles, onSave, onTryAgain }: ReviewPaneProps) {
  // The merged result has the same aspect as the main (pristine
  // passthrough preserves it), so the same --main-aspect that drove
  // the placement preview drives the review preview too.
  const innerStyle: CSSProperties | undefined =
    mainAspect != null && mainAspect > 0
      ? ({ ['--main-aspect']: `${mainAspect}` } as CSSProperties)
      : undefined;
  return (
    <motion.section
      className="reunite-pane reunite-pane-review"
      aria-labelledby="reunite-review-heading"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="reunite-eyebrow reunite-eyebrow--terracotta">
        <span className="reunite-eyebrow-dot" aria-hidden />
        {COPY.reunite.reviewEyebrow.toUpperCase()}
      </span>
      <h1 className="reunite-display" id="reunite-review-heading">
        {COPY.reunite.review.headingBefore}
        <em>{COPY.reunite.review.headingItalic}</em>
        {COPY.reunite.review.headingAfter}
      </h1>
      <p className="reunite-subhead">{COPY.reunite.review.subhead}</p>

      <div className="reunite-photo-frame reunite-photo-frame--reveal">
        <span className="reunite-corner reunite-corner--tl" aria-hidden />
        <span className="reunite-corner reunite-corner--tr" aria-hidden />
        <span className="reunite-corner reunite-corner--bl" aria-hidden />
        <span className="reunite-corner reunite-corner--br" aria-hidden />
        <div className="reunite-photo-inner" style={innerStyle}>
          <img
            src={mergedUrl}
            alt="Merged result"
            className="reunite-photo-main"
          />
        </div>
      </div>

      <div className="reunite-review-actions">
        <button
          type="button"
          className="reunite-primary-btn reunite-primary-btn--full"
          onClick={onAddStyles}
        >
          {COPY.reunite.review.addStylesCta}
        </button>
        <button
          type="button"
          className="reunite-ghost-btn reunite-ghost-btn--full"
          onClick={onSave}
        >
          {COPY.reunite.review.savePhotoCta}
        </button>
      </div>
      <div className="reunite-review-try">
        <button
          type="button"
          className="reunite-link-btn"
          onClick={onTryAgain}
        >
          {COPY.reunite.review.tryDifferentCta}
        </button>
      </div>
    </motion.section>
  );
}

/* ---------- Illustrations ---------- */

function MainPhotoIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden>
      <rect x="6" y="16" width="68" height="50" rx="6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="28" cy="36" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M18 58c0-6 4.5-11 10-11s10 5 10 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="44" cy="32" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M32 58c0-7 5.5-13 12-13s12 6 12 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="58" cy="38" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M50 58c0-5 3.5-9 8-9s8 4 8 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LovedPhotoIllustration() {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden>
      <circle cx="40" cy="40" r="28" stroke="currentColor" strokeWidth="0.8" opacity="0.4" strokeDasharray="1 3" />
      <rect x="18" y="14" width="44" height="56" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="40" cy="34" r="8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M24 62c0-8 7-14 16-14s16 6 16 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="40" cy="34" r="13" stroke="#D4A95C" strokeWidth="1" opacity="0.7" strokeDasharray="2 4" />
    </svg>
  );
}
