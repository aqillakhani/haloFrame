import { useEffect, useState } from 'react';
import type { TributeTemplate } from '@eternalframe/shared';
import {
  fetchTemplates,
  segmentImage,
  uploadFile,
  type SegmentResult,
} from '../lib/api';
import { UploadZone } from '../components/UploadZone';
import { SubjectSelector } from '../components/SubjectSelector';
import { Editor } from './Editor';

type Step = 'upload' | 'segmenting' | 'select_subject' | 'editor';

export function EnhanceFlow() {
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isPet, setIsPet] = useState(false);
  const [subjectName, setSubjectName] = useState('');

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentResult | null>(null);
  const [selectedSubjectIndex, setSelectedSubjectIndex] = useState<number | null>(null);

  const [templates, setTemplates] = useState<TributeTemplate[]>([]);

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((err) => setError(`We couldn't load the styles. ${err.message}`));
  }, []);

  const handleUpload = async (file: File) => {
    setError(null);
    setStep('segmenting');
    try {
      const upload = await uploadFile(file);
      setUploadedUrl(upload.url);
      const segResult = await segmentImage(upload.url, isPet);
      setSegmentation(segResult);
      if (segResult.subjects.length === 0) {
        setError(
          "We couldn't see anyone in that photo. Try a different one where the faces are clearer.",
        );
        setStep('upload');
        return;
      }
      if (segResult.subjects.length === 1) {
        // Only one subject — skip selection, go straight to the editor
        setSelectedSubjectIndex(0);
        setStep('editor');
      } else {
        setStep('select_subject');
      }
    } catch (err) {
      setError(
        `Something went wrong while preparing your photo. ${(err as Error).message}`,
      );
      setStep('upload');
    }
  };

  const handleSubjectSelect = (index: number) => {
    setSelectedSubjectIndex(index);
    // No confirmation step — go directly to the editor
    setStep('editor');
  };

  const handleStartOver = () => {
    setStep('upload');
    setUploadedUrl(null);
    setSegmentation(null);
    setSelectedSubjectIndex(null);
    setSubjectName('');
    setError(null);
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {step === 'upload' && (
        <div className="card">
          <h2>Choose a photo to honor</h2>
          <p>Pick a photo of someone you love. We'll gently add a memorial touch.</p>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="enhance-is-pet"
              checked={isPet}
              onChange={(e) => setIsPet(e.target.checked)}
            />
            <label htmlFor="enhance-is-pet">This photo includes a beloved pet</label>
          </div>
          <UploadZone
            label="Add a photo"
            hint="Any JPEG or PNG — we'll take it from there"
            onFileSelected={handleUpload}
          />
        </div>
      )}

      {step === 'segmenting' && (
        <div className="loading-overlay">
          <div className="spinner" />
          <h3>Looking gently at your photo…</h3>
          <p className="muted">Just a few seconds</p>
        </div>
      )}

      {step === 'select_subject' && segmentation && uploadedUrl && (
        <div className="card">
          <h2>Who would you like to honor?</h2>
          <p>
            We found {segmentation.subjects.length} people in this photo. Tap the one
            you'd like to remember.
          </p>
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
          <div className="field-row">
            <label>Their name (optional — helps us honor them more personally)</label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g. Grandma Rose"
            />
          </div>
          <p className="muted" style={{ textAlign: 'center' }}>
            Tap a person above to continue — no extra step needed.
          </p>
        </div>
      )}

      {step === 'editor' && uploadedUrl && segmentation && (
        <Editor
          baseImageUrl={uploadedUrl}
          subjects={segmentation.subjects.map((s) => ({
            centroid: s.centroid,
            bbox: s.bbox,
          }))}
          selectedSubjectIndex={selectedSubjectIndex ?? 0}
          imageWidth={segmentation.imageWidth}
          imageHeight={segmentation.imageHeight}
          subjectName={subjectName || undefined}
          isPet={isPet}
          templates={templates}
          onStartOver={handleStartOver}
          contextLabel={
            subjectName
              ? `Honoring ${subjectName}`
              : 'Honoring your loved one'
          }
        />
      )}
    </div>
  );
}
