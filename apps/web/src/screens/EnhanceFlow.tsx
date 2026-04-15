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
      // Always detect both people and animals
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
      const msg = err instanceof Error ? err.message : String(err);
      setError(`${COPY.enhance.segmentFailed} (upload-or-detect: ${msg})`);
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

  const handleStartOver = () => {
    setStep('upload');
    setUploadedUrl(null);
    setSegmentation(null);
    setSelectedSubjectIndex(null);
    setError(null);
  };

  return (
    <div className="screen-content">
      {step !== 'segmenting' && (
        <div className="screen-header">
          <BackButton onClick={handleBack} />
          <h2>
            {step === 'upload' && COPY.enhance.upload.heading}
            {step === 'select_subject' && COPY.enhance.selectSubject.heading}
            {step === 'editor' && COPY.home.enhance.title}
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
            <p>{COPY.enhance.upload.subtext}</p>
            <UploadZone
              label={COPY.enhance.upload.uploadLabel}
              hint={COPY.enhance.upload.uploadHint}
              onFileSelected={handleUpload}
            />
          </div>
        </div>
      )}

      {step === 'segmenting' && (
        <div className="loading-overlay" style={{ margin: '2rem 1.25rem' }}>
          <div className="spinner" />
          <h3>{COPY.enhance.segmenting.message}</h3>
          <p className="muted">{COPY.enhance.segmenting.hint}</p>
        </div>
      )}

      {step === 'select_subject' && segmentation && uploadedUrl && (
        <div style={{ padding: '0 1.25rem' }}>
          <div className="card">
            <p>{COPY.enhance.selectSubject.subtext}</p>
            <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
              <SubjectSelector
                imageUrl={uploadedUrl}
                imageWidth={segmentation.imageWidth}
                imageHeight={segmentation.imageHeight}
                subjects={segmentation.subjects}
                selectedIndex={selectedSubjectIndex}
                onSelect={handleSubjectSelect}
              />
            </div>
            <button
              type="button"
              className="primary"
              style={{ width: '100%' }}
              disabled={selectedSubjectIndex === null}
              onClick={handleContinue}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'editor' && uploadedUrl && segmentation && (
        <div style={{ padding: '0 1.25rem' }}>
          <Editor
            baseImageUrl={uploadedUrl}
            subjects={segmentation.subjects.map((s) => ({
              centroid: s.centroid,
              bbox: s.bbox,
            }))}
            selectedSubjectIndex={selectedSubjectIndex ?? 0}
            imageWidth={segmentation.imageWidth}
            imageHeight={segmentation.imageHeight}
            templates={templates}
            isPet={isSubjectPet(segmentation.subjects, selectedSubjectIndex ?? 0)}
            onStartOver={handleStartOver}
            onBack={handleBack}
          />
        </div>
      )}
    </div>
  );
}
