import { useEffect, useState } from 'react';
import type { TributeTemplate } from '@eternalframe/shared';
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
import { BackButton } from '../components/BackButton';
import { UploadZone } from '../components/UploadZone';
import { SubjectSelector } from '../components/SubjectSelector';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Icon } from '../components/icons/Icon';
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

  const handleSubjectSelect = (index: number) => {
    setSelectedSubjectIndex(index);
  };

  const handleContinue = () => {
    if (selectedSubjectIndex !== null) {
      setStep('editor');
    }
  };

  return (
    <div className="enhance">
      {step !== 'segmenting' && step !== 'editor' && (
        <header className="flow-header">
          <BackButton onClick={handleBack} />
          <span className="app-header-title">
            {step === 'upload' && COPY.enhance.upload.heading}
            {step === 'select_subject' && COPY.enhance.selectSubject.heading}
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
        <section className="flow-pane enhance-upload">
          <h1 className="t-display-lg enhance-headline">{COPY.enhance.upload.heading}</h1>
          <hr className="hairline-short" aria-hidden />
          <p className="t-body-lg t-muted enhance-helper">{COPY.enhance.upload.subtext}</p>
          <UploadZone
            label={COPY.enhance.upload.uploadLabel}
            hint={COPY.enhance.upload.uploadHint}
            onFileSelected={handleUpload}
          />
        </section>
      )}

      {step === 'segmenting' && (
        <section className="flow-pane enhance-segmenting">
          {uploadedUrl && (
            <img src={uploadedUrl} alt="" className="enhance-segmenting-photo" aria-hidden />
          )}
          <LoadingOverlay
            message={COPY.enhance.segmenting.message}
            hint={COPY.enhance.segmenting.hint}
          />
        </section>
      )}

      {step === 'select_subject' && segmentation && uploadedUrl && (
        <section className="flow-pane enhance-select">
          <p className="t-body-md t-muted enhance-helper">
            {COPY.enhance.selectSubject.subtext}
          </p>
          <div className="enhance-select-canvas">
            <SubjectSelector
              imageUrl={uploadedUrl}
              imageWidth={segmentation.imageWidth}
              imageHeight={segmentation.imageHeight}
              subjects={segmentation.subjects}
              selectedIndex={selectedSubjectIndex}
              onSelect={handleSubjectSelect}
            />
          </div>
          <div className="flow-action">
            <button
              type="button"
              className="btn btn-primary"
              disabled={selectedSubjectIndex === null}
              onClick={handleContinue}
            >
              Continue <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </section>
      )}

      {step === 'editor' && uploadedUrl && segmentation && (
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
      )}
    </div>
  );
}
