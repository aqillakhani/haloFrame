import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TributeTemplate } from '@eternalframe/shared';
import {
  applyTemplate,
  type ApplySubjectContext,
  type ApplyResult,
  type ApplyResolution,
} from '../lib/api';
import { COPY } from '../lib/copy';
import { ImageViewer } from '../components/ImageViewer';
import { TemplateGallery } from '../components/TemplateGallery';
import { BackButton } from '../components/BackButton';

export interface EditorProps {
  baseImageUrl: string;
  subjects?: ApplySubjectContext[];
  selectedSubjectIndex?: number;
  imageWidth?: number;
  imageHeight?: number;
  templates: TributeTemplate[];
  onStartOver: () => void;
  onTryDifferentPosition?: () => void;
  onBack?: () => void;
  /** True when the subject is a pet (driven by SAM 3 label). Drives template filtering. */
  isPet?: boolean;
  /**
   * Natural-language description of the target person/pet — used to anchor
   * Nano Banana 2 to the correct subject in multi-person photos. In the
   * Reunite flow this is derived from the user-chosen placement ("the person
   * on the far left of the photo"). Without it, the model picks randomly.
   */
  subjectName?: string;
}

type Intensity = 'low' | 'medium' | 'high';

interface CacheEntry {
  preview?: string; // 1K (fast editor preview)
  final?: string;   // 2K (what the user saves)
}

// Effect strength is hardcoded — the UI used to expose Subtle/Balanced/Bold
// radios, but they rarely produced a meaningful difference and confused users.
// Server still accepts the field so prompts that branch on it keep working.
const INTENSITY: Intensity = 'medium';
// Filtered out of visibleTemplates entirely — the combined halo_and_wings
// template covers the "I want the photo mostly as-is" case better than an
// explicit no-op did.
const HIDDEN_TEMPLATE_IDS = new Set(['natural_blend']);

