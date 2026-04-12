import { useEffect, useState } from 'react';
import type { Placement, TributeTemplate } from '@eternalframe/shared';
import { fetchTemplates, mergePhotos, uploadFile } from '../lib/api';
import { UploadZone } from '../components/UploadZone';
import { Editor } from './Editor';

type Step = 'upload' | 'placement' | 'merging' | 'editor';

const PLACEMENT_LABELS: Record<Placement, string> = {
  left: 'On the left',
  right: 'On the right',
  behind: 'Behind the group',
  center: 'In the center',
};

export function ReuniteFlow() {
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isPet, setIsPet] = useState(false);
  const [subjectName, setSubjectName] = useState('');

  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [lovedUrl, setLovedUrl] = useState<string | null>(null);

  const [placement, setPlacement] = useState<Placement | null>(null);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TributeTemplate[]>([]);

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((err) => setError(`We couldn't load the styles. ${err.message}`));
  }, []);

  const handleMainUpload = async (file: File) => {
    setError(null);
    try {
      const upload = await uploadFile(file);
      setMainUrl(upload.url);
    } catch (err) {
      setError(`We couldn't receive the main photo. ${(err as Error).message}`);
    }
  };

  const handleLovedUpload = async (file: File) => {
    setError(null);
    try {
      const upload = await uploadFile(file);
      setLovedUrl(upload.url);
    } catch (err) {
      setError(
        `We couldn't receive the second photo. ${(err as Error).message}`,
      );
    }
  };

  const runMerge = async (selectedPlacement: Placement) => {
    if (!mainUrl || !lovedUrl) return;
    setError(null);
    setStep('merging');
    try {
      const result = await mergePhotos({
        mainPhotoUrl: mainUrl,
        lovedOnePhotoUrl: lovedUrl,
        placement: selectedPlacement,
        subjectName: subjectName || undefined,
        isPet,
      });
      setMergedUrl(result.imageUrl);
      setStep('editor');
    } catch (err) {
      setError(
        `We couldn't quite bring them into the photo. Try a different position or try again in a moment.`,
      );
      setStep('placement');
    }
  };

  const handlePlacementPick = (p: Placement) => {
    setPlacement(p);
    void runMerge(p);
  };

  const handleTryDifferentPosition = () => {
    setMergedUrl(null);
    setStep('placement');
  };

  const handleStartOver = () => {
    setStep('upload');
    setMainUrl(null);
    setLovedUrl(null);
    setPlacement(null);
    setMergedUrl(null);
    setSubjectName('');
    setError(null);
  };

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      {step === 'upload' && (
        <div className="card">
          <h2>Reunite a loved one in a photo</h2>
          <p>
            Share two photos — a scene you cherish, and a picture of the person
            or pet you'd like to bring into it.
          </p>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="reunite-is-pet"
              checked={isPet}
              onChange={(e) => setIsPet(e.target.checked)}
            />
            <label htmlFor="reunite-is-pet">Adding a beloved pet</label>
          </div>
          <div className="dual-upload">
            <UploadZone
              label="The main photo"
              hint="The scene you'd like them in"
              onFileSelected={handleMainUpload}
            />
            <UploadZone
              label="A photo of them"
              hint="A clear, familiar picture"
              onFileSelected={handleLovedUpload}
            />
          </div>
          <div className="field-row" style={{ marginTop: '1rem' }}>
            <label>Their name (optional)</label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g. Grandpa Joe"
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              marginTop: '0.75rem',
            }}
          >
            <span className="muted">
              {mainUrl ? '✓ Main photo' : '○ Main photo'} ·{' '}
              {lovedUrl ? '✓ Their photo' : '○ Their photo'}
            </span>
            <button
              className="primary"
              disabled={!mainUrl || !lovedUrl}
              onClick={() => setStep('placement')}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'placement' && (
        <div className="card">
          <h2>Where would you like them?</h2>
          <p>Choose how they should appear in the scene.</p>
          <div className="placement-grid" role="radiogroup" aria-label="Placement">
            {(Object.keys(PLACEMENT_LABELS) as Placement[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={placement === p}
                className={`placement-card${placement === p ? ' selected' : ''}`}
                onClick={() => handlePlacementPick(p)}
              >
                {PLACEMENT_LABELS[p]}
              </button>
            ))}
          </div>
          <p className="muted" style={{ textAlign: 'center', marginTop: '1rem' }}>
            Tap any option to bring them into the photo right away.
          </p>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginTop: '1rem',
            }}
          >
            <button className="ghost" onClick={handleStartOver}>
              Start over
            </button>
          </div>
        </div>
      )}

      {step === 'merging' && (
        <div className="loading-overlay">
          <div className="spinner" />
          <h3>Bringing them gently into the photo…</h3>
          <p className="muted">This takes about 10–20 seconds</p>
        </div>
      )}

      {step === 'editor' && mergedUrl && (
        <Editor
          baseImageUrl={mergedUrl}
          subjectName={subjectName || undefined}
          isPet={isPet}
          templates={templates}
          onStartOver={handleStartOver}
          onTryDifferentPosition={handleTryDifferentPosition}
          contextLabel={
            subjectName
              ? `${subjectName} · ${placement ? PLACEMENT_LABELS[placement].toLowerCase() : ''}`
              : 'Your reunited tribute'
          }
        />
      )}
    </div>
  );
}
