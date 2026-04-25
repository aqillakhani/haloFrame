import { useEffect, useRef, useState } from 'react';
import type { TributeTemplate } from '@haloframe/shared';
import { motion, useReducedMotion } from 'framer-motion';
import {
  fetchTemplates,
  preloadSampleImages,
  segmentImage,
  uploadFile,
  type SegmentResult,
  type Subject,
} from '../lib/api';
import { COPY } from '../lib/copy';
import { useNavigation } from '../lib/navigation';
import { SubjectSelector } from '../components/SubjectSelector';
import { AIConsentModal } from '../components/AIConsentModal';
import { useConsent } from '../hooks/useConsent';
import { hasConsented as hasConsentedSync } from '../lib/consent';
import { heroText, cardReveal } from '../lib/motion';
import { Editor } from './Editor';

type Step = 'upload' | 'segmenting' | 'select_subject' | 'editor';

const PET_LABELS = new Set(['dog', 'cat', 'pet', 'animal']);

function isSubjectPet(subjects: Subject[], index: number): boolean {
  const label = subjects[index]?.label?.toLowerCase();
  return label ? PET_LABELS.has(label) : false;
}

export function EnhanceFlow() {
  const nav = useNavigation();
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentResult | null>(null);
  const [selectedSubjectIndex, setSelectedSubjectIndex] = useState<number | null>(null);

  const [templates, setTemplates] = useState<TributeTemplate[]>([]);

  // AI consent gate — Apple guideline 5.1.2(i). Same pattern as ReuniteFlow:
  // hasConsentedSync (direct localStorage read) avoids stale closure on the
  // recursive call that fires after grant() inside the same render cycle.
  const { grant: grantConsent } = useConsent();
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  useEffect(() => {
    // Abort the template fetch + thumbnail preloads if the user leaves the
    // flow before they resolve — stale connections block the next flow's
    // uploads and waste bandwidth on previews the user will never see.
    const controller = new AbortController();
    fetchTemplates(controller.signal)
      .then((t) => {
        setTemplates(t);
        preloadSampleImages(t);
      })
      .catch((err) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.error('[EnhanceFlow] fetch-templates failed', err);
        setError(COPY.errors.loadStyles);
      });
    return () => controller.abort();
  }, []);

  const handleBack = () => {
    switch (step) {
      case 'upload':
        nav.pop();
        break;
      case 'select_subject':
        setStep('upload');
        break;
      case 'editor':
        if (segmentation && segmentation.subjects.length > 1) {
          setStep('select_subject');
        } else {
          setStep('upload');
        }
        break;
      default:
        break;
    }
  };

  const handleUpload = async (file: File) => {
    if (!hasConsentedSync()) {
      setPendingUpload(file);
      setConsentOpen(true);
      return;
    }
    setError(null);
    setStep('segmenting');
    try {
      const upload = await uploadFile(file);
      setUploadedUrl(upload.url);
      const segResult = await segmentImage(upload.url, true);
      setSegmentation(segResult);
      if (segResult.subjects.length === 0) {
        setError(COPY.enhance.noFaces);
        setStep('upload');
        return;
      }
      if (segResult.subjects.length === 1) {
        setSelectedSubjectIndex(0);
        setStep('editor');
      } else {
        setStep('select_subject');
      }
    } catch (err) {
      console.error('[EnhanceFlow] upload/segment failed', err);
      setError(COPY.enhance.segmentFailed);
      setStep('upload');
    }
  };

  const handleContinue = () => {
    if (selectedSubjectIndex !== null) {
      setStep('editor');
    }
  };

  // The editor is its own screen (own header, own layout) — render it
  // bare without any of the EnhanceFlow chrome.
  if (step === 'editor' && uploadedUrl && segmentation) {
    return (
      <Editor
        baseImageUrl={uploadedUrl}
        subjects={segmentation.subjects.map((s) => ({
          centroid: s.centroid,
          bbox: s.bbox,
          maskUrl: s.maskUrl,
        }))}
        selectedSubjectIndex={selectedSubjectIndex ?? 0}
        imageWidth={segmentation.imageWidth}
        imageHeight={segmentation.imageHeight}
        templates={templates}
        isPet={isSubjectPet(segmentation.subjects, selectedSubjectIndex ?? 0)}
        onOrderCanvas={() => nav.push('PRINT_SHOP')}
        onPaywall={() => nav.push('PAYWALL')}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="enhance" data-step={step}>
      <header className="enhance-chrome">
        <button
          type="button"
          className="enhance-back"
          onClick={handleBack}
          disabled={step === 'segmenting'}
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <StepDots step={step} error={Boolean(error)} />
      </header>

      <main className="enhance-content">
        {step === 'upload' && (
          <UploadPane onUpload={handleUpload} error={error} />
        )}

        {step === 'segmenting' && (
          <SegmentingPane photoUrl={uploadedUrl} />
        )}

        {step === 'select_subject' && segmentation && uploadedUrl && (
          <SelectSubjectPane
            segmentation={segmentation}
            uploadedUrl={uploadedUrl}
            selectedSubjectIndex={selectedSubjectIndex}
            onSelect={setSelectedSubjectIndex}
            onContinue={handleContinue}
          />
        )}
      </main>

      <AIConsentModal
        open={consentOpen}
        onAccept={async () => {
          await grantConsent();
          setConsentOpen(false);
          if (pendingUpload) {
            const file = pendingUpload;
            setPendingUpload(null);
            // hasConsentedSync now returns true; re-entry falls through.
            void handleUpload(file);
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

/* ---------- Step chrome ---------- */

interface StepDotsProps {
  step: Step;
  error: boolean;
}

function StepDots({ step, error }: StepDotsProps) {
  // Only three meaningful steps for the indicator — upload → segmenting →
  // select. Editor is a separate screen; error is a pause, not a step.
  const STEPS: Step[] = ['upload', 'segmenting', 'select_subject'];
  const currentIndex = STEPS.indexOf(step);
  const label = error
    ? COPY.enhance.errorHint.toUpperCase()
    : COPY.enhance.stepLabel(Math.max(currentIndex + 1, 1), STEPS.length).toUpperCase();

  return (
    <div className="enhance-stepdots" aria-label="Step indicator">
      {STEPS.map((s, i) => {
        let cls = 'enhance-stepdot';
        if (i < currentIndex) cls += ' enhance-stepdot--done';
        else if (i === currentIndex) cls += ' enhance-stepdot--on';
        return <i key={s} className={cls} />;
      })}
      <span className="enhance-stepdots-label">{label}</span>
    </div>
  );
}

/* ---------- Upload pane ---------- */

interface UploadPaneProps {
  onUpload: (file: File) => void;
  error: string | null;
}

function UploadPane({ onUpload, error }: UploadPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Reset so re-selecting the same file still fires onChange.
    e.target.value = '';
  };

  return (
    <motion.section
      className="enhance-pane enhance-pane-upload"
      aria-labelledby="enhance-upload-heading"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="enhance-eyebrow">
        <span className="enhance-eyebrow-dot" aria-hidden />
        {COPY.enhance.uploadEyebrow.toUpperCase()}
      </span>
      <h1 className="enhance-display" id="enhance-upload-heading">
        {COPY.enhance.upload.headingBefore}
        <em>{COPY.enhance.upload.headingItalic}</em>
        {COPY.enhance.upload.headingAfter}
      </h1>
      <p className="enhance-subhead">{COPY.enhance.upload.subtext}</p>
      <div className="enhance-flourish" aria-hidden>
        <span className="enhance-flourish-line" />
        <span className="enhance-flourish-dot" />
        <span className="enhance-flourish-diamond" />
        <span className="enhance-flourish-dot" />
        <span className="enhance-flourish-line" />
      </div>

      {error && (
        <div className="enhance-inline-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <motion.div
        className="enhance-upload-card"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={0}
      >
        <div className="enhance-upload-frame">
          <FrameHaloIllustration />
          <div className="enhance-upload-label">{COPY.enhance.upload.prefaceLabel}</div>
          <div className="enhance-upload-helper">{COPY.enhance.upload.uploadHint}</div>
          <button
            type="button"
            className="enhance-upload-button"
            onClick={() => inputRef.current?.click()}
          >
            {COPY.enhance.upload.uploadLabel}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="enhance-upload-input"
              onChange={handleChange}
              aria-label={COPY.enhance.upload.uploadLabel}
            />
          </button>
        </div>
        <div className="enhance-upload-foot">{COPY.enhance.upload.footText}</div>
      </motion.div>
    </motion.section>
  );
}

/* ---------- Segmenting pane ---------- */

interface SegmentingPaneProps {
  photoUrl: string | null;
}

function SegmentingPane({ photoUrl }: SegmentingPaneProps) {
  const prefersReduced = useReducedMotion() ?? false;
  return (
    <motion.section
      className="enhance-pane enhance-pane-segmenting"
      aria-labelledby="enhance-segmenting-heading"
      aria-live="polite"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="enhance-eyebrow">
        <span className="enhance-eyebrow-dot" aria-hidden />
        {COPY.enhance.segmentingEyebrow.toUpperCase()}
      </span>
      <h1 className="enhance-display" id="enhance-segmenting-heading">
        {COPY.enhance.segmenting.headingBefore}
        <em>{COPY.enhance.segmenting.headingItalic}</em>
        {COPY.enhance.segmenting.headingAfter}
      </h1>

      <div className="enhance-photo-frame enhance-photo-frame--dim" aria-label="Your photo">
        <span className="enhance-corner enhance-corner--tl" aria-hidden />
        <span className="enhance-corner enhance-corner--tr" aria-hidden />
        <span className="enhance-corner enhance-corner--bl" aria-hidden />
        <span className="enhance-corner enhance-corner--br" aria-hidden />
        {photoUrl ? (
          <img src={photoUrl} alt="" className="enhance-photo-img" aria-hidden />
        ) : (
          <div className="enhance-photo-placeholder" aria-hidden />
        )}
        <div
          className="enhance-halo-ring"
          data-reduced={prefersReduced ? 'true' : 'false'}
          aria-hidden
        />
        <div
          className="enhance-halo-overlay"
          data-reduced={prefersReduced ? 'true' : 'false'}
          aria-hidden
        />
      </div>

      <div className="enhance-seg-caption">
        <div className="enhance-seg-caption-line">{COPY.enhance.segmenting.message}</div>
        <div className="enhance-seg-caption-sub">
          {COPY.enhance.segmenting.hint.toUpperCase()}
        </div>
      </div>
    </motion.section>
  );
}

/* ---------- Select subject pane ---------- */

interface SelectSubjectPaneProps {
  segmentation: SegmentResult;
  uploadedUrl: string;
  selectedSubjectIndex: number | null;
  onSelect: (index: number) => void;
  onContinue: () => void;
}

function SelectSubjectPane({
  segmentation,
  uploadedUrl,
  selectedSubjectIndex,
  onSelect,
  onContinue,
}: SelectSubjectPaneProps) {
  return (
    <motion.section
      className="enhance-pane enhance-pane-select"
      aria-labelledby="enhance-select-heading"
      variants={heroText}
      initial="initial"
      animate="animate"
    >
      <span className="enhance-eyebrow enhance-eyebrow--terracotta">
        <span className="enhance-eyebrow-dot" aria-hidden />
        {COPY.enhance.selectEyebrow.toUpperCase()}
      </span>
      <h1 className="enhance-display" id="enhance-select-heading">
        {COPY.enhance.selectSubject.headingBefore}
        <em>{COPY.enhance.selectSubject.headingItalic}</em>
        {COPY.enhance.selectSubject.headingAfter}
      </h1>
      <p className="enhance-subhead">{COPY.enhance.selectSubject.subtext}</p>
      <div className="enhance-flourish" aria-hidden>
        <span className="enhance-flourish-line" />
        <span className="enhance-flourish-dot" />
        <span className="enhance-flourish-diamond" />
        <span className="enhance-flourish-dot" />
        <span className="enhance-flourish-line" />
      </div>

      <div className="enhance-select-canvas">
        <SubjectSelector
          imageUrl={uploadedUrl}
          imageWidth={segmentation.imageWidth}
          imageHeight={segmentation.imageHeight}
          subjects={segmentation.subjects}
          selectedIndex={selectedSubjectIndex}
          onSelect={onSelect}
        />
      </div>

      <div className="enhance-cta-row">
        <button
          type="button"
          className="enhance-upload-button enhance-upload-button--full"
          disabled={selectedSubjectIndex === null}
          onClick={onContinue}
        >
          Continue
        </button>
        <div className="enhance-helper">
          {selectedSubjectIndex === null
            ? COPY.enhance.selectSubject.helper
            : '\u00a0'}
        </div>
      </div>
    </motion.section>
  );
}

/* ---------- Upload illustration ---------- */

// Quiet frame-with-halo illustration — no camera, no cloud, no people. The
// image slot is a warm paper color with horizontal rule marks so it reads
// as "a photograph waiting to be placed" rather than a generic upload icon.
function FrameHaloIllustration() {
  return (
    <div className="enhance-illus" aria-hidden>
      <svg viewBox="0 0 120 120">
        <defs>
          <linearGradient id="enhance-illus-frame" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c-surface-sunk)" />
            <stop offset="1" stopColor="#EADFC6" />
          </linearGradient>
          <radialGradient id="enhance-illus-halo" cx="60" cy="42" r="34" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--c-gold-soft)" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="var(--c-gold-base)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--c-gold-base)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="42" r="34" fill="url(#enhance-illus-halo)" />
        <ellipse cx="60" cy="36" rx="22" ry="6" fill="none" stroke="var(--c-gold-base)" strokeWidth="1.5" opacity="0.85" />
        <rect x="26" y="34" width="68" height="72" rx="6" fill="url(#enhance-illus-frame)" stroke="var(--c-rule-strong)" strokeWidth="1.2" />
        <rect x="32" y="40" width="56" height="60" rx="3" fill="var(--c-surface-card)" stroke="var(--c-rule-base)" strokeWidth="1" />
        <g opacity="0.55" stroke="var(--c-rule-base)" strokeWidth="1">
          <line x1="32" y1="56" x2="88" y2="56" />
          <line x1="32" y1="68" x2="88" y2="68" />
          <line x1="32" y1="80" x2="88" y2="80" />
          <line x1="32" y1="92" x2="88" y2="92" />
        </g>
      </svg>
    </div>
  );
}
