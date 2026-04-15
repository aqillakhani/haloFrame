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
    // Give the browser a tick to start the download before revoking.
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
  // Bump to force re-derivation of ready-state UI when cache mutates.
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
      cacheRef.current = {
        ...cacheRef.current,
        [key]: { ...prev, [tier]: url },
      };
      bump((n) => n + 1);
    },
    [],
  );

  const fetchRender = useCallback(
    (
      ids: string[],
      int: Intensity,
      tier: 'preview' | 'final',
    ): Promise<string | null> => {
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

  // Reset everything when the base photo changes.
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

  // Preload every visible single at 1K (preview tier) on mount. This is the
  // one up-front wait — after it completes, tapping tiles is instant. Since
  // the editor is single-select now, every option is a single-template render
  // and the preload covers every choice the user can make.
  useEffect(() => {
    if (visibleTemplates.length === 0) return;
    visibleTemplates.forEach((t) => {
      void fetchRender([t.id], INTENSITY, 'preview');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseImageUrl, visibleTemplates.length]);

  // Auto-select the first-by-sortOrder style as soon as its preview lands,
  // unless the user has already interacted. Lets the user land on a styled
  // image rather than staring at their plain photo while preloads run.
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

  // Derived state ------------------------------------------------------------
  // Single-select: selectedIds is always length 0 or 1.
  const activeSelection = selectedIds;
  const currentKey = activeSelection.length > 0 ? comboKey(activeSelection, INTENSITY) : null;
  const currentEntry = currentKey ? cacheRef.current[currentKey] : undefined;
  const currentPreviewInflight =
    !!currentKey && inflightRef.current.has(`preview:${currentKey}`);
  const currentFinalInflight =
    !!currentKey && inflightRef.current.has(`final:${currentKey}`);

  // Show the best cached tier for the current selection; fall back to any
  // previously-shown styledUrl for visual continuity during combo renders;
  // finally fall back to the base image.
  const bestCached = currentEntry?.final ?? currentEntry?.preview ?? null;

  // Update styledUrl whenever the cache produces a new best for the current
  // selection. Preserve the previous styledUrl if nothing is cached yet so
  // the viewer doesn't flicker back to the plain photo while a combo renders.
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

  // Preload progress counters — a tile is "ready" once its 1K preview render
  // is cached. The banner that uses these goes away once every tile is ready.
  const preloadTotal = visibleTemplates.length;
  const preloadDone = visibleTemplates.filter(
    (t) => !!cacheRef.current[comboKey([t.id], INTENSITY)]?.preview,
  ).length;
  const preloading = preloadTotal > 0 && preloadDone < preloadTotal;

  // Per-tile readiness for the gallery — a tile is tappable once its preview
  // is cached. Tiles not yet ready show a spinner and are disabled.
  const readyIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of visibleTemplates) {
      if (cacheRef.current[comboKey([t.id], INTENSITY)]?.preview) {
        s.add(t.id);
      }
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bumpCount, visibleTemplates, comboKey]);

  // UI handlers --------------------------------------------------------------
  // Single-select: tapping the active tile clears the selection, tapping any
  // other tile replaces it.
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
      setError(`${COPY.editor.styleFailed} (${lastRenderErrorRef.current ?? 'apply-failed'})`);
    }
  };

  // Display ------------------------------------------------------------------
  const displayUrl = showOriginal ? baseImageUrl : (styledUrl ?? baseImageUrl);
  const hasStyled = !!styledUrl && styledUrl !== baseImageUrl;

  // Viewer shows a loading pill while the active selection's preview is
  // rendering and we have nothing cached to display yet for it.
  const viewerLoading =
    (!!currentKey && !currentEntry?.preview && !currentEntry?.final && currentPreviewInflight) ||
    isSaving ||
    currentFinalInflight;

  const viewerLoadingLabel = isSaving || currentFinalInflight
    ? COPY.loading.makingPerfect
    : COPY.editor.creating;

  // Save button state machine.
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
  // If the final is cached (user already saved this combo once), clicking
  // again should re-trigger the download — keep the button enabled.
  if (hasFinal && !isSaving) {
    saveDisabled = false;
    saveLabel = COPY.editor.saveButton;
  }

  return (
    <div className="editor">
      <div className="editor-stage">
        <ImageViewer
          src={displayUrl}
          alt="Your tribute"
          loading={viewerLoading}
          loadingLabel={viewerLoadingLabel}
        />
        <div className="stage-toolbar">
          <div className="stage-toolbar-group">
            <button
              type="button"
              className={`chip${!showOriginal ? ' active' : ''}`}
              onClick={() => setShowOriginal(false)}
              disabled={!hasStyled}
            >
              {COPY.editor.styledChip}
            </button>
            <button
              type="button"
              className={`chip${showOriginal ? ' active' : ''}`}
              onClick={() => setShowOriginal(true)}
              disabled={!hasStyled}
            >
              {COPY.editor.originalChip}
            </button>
          </div>
          <span className="helper muted" style={{ fontSize: '0.75rem' }}>
            {COPY.editor.viewerHint}
          </span>
        </div>
        {error && <div className="error-banner" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </div>

      <div className="editor-controls">
        {preloading && (
          <div className="preload-banner" role="status" aria-live="polite">
            <span className="spinner small" aria-hidden />
            <span>{COPY.editor.preparingStyles(preloadDone, preloadTotal)}</span>
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

      <div className="action-bar editor-action-bar">
        {onTryDifferentPosition && (
          <button
            type="button"
            className="ghost"
            onClick={onTryDifferentPosition}
            disabled={isSaving}
          >
            {COPY.editor.tryDifferentPosition}
          </button>
        )}
        <button
          type="button"
          className="gold"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saveLabel}
        </button>
        <button type="button" className="ghost" onClick={onStartOver} disabled={isSaving}>
          {COPY.editor.startOver}
        </button>
      </div>
    </div>
  );
}
