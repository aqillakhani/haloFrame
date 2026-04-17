import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TributeTemplate } from '@eternalframe/shared';
import {
  applyTemplate,
  type ApplySubjectContext,
  type ApplyResult,
  type ApplyResolution,
} from '../lib/api';
import { triggerDownload } from '../lib/download';
import { COPY } from '../lib/copy';
import { ImageViewer } from '../components/ImageViewer';
import { TemplateGallery } from '../components/TemplateGallery';
import { BackButton } from '../components/BackButton';

type Placement = 'left' | 'right' | 'behind' | 'front';

export interface EditorProps {
  baseImageUrl: string;
  subjects?: ApplySubjectContext[];
  selectedSubjectIndex?: number;
  imageWidth?: number;
  imageHeight?: number;
  templates: TributeTemplate[];
  /** Navigate to the Print Shop ("Order Canvas" button). */
  onOrderCanvas: () => void;
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
  /**
   * Forwarded from the Reunite flow so the server can adjust wings z-order
   * (behind everyone by default; in front when the subject is in the
   * foreground). Absent in the Enhance flow — server treats missing as
   * "default behind".
   */
  placement?: Placement;
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

export function Editor({
  baseImageUrl,
  subjects,
  selectedSubjectIndex,
  imageWidth,
  imageHeight,
  templates,
  onOrderCanvas,
  onBack,
  isPet = false,
  subjectName,
  placement,
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
  // Shared abort controller for every preview/final apply call fired from
  // this Editor mount. When the user navigates away (back button, tab
  // switch, Start Over), the cleanup effect aborts all inflight requests
  // so the browser's 6-connection pool to localhost isn't still saturated
  // when they start a new flow.
  //
  // IMPORTANT: create the controller INSIDE the mount effect, paired with
  // its cleanup. A render-body lazy init breaks in React 18 StrictMode:
  // setup-cleanup-setup double-mount aborts the controller, and because
  // render doesn't re-run on the synthetic re-mount, the lazy init never
  // replaces it — every later fetch uses the dead signal and fails with
  // AbortError. This variant pairs creation and abort on the same effect
  // tick, so both strict-mode setups get a live controller.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, []);

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
          const result: ApplyResult = await applyTemplate(
            {
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
              placement,
            },
            abortRef.current?.signal,
          );
          writeCache(key, tier, result.imageUrl);
          lastRenderErrorRef.current = null;
          return result.imageUrl;
        } catch (err) {
          // Silently swallow aborts — they're triggered by our own unmount
          // cleanup, not a real failure. Everything else bubbles up.
          if ((err as { name?: string })?.name === 'AbortError') {
            return null;
          }
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
      placement,
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
    // No style picked → save the original photo. A user tapping Save
    // before a template is auto-selected (or while previews are still
    // loading) still wants a file; don't leave them stuck.
    if (activeSelection.length === 0) {
      void triggerDownload(baseImageUrl);
      return;
    }
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

  // Save button is always "Save to Photos" except while the save is in
  // flight (then "Making it perfect…" and disabled). Tapping save with
  // no style picked downloads the original photo — handleSave branches
  // on activeSelection.length. Previous logic swapped in "Choose a
  // style" / "Loading preview…" labels, but that made the button feel
  // conditionally broken when users just wanted to save what they saw.
  const finalizing = isSaving || currentFinalInflight;
  const saveLabel = finalizing ? COPY.loading.makingPerfect : COPY.editor.saveButton;
  const saveDisabled = finalizing;

  return (
    <div className="editor">
      <header className="flow-header editor-header">
        {onBack && <BackButton onClick={onBack} />}
        <span className="app-header-title">Editing tribute</span>
        <span className="flow-header-spacer" aria-hidden />
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
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onOrderCanvas}
          disabled={isSaving}
        >
          {COPY.editor.orderCanvas}
        </button>
        <button
          type="button"
          className="btn btn-primary editor-save"
          onClick={handleSave}
          disabled={saveDisabled}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