async function triggerDownload(url: string): Promise<void> {
  // The `download` attribute is ignored on cross-origin URLs (fal.media),
  // so the browser navigates instead of saving. Fetch the blob, create
  // a same-origin object URL, and download that to force save-as.
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download fetch -> ${r.status}`);
    const blob = await r.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'eternalframe-tribute.png';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    console.error('[Editor] download failed, opening in new tab', err);
    window.open(url, '_blank', 'noopener');
  }
}

export function Editor({
  baseImageUrl,
  subjects,
  selectedSubjectIndex,
  imageWidth,
  imageHeight,
  templates,
  onStartOver,
  onTryDifferentPosition,
  onBack,
  isPet = false,
  subjectName,
}: EditorProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [styledUrl, setStyledUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumpCount, bump] = useState(0);

  const cacheRef = useRef<Record<string, CacheEntry>>({});
  const inflightRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const requestIdRef = useRef(0);
  const userInteractedRef = useRef(false);
  const lastRenderErrorRef = useRef<string | null>(null);

  const visibleTemplates = useMemo(
    () =>
      templates.filter((t) => {
        if (HIDDEN_TEMPLATE_IDS.has(t.id)) return false;
        return isPet ? t.isPetCompatible : t.isHumanCompatible;
      }),
    [templates, isPet],
  );

  const comboKey = useCallback(
    (ids: string[], int: Intensity) => [...ids].sort().join('+') + `@${int}`,
    [],
  );

  const writeCache = useCallback(
    (key: string, tier: 'preview' | 'final', url: string) => {
      const prev = cacheRef.current[key] ?? {};
      cacheRef.current = { ...cacheRef.current, [key]: { ...prev, [tier]: url } };
      bump((n) => n + 1);
    },
    [],
  );

  const fetchRender = useCallback(
    (ids: string[], int: Intensity, tier: 'preview' | 'final'): Promise<string | null> => {
      if (ids.length === 0) return Promise.resolve(null);
      const key = comboKey(ids, int);
      const existing = cacheRef.current[key]?.[tier];
      if (existing) return Promise.resolve(existing);
      const inflightKey = `${tier}:${key}`;

      const pending = inflightRef.current.get(inflightKey);
      if (pending) return pending;

      const promise = (async () => {
        try {
          const resolution: ApplyResolution = tier === 'preview' ? 'preview' : 'final';
          const result: ApplyResult = await applyTemplate({
            imageUrl: baseImageUrl,
            templateIds: ids,
            intensity: int,
            isPet,
            subjectName,
            subjects,
            selectedSubjectIndex,
            imageWidth,
            imageHeight,
            resolution,
          });
          writeCache(key, tier, result.imageUrl);
          lastRenderErrorRef.current = null;
          return result.imageUrl;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[Editor] apply failed', tier, ids, err);
          lastRenderErrorRef.current = `apply-${tier}:${ids.join('+')}: ${msg}`;
          return null;
        } finally {
          inflightRef.current.delete(inflightKey);
          bump((n) => n + 1);
        }
      })();
      inflightRef.current.set(inflightKey, promise);
      bump((n) => n + 1);
      return promise;
    },
    [
      baseImageUrl,
      comboKey,
      imageHeight,
      imageWidth,
      isPet,
      selectedSubjectIndex,
      subjectName,
      subjects,
      writeCache,
    ],
  );

  useEffect(() => {
    setSelectedIds([]);
    setStyledUrl(null);
    setShowOriginal(false);
    setError(null);
    setIsSaving(false);
    cacheRef.current = {};
    inflightRef.current.clear();
    userInteractedRef.current = false;
  }, [baseImageUrl]);

  useEffect(() => {
    if (visibleTemplates.length === 0) return;
    visibleTemplates.forEach((t) => {
      void fetchRender([t.id], INTENSITY, 'preview');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImageUrl, visibleTemplates.length]);

  useEffect(() => {
    if (userInteractedRef.current) return;
    if (selectedIds.length > 0) return;
    const sorted = [...visibleTemplates].sort((a, b) => a.sortOrder - b.sortOrder);
    const firstReady = sorted.find(
      (t) => !!cacheRef.current[comboKey([t.id], INTENSITY)]?.preview,
    );
    if (firstReady) {
      setSelectedIds([firstReady.id]);
    }
  }, [bumpCount, selectedIds.length, visibleTemplates, comboKey]);

  const activeSelection = selectedIds;
  const currentKey = activeSelection.length > 0 ? comboKey(activeSelection, INTENSITY) : null;
  const currentEntry = currentKey ? cacheRef.current[currentKey] : undefined;
  const currentPreviewInflight =
    !!currentKey && inflightRef.current.has(`preview:${currentKey}`);
  const currentFinalInflight =
    !!currentKey && inflightRef.current.has(`final:${currentKey}`);

  const bestCached = currentEntry?.final ?? currentEntry?.preview ?? null;

  useEffect(() => {
    if (!currentKey) {
      setStyledUrl(null);
      return;
    }
    if (bestCached) {
      setStyledUrl(bestCached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, bestCached]);

  const preloadTotal = visibleTemplates.length;
  const preloadDone = visibleTemplates.filter(
    (t) => !!cacheRef.current[comboKey([t.id], INTENSITY)]?.preview,
  ).length;
  const preloading = preloadTotal > 0 && preloadDone < preloadTotal;

  const readyIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of visibleTemplates) {
      if (cacheRef.current[comboKey([t.id], INTENSITY)]?.preview) s.add(t.id);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bumpCount, visibleTemplates, comboKey]);

  const handleTemplateToggle = (templateId: string) => {
    userInteractedRef.current = true;
    setShowOriginal(false);
    setError(null);
    setSelectedIds((prev) => {
      const next = prev.includes(templateId) ? [] : [templateId];
      if (next.length === 0) {
        setStyledUrl(null);
      } else {
        void fetchRender(next, INTENSITY, 'preview');
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (activeSelection.length === 0) return;
    const key = comboKey(activeSelection, INTENSITY);
    const cachedFinal = cacheRef.current[key]?.final;
    if (cachedFinal) {
      void triggerDownload(cachedFinal);
      return;
    }
    setError(null);
    setIsSaving(true);
    const reqId = ++requestIdRef.current;
    const url = await fetchRender(activeSelection, INTENSITY, 'final');
    if (reqId !== requestIdRef.current) {
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    if (url) {
      void triggerDownload(url);
    } else {
      setError(
        `${COPY.editor.styleFailed} (tag: ${lastRenderErrorRef.current ?? 'apply-failed'})`,
      );
    }
  };

  const displayUrl = showOriginal ? baseImageUrl : (styledUrl ?? baseImageUrl);
  const hasStyled = !!styledUrl && styledUrl !== baseImageUrl;

  const viewerLoading =
    (!!currentKey && !currentEntry?.preview && !currentEntry?.final && currentPreviewInflight) ||
    isSaving ||
    currentFinalInflight;

  const viewerLoadingLabel = isSaving || currentFinalInflight
    ? COPY.loading.makingPerfect
    : COPY.editor.creating;

  const hasSelection = activeSelection.length > 0;
  const hasPreview = !!currentEntry?.preview;
  const hasFinal = !!currentEntry?.final;

  let saveLabel: string = COPY.editor.saveButton;
  let saveDisabled = true;
  if (!hasSelection) {
    saveLabel = COPY.editor.noSelection;
    saveDisabled = true;
  } else if (isSaving || currentFinalInflight) {
    saveLabel = COPY.loading.makingPerfect;
    saveDisabled = true;
  } else if (!hasPreview) {
    saveLabel = COPY.editor.loadingPreview;
    saveDisabled = true;
  } else {
    saveLabel = COPY.editor.saveButton;
    saveDisabled = false;
  }
  if (hasFinal && !isSaving) {
    saveDisabled = false;
    saveLabel = COPY.editor.saveButton;
  }

  const finalizing = isSaving || currentFinalInflight;

  return (
    <div className="editor">
      <header className="flow-header editor-header">
        {onBack && <BackButton onClick={onBack} />}
        <span className="app-header-title">Editing tribute</span>
        <button
          type="button"
          className="btn btn-primary editor-save"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saveLabel}
        </button>
      </header>

      <div className="editor-stage">
        <ImageViewer
          src={displayUrl}
          alt="Your tribute"
          loading={viewerLoading}
          loadingLabel={viewerLoadingLabel}
        />
        <div className="editor-stage-toolbar">
          <div className="editor-chips" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={!showOriginal}
              className={`editor-chip${!showOriginal ? ' editor-chip--active' : ''}`}
              onClick={() => setShowOriginal(false)}
              disabled={!hasStyled}
            >
              {COPY.editor.styledChip}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showOriginal}
              className={`editor-chip${showOriginal ? ' editor-chip--active' : ''}`}
              onClick={() => setShowOriginal(true)}
              disabled={!hasStyled}
            >
              {COPY.editor.originalChip}
            </button>
          </div>
          <span className="t-body-sm t-muted">{COPY.editor.viewerHint}</span>
        </div>
        {error && (
          <div className="flow-error editor-error" role="alert">
            <p className="t-body-md">{error}</p>
          </div>
        )}
      </div>

      <div className="editor-controls">
        {preloading && (
          <div className="preload-banner" role="status" aria-live="polite">
            <span className="preload-dot" aria-hidden />
            <span className="t-body-sm">{COPY.editor.preparingStyles(preloadDone, preloadTotal)}</span>
          </div>
        )}

        <TemplateGallery
          templates={visibleTemplates}
          selectedIds={selectedIds}
          readyIds={readyIds}
          onToggle={handleTemplateToggle}
          disabled={isSaving}
        />
      </div>

      {finalizing && (
        <div className="editor-finalizing" role="status" aria-live="polite">
          <span className="finalizing-pill">{COPY.loading.makingPerfect}</span>
        </div>
      )}

      <div className="editor-action-bar">
        {onTryDifferentPosition && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onTryDifferentPosition}
            disabled={isSaving}
          >
            {COPY.editor.tryDifferentPosition}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onStartOver}
          disabled={isSaving}
        >
          {COPY.editor.startOver}
        </button>
      </div>
    </div>
  );
}
