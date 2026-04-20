import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { TributeTemplate } from '@haloframe/shared';
import {
  applyTemplate,
  isInsufficientCreditsError,
  saveSpikeResult,
  type ApplySubjectContext,
  type ApplyResult,
  type ApplyResolution,
} from '../lib/api';
import { triggerDownload } from '../lib/download';
import { useSubscription } from '../hooks/useSubscription';
import { COPY } from '../lib/copy';
import { ImageViewer } from '../components/ImageViewer';
import { TemplateGallery } from '../components/TemplateGallery';

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
  /**
   * Navigate to the Paywall. Called when the user taps Save and the current
   * (mocked) credit balance can't cover the action. The real credits ledger
   * will live server-side — when that lands, this prop stays; the balance
   * check moves into a shared hook.
   */
  onPaywall: () => void;
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
  onPaywall,
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

  const { snapshot, canAfford, refetch: refetchSubscription } = useSubscription();

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

  // The Editor has its own bottom action bar (Order / Save). Hide the
  // global tab bar while the Editor is mounted so the two don't collide
  // at the same viewport position (tab-bar z-100 would otherwise eat
  // taps targeted at the editor-actionbar z-20).
  useEffect(() => {
    document.body.dataset.editorActive = 'true';
    return () => {
      delete document.body.dataset.editorActive;
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
          // Stable saveId per final render so a double-click hits the same
          // credit_ledger dedupe key and the second server call rejects on
          // unique_violation rather than double-charging.
          const saveId =
            tier === 'final'
              ? `save-${comboKey(ids, int)}-${baseImageUrl.slice(-24)}`
              : undefined;
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
              saveId,
            },
            abortRef.current?.signal,
          );
          writeCache(key, tier, result.imageUrl);
          lastRenderErrorRef.current = null;
          return result.imageUrl;
        } catch (err) {
          // Silently swallow aborts — they're triggered by our own unmount
          // cleanup, not a real failure.
          if ((err as { name?: string })?.name === 'AbortError') {
            return null;
          }
          // Re-throw insufficient_credits so handleSave can route the user
          // to the paywall. Preview calls should never hit this (server
          // doesn't charge for previews), but if they do the caller can
          // decide what to do with the exception.
          if (isInsufficientCreditsError(err)) {
            throw err;
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
      // Re-download of a tribute already paid for — no new credit charge.
      void triggerDownload(cachedFinal);
      return;
    }
    // New 2K render = credited save. Client-side balance is advisory —
    // the server re-checks on every request and will return 402 if the
    // snapshot was stale.
    const creditedAction = placement ? 'reunite_save' : 'enhance_save';
    if (!canAfford(creditedAction)) {
      onPaywall();
      return;
    }
    setError(null);
    setIsSaving(true);
    const reqId = ++requestIdRef.current;
    try {
      const url = await fetchRender(activeSelection, INTENSITY, 'final');
      if (reqId !== requestIdRef.current) {
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
      if (url) {
        void triggerDownload(url);
        void refetchSubscription();
        // Persist the finished tribute to the DB so MyTributes can list it.
        // Fire-and-forget: download already fired; a bridge failure (network,
        // auth, route not mounted in spike mode) shouldn't block the save.
        // Idempotency key ties a retry to the same row.
        const saveId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const flowType: 'enhance' | 'reunite' | 'pet_enhance' | 'pet_reunite' = placement
          ? isPet
            ? 'pet_reunite'
            : 'reunite'
          : isPet
            ? 'pet_enhance'
            : 'enhance';
        void saveSpikeResult({
          flowType,
          isPet,
          templateIds: activeSelection,
          intensity: INTENSITY,
          finalImageUrl: url,
          saveId,
          subjectName,
          placement,
        }).catch((bridgeErr: unknown) => {
          console.error('[Editor] save-bridge failed (non-fatal)', bridgeErr);
        });
      } else {
        if (lastRenderErrorRef.current) {
          console.error('[Editor] save failed', lastRenderErrorRef.current);
        }
        setError(COPY.editor.styleFailed);
      }
    } catch (err) {
      setIsSaving(false);
      if (isInsufficientCreditsError(err)) {
        // Server says the balance is insufficient even though the client
        // check just passed — snapshot was stale (concurrent spend, cron
        // eviction of a top-up). Refetch so the badge updates, then route
        // the user to the paywall.
        void refetchSubscription();
        onPaywall();
        return;
      }
      console.error('[Editor] save failed', err);
      setError(COPY.editor.styleFailed);
    }
  };

  const displayUrl = showOriginal ? baseImageUrl : (styledUrl ?? baseImageUrl);
  const hasStyled = !!styledUrl && styledUrl !== baseImageUrl;

  // Brief rose glow around the stage when a new styled preview first lands.
  // Fires on every template change — the per-pick "this is the one" beat.
  const stageRef = useRef<HTMLDivElement>(null);
  const prevStyledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!styledUrl || styledUrl === prevStyledRef.current) return;
    prevStyledRef.current = styledUrl;
    const el = stageRef.current;
    if (!el) return;
    el.classList.remove('editor-stage--revealing');
    // Force reflow so the class can restart the CSS animation.
    void el.offsetHeight;
    el.classList.add('editor-stage--revealing');
    const timer = setTimeout(() => {
      el.classList.remove('editor-stage--revealing');
    }, 900);
    return () => clearTimeout(timer);
  }, [styledUrl]);

  const viewerLoading =
    (!!currentKey && !currentEntry?.preview && !currentEntry?.final && currentPreviewInflight) ||
    isSaving ||
    currentFinalInflight;

  // Save button is always "Save to Photos" except while the save is in
  // flight (then "Making it perfect…" and disabled). Tapping save with
  // no style picked downloads the original photo — handleSave branches
  // on activeSelection.length. Previous logic swapped in "Choose a
  // style" / "Loading preview…" labels, but that made the button feel
  // conditionally broken when users just wanted to save what they saw.
  const finalizing = isSaving || currentFinalInflight;
  const saveLabel = finalizing ? COPY.editor.savingButton : COPY.editor.saveButton;
  const saveDisabled = finalizing;

  // The data-state drives the stage CSS (dim, halo visibility, rotating
  // caption, ready-rule, finalizing pill) in a single attribute so state
  // transitions stay in lockstep with the React state. Order matters:
  // error trumps saving, saving trumps loading, styledUrl means ready,
  // otherwise idle.
  const dataState: 'idle' | 'loading-preview' | 'preview-ready' | 'saving' | 'error' = error
    ? 'error'
    : finalizing
      ? 'saving'
      : viewerLoading
        ? 'loading-preview'
        : hasStyled
          ? 'preview-ready'
          : 'idle';

  // Rotating italic caption below the stage during loading-preview and
  // saving. Cycles every 4s. Reduced-motion users see the first line
  // only (still narrated, no motion).
  const prefersReduced = useReducedMotion() ?? false;
  const captionPool: readonly string[] | null =
    dataState === 'loading-preview'
      ? COPY.editor.loadingCaptions
      : dataState === 'saving'
        ? COPY.editor.savingCaptions
        : null;
  const [captionIndex, setCaptionIndex] = useState(0);
  useEffect(() => {
    setCaptionIndex(0);
    if (!captionPool || captionPool.length <= 1 || prefersReduced) return;
    const id = window.setInterval(
      () => setCaptionIndex((i) => (i + 1) % captionPool.length),
      4000,
    );
    return () => window.clearInterval(id);
    // `captionPool` identity only changes when dataState changes to a
    // value with a different pool — stable refs from COPY.editor.
  }, [captionPool, prefersReduced]);
  const rotatingCaption = captionPool ? (captionPool[captionIndex] ?? captionPool[0] ?? '') : '';

  const creditBadgeLabel = COPY.subscription.tributesShort(snapshot?.creditsRemaining ?? 0);

  return (
    <div className="editor" data-state={dataState}>
      <header className="editor-header">
        {onBack ? (
          <button
            type="button"
            className="editor-back"
            onClick={onBack}
            aria-label={COPY.editor.backAria}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        ) : (
          <span className="editor-back-placeholder" aria-hidden />
        )}
        <div className="editor-title">{COPY.editor.header}</div>
        <div className="editor-credit-badge" aria-label={creditBadgeLabel}>
          <span className="editor-credit-dot" aria-hidden />
          <span>{creditBadgeLabel}</span>
        </div>
      </header>

      <main className="editor-workbench">
        <section className="editor-stage-wrap" aria-label="Tribute preview">
          <div className="editor-frame" ref={stageRef}>
            <span className="editor-corner editor-corner--tl" aria-hidden />
            <span className="editor-corner editor-corner--tr" aria-hidden />
            <span className="editor-corner editor-corner--bl" aria-hidden />
            <span className="editor-corner editor-corner--br" aria-hidden />
            <ImageViewer src={displayUrl} alt="Your tribute" loading={viewerLoading} />
            <div className="editor-halo" aria-hidden />
          </div>

          <div className="editor-stage-caption" aria-live="polite">
            {rotatingCaption && (
              <>
                <span className="editor-stage-caption-hr" aria-hidden />
                <span>{rotatingCaption}</span>
                <span className="editor-stage-caption-hr" aria-hidden />
              </>
            )}
          </div>
          <div className="editor-viewer-hint">{COPY.editor.viewerHint}</div>

          <div className="editor-chips-row">
            <div
              className="editor-chips"
              role="tablist"
              aria-label="Compare original and styled"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!showOriginal}
                className="editor-chip"
                onClick={() => setShowOriginal(false)}
                disabled={!hasStyled}
              >
                {COPY.editor.styledChip}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showOriginal}
                className="editor-chip"
                onClick={() => setShowOriginal(true)}
                disabled={!hasStyled}
              >
                {COPY.editor.originalChip}
              </button>
            </div>
          </div>

          {error && (
            <div className="editor-err-banner" role="alert">
              <span className="editor-err-dot" aria-hidden />
              <em>{error}</em>
            </div>
          )}
        </section>

        <section className="editor-gallery-section" aria-label="Style gallery">
          <div className="editor-section-head">
            <h3 className="editor-section-heading">
              {COPY.editor.styleHeadingBefore}
              <em>{COPY.editor.styleHeadingItalic}</em>
              {COPY.editor.styleHeadingAfter}
            </h3>
            <div className="editor-section-hairline" aria-hidden />
            <span className="editor-section-helper">{COPY.editor.styleHelper}</span>
          </div>

          {preloading && (
            <div className="editor-preload" role="status" aria-live="polite">
              <span className="editor-preload-pulse" aria-hidden />
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
        </section>
      </main>

      <div className="editor-actionbar">
        <div className="editor-actionbar-inner">
          <motion.span
            key="ready-rule"
            className="editor-ready-rule"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: hasStyled ? 1 : 0 }}
            transition={{ duration: 0.56, ease: [0.22, 0.61, 0.36, 1] }}
          />
          {finalizing && (
            <div className="sr-only" role="status" aria-live="polite">
              {COPY.editor.savingButton}
            </div>
          )}
          <button
            type="button"
            className="editor-btn editor-btn--ghost"
            onClick={onOrderCanvas}
            disabled={isSaving}
          >
            {COPY.editor.orderCanvas}
          </button>
          <button
            type="button"
            className="editor-btn editor-btn--primary"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
