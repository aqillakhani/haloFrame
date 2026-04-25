# App Store + Play Store Launch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Each task is bite-sized and self-contained — read it, execute the steps, commit, move to the next. If you have a partner agent, see the [parallel execution map](#parallel-execution-map) at the bottom.

**Goal:** Take haloFrame from "web-shipped + Capacitor-scaffolded" to "live on Apple App Store and Google Play" by 2026-05-30 — 35 days after Day 0.

**Architecture:** Web stays on Stripe (browser, no IAP). iOS/Android route subscriptions through RevenueCat → Apple IAP / Google Play Billing. Stripe stays on all surfaces for canvas prints (physical-goods exception). New AI-safety surface (consent modal, badge, watermark, user-reporting) addresses Apple 5.1.2(i) + Google AI Content Policy.

**Tech Stack:** React 18 + Vite (web), Express + Pino (api), Supabase (db/auth/storage), Capacitor 8 (native shell), `@revenuecat/purchases-capacitor` (IAP bridge), sharp (server image ops), Codemagic (iOS CI), Vitest + Playwright (tests).

**Worktree:** `.worktrees/prod-ready` (branch `prod-ready/main`). The main checkout is stale — verify with `git rev-parse --abbrev-ref HEAD` returning `prod-ready/main` before editing anything.

**Parent design:** `docs/plans/2026-04-25-app-store-launch-design.md` (approved by Aqil 2026-04-25, all 4 sections locked).

**Backing research:** `APPSTORE_PLAYSTORE_RESEARCH.md` (committed 2026-04-25, primary-source citations).

**Anchor calendar:** Day 0 = Sat 2026-04-25; 🔒 dual-submit Day 14 = Sat 2026-05-09; 🔒 production submit Day 28 = Sat 2026-05-23; 🎯 stores live Day 35 = Sat 2026-05-30.

---

## Table of contents

1. [Pre-flight (start here)](#pre-flight-start-here)
2. [Phase 0 — Branch + dependencies](#phase-0--branch--dependencies-day-0)
3. [Phase 1 — Database migration](#phase-1--database-migration-day-1)
4. [Phase 2 — AI consent UX](#phase-2--ai-consent-ux-day-2)
5. [Phase 3 — AI badge + report sheet](#phase-3--ai-badge--report-sheet-day-3)
6. [Phase 4 — Server-side report + watermark](#phase-4--server-side-report--watermark-day-4)
7. [Phase 5 — RevenueCat client SDK](#phase-5--revenuecat-client-sdk-days-1-2)
8. [Phase 6 — Native photo picker](#phase-6--native-photo-picker-day-5)
9. [Phase 7 — Public legal hosting](#phase-7--public-legal-hosting-day-2)
10. [Phase 8 — Capacitor native scaffolds](#phase-8--capacitor-native-scaffolds-day-8-9)
11. [Phase 9 — Codemagic iOS CI](#phase-9--codemagic-ios-ci-day-9-10)
12. [Phase 10 — Demo account seeder](#phase-10--demo-account-seeder-day-5)
13. [Phase 11 — Documentation](#phase-11--documentation-days-6-11)
14. [Phase 12 — E2E + release candidate](#phase-12--e2e--release-candidate-days-13-14)
15. [Track A — Manual prerequisites (Aqil-owned)](#track-a--manual-prerequisites-aqil-owned)
16. [Parallel execution map](#parallel-execution-map)
17. [Definition of done](#definition-of-done)

---

## Pre-flight (start here)

Run these checks **before writing any code**. If any fail, stop and resolve.

### P.1 Confirm you are in the right worktree

```bash
pwd
# Expected: C:/Users/claws/OneDrive/Desktop/haloFrame/.worktrees/prod-ready
git rev-parse --abbrev-ref HEAD
# Expected: prod-ready/main
git status
# Expected: clean (or only the new design+research docs untracked, which is fine)
```

If you are NOT in `.worktrees/prod-ready`, stop. The main checkout is stale per memory — see `MEMORY.md` entry "Active worktree is .worktrees/prod-ready".

### P.2 Confirm baseline is green

```bash
npm install
npm run typecheck
npm --workspace=@haloframe/web run test:unit
npm --workspace=@haloframe/web run test:e2e
node scripts/smoke-redesign.mjs
```

All five must pass. If any are red, fix them first — do not stack new work on a broken baseline.

### P.3 Read the design doc end-to-end

Open `docs/plans/2026-04-25-app-store-launch-design.md`. Sections 5 (architecture diagram), 7 (code changes), and 12 (subscription product IDs) are the spec. Sections 6 (calendar), 8 (Track A), and 9 (risk register) are context. Don't skip section 12 — the product IDs MUST match across backend, RC dashboard, ASC, Play Console.

### P.4 Confirm the placeholders Aqil owes you

The design doc §3 lists Aqil-supplied values. The plan needs **these by end of Day 1**:

- `{{COMPANY_LEGAL_NAME}}` — for Privacy + Terms + reviewer-account creation
- `{{CONTACT_EMAIL}}` = `support@haloframe.app` (set up Day 1, Track A §8.1)
- `{{JURISDICTION}}` — Aqil's state, for the arbitration clause

If unblocked, ping Aqil. Phase 7 (legal hosting) cannot complete without these.

---

## Phase 0 — Branch + dependencies (Day 0)

**Goal:** Cut the working branch, install the two new packages, set up React Testing Library so component tests work in later phases.

### Task 0.1: Create the working branch

**Files:**
- No file changes; git only.

**Step 1: Cut the branch**

```bash
git checkout -b appstore-launch
```

Expected: `Switched to a new branch 'appstore-launch'`

**Step 2: Confirm**

```bash
git branch --show-current
```

Expected: `appstore-launch`

**Step 3: Push to track origin (optional, recommended for backup)**

```bash
git push -u origin appstore-launch
```

No commit yet — the branch creation IS the artifact.

---

### Task 0.2: Install RevenueCat + Capacitor assets packages

**Files:**
- Modify: `apps/web/package.json` (deps + devDeps)

**Step 1: Install runtime dep**

```bash
npm --workspace=@haloframe/web install @revenuecat/purchases-capacitor@^9.0.0
```

Expected output ends with `added N packages`. Check that `apps/web/package.json` now has `"@revenuecat/purchases-capacitor": "^9.x.x"` under `dependencies`.

**Step 2: Install asset generator (devDep)**

```bash
npm --workspace=@haloframe/web install -D @capacitor/assets@^3.0.0
```

Expected output: `added N packages`. Check that `@capacitor/assets` is in `devDependencies`.

**Step 3: Confirm typecheck still passes**

```bash
npm run typecheck
```

Expected: zero errors. If RevenueCat types break the build, pin to a specific known-good version (e.g. `9.0.0` exact, no caret).

**Step 4: Add an `assets:gen` npm script**

In `apps/web/package.json`, add to `scripts`:

```json
"assets:gen": "capacitor-assets generate --iconBackgroundColor '#FAF3E2' --splashBackgroundColor '#FAF3E2'"
```

**Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json package-lock.json
git commit -m "chore(web): add @revenuecat/purchases-capacitor + @capacitor/assets

Foundation for IAP via RC SDK and icon/splash generation.
Part of app-store launch (see docs/plans/2026-04-25-app-store-launch-design.md)."
```

---

### Task 0.3: Set up React Testing Library for component tests

The current `vitest.config.ts` may not have a DOM environment set, and `@testing-library/react` is not yet a dep. Phases 2+ need it.

**Files:**
- Modify: `apps/web/package.json` (devDeps)
- Modify: `apps/web/vitest.config.ts` (environment)
- Create: `apps/web/src/test/setup.ts` (jest-dom matchers + cleanup)

**Step 1: Read the current vitest config**

```bash
cat apps/web/vitest.config.ts
```

Note whether it already sets `environment: 'jsdom'`. If yes, skip Step 3's environment edit.

**Step 2: Install RTL + jsdom + jest-dom**

```bash
npm --workspace=@haloframe/web install -D @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14 jsdom@^25
```

**Step 3: Update `apps/web/vitest.config.ts`**

Add (or set):

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/**', 'node_modules/**'],
  },
});
```

Preserve any existing settings; only add what's missing.

**Step 4: Create `apps/web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

**Step 5: Smoke-test that existing tests still pass**

```bash
npm --workspace=@haloframe/web run test:unit
```

Expected: existing 3 tests still pass (`copy.test.ts`).

**Step 6: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json package-lock.json apps/web/vitest.config.ts apps/web/src/test/setup.ts
git commit -m "chore(web): wire React Testing Library for component tests

jsdom + @testing-library/react + jest-dom matchers. Foundation for
AIConsentModal, AIBadge, ReportContentSheet tests in upcoming phases."
```

---

## Phase 1 — Database migration (Day 1)

**Goal:** Land the additive schema changes the consent + report features will write to. Apply to dev DB. Production application waits for Aqil — see `docs/MORNING_CHECKLIST.md`.

### Task 1.1: Author the migration SQL

**Files:**
- Create: `supabase/migrations/20260425000001_app_store_compliance.sql`

**Step 1: Author the migration**

```sql
-- =============================================================================
-- App Store + Play Store compliance schema additions (2026-04-25)
-- =============================================================================
-- Adds:
--   profiles.ai_consent_at        — timestamp of explicit AI processing consent
--   tributes.flagged_at           — timestamp when content was reported
--   tributes.flagged_reason       — short reason text (mirror of latest report)
--   reports                       — full audit trail of user-submitted reports
--
-- All changes are additive (no drops, no rewrites) → safe to apply on a live DB
-- with zero downtime. See docs/plans/2026-04-25-app-store-launch-design.md §7.D.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at TIMESTAMPTZ NULL;

ALTER TABLE tributes
  ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS flagged_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribute_id UUID NOT NULL REFERENCES tributes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) <= 64),
  note TEXT NULL CHECK (char_length(note) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lightweight indices for the moderation queue (admin-side; not used by SDK).
CREATE INDEX IF NOT EXISTS reports_tribute_idx ON reports (tribute_id);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);

-- RLS: only the service role writes to reports. Users never read this table
-- directly; their own POST goes through the API which uses service role.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_service_only" ON reports;
CREATE POLICY "reports_service_only"
  ON reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Step 2: Verify it parses**

```bash
# Optional: if you have psql + a scratch DB locally, run it to verify syntax.
# Otherwise the next step (apply via Supabase CLI / dashboard) is the test.
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260425000001_app_store_compliance.sql
git commit -m "feat(db): app-store compliance migration

Adds:
- profiles.ai_consent_at (Apple 5.1.2(i) consent timestamp)
- tributes.flagged_at + flagged_reason (Google AI Content Policy reporting)
- reports table (full audit trail; service-role-only RLS)

Additive, idempotent (uses IF NOT EXISTS). Safe on live DB."
```

---

### Task 1.2: Apply to dev DB

**Files:**
- No file changes.

**Step 1: Apply via Supabase CLI**

```bash
supabase db push --db-url "$SUPABASE_DEV_DB_URL"
```

OR via the dashboard SQL editor: paste the file contents, run, confirm "Success".

**Step 2: Verify by querying**

```bash
psql "$SUPABASE_DEV_DB_URL" -c "\\d profiles" | grep ai_consent_at
psql "$SUPABASE_DEV_DB_URL" -c "\\d tributes" | grep flagged_
psql "$SUPABASE_DEV_DB_URL" -c "\\d reports"
```

Expected: all three queries return matching column / table definitions.

**Step 3: Production DB application is deferred — note it in `docs/MORNING_CHECKLIST.md`**

The morning-checklist update is Phase 11 Task 11.5; just leave a TODO sticky for now.

No commit (no file change). Track Aqil's prod application in the checklist.

---

## Phase 2 — AI consent UX (Day 2)

**Goal:** Show an explicit AI-processing consent modal before the first photo upload. Persist consent to localStorage + `profiles.ai_consent_at`. Block uploads until consent is given. This is the **#1 Apple-approval blocker** (guideline 5.1.2(i)).

Follow [@superpowers:test-driven-development](skills/test-driven-development) for every task in this phase.

### Task 2.1: `consent.ts` — pure utilities (TDD)

**Files:**
- Create: `apps/web/src/lib/consent.ts`
- Create: `apps/web/src/lib/consent.test.ts`

**Step 1: Write the failing test**

`apps/web/src/lib/consent.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasConsented, recordConsent, CONSENT_LOCAL_KEY } from './consent';

describe('consent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('hasConsented', () => {
    it('returns false when no consent recorded', () => {
      expect(hasConsented()).toBe(false);
    });

    it('returns true when consent timestamp is in localStorage', () => {
      localStorage.setItem(CONSENT_LOCAL_KEY, new Date().toISOString());
      expect(hasConsented()).toBe(true);
    });

    it('returns false when localStorage value is invalid', () => {
      localStorage.setItem(CONSENT_LOCAL_KEY, 'not-a-date');
      expect(hasConsented()).toBe(false);
    });
  });

  describe('recordConsent', () => {
    it('writes ISO timestamp to localStorage', async () => {
      await recordConsent({ syncToServer: false });
      const stored = localStorage.getItem(CONSENT_LOCAL_KEY);
      expect(stored).toBeTruthy();
      expect(() => new Date(stored!).toISOString()).not.toThrow();
    });

    it('calls supabase update when syncToServer=true', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ error: null });
      const mockEq = vi.fn().mockReturnValue({ then: (cb: any) => cb({ error: null }) });
      vi.doMock('./supabase', () => ({
        supabase: {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
          from: () => ({ update: mockUpdate.mockReturnValue({ eq: mockEq }) }),
        },
      }));
      const { recordConsent: rc } = await import('./consent');
      await rc({ syncToServer: true });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ ai_consent_at: expect.any(String) }),
      );
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm --workspace=@haloframe/web run test:unit -- consent
```

Expected: FAIL with "Cannot find module './consent'".

**Step 3: Implement minimal code**

`apps/web/src/lib/consent.ts`:

```ts
import { supabase } from './supabase';

export const CONSENT_LOCAL_KEY = 'haloframe.ai_consent_at';

export function hasConsented(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(CONSENT_LOCAL_KEY);
  if (!raw) return false;
  const ts = Date.parse(raw);
  return Number.isFinite(ts);
}

export interface RecordConsentOptions {
  syncToServer?: boolean;
}

export async function recordConsent(
  opts: RecordConsentOptions = { syncToServer: true },
): Promise<void> {
  const now = new Date().toISOString();
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONSENT_LOCAL_KEY, now);
  }

  if (!opts.syncToServer) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // anon users — localStorage suffices until sign-in
    await supabase
      .from('profiles')
      .update({ ai_consent_at: now })
      .eq('id', user.id);
  } catch (err) {
    console.error('[consent] server sync failed (non-fatal)', err);
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm --workspace=@haloframe/web run test:unit -- consent
```

Expected: all 5 tests PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/consent.ts apps/web/src/lib/consent.test.ts
git commit -m "feat(web): consent.ts — AI consent persistence

Pure utilities: hasConsented(), recordConsent(). LocalStorage-first,
optional Supabase profiles.ai_consent_at sync. Required for Apple
guideline 5.1.2(i)."
```

---

### Task 2.2: `useConsent.ts` hook

**Files:**
- Create: `apps/web/src/hooks/useConsent.ts`

**Step 1: Write the failing test (in same file via vitest is fine, or co-located)**

`apps/web/src/hooks/useConsent.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConsent } from './useConsent';
import { CONSENT_LOCAL_KEY } from '../lib/consent';

describe('useConsent', () => {
  beforeEach(() => localStorage.clear());

  it('returns hasConsented=false initially', () => {
    const { result } = renderHook(() => useConsent());
    expect(result.current.hasConsented).toBe(false);
  });

  it('returns true after grant()', async () => {
    const { result } = renderHook(() => useConsent());
    await act(async () => {
      await result.current.grant();
    });
    expect(result.current.hasConsented).toBe(true);
    expect(localStorage.getItem(CONSENT_LOCAL_KEY)).toBeTruthy();
  });
});
```

**Step 2: Run test, verify fail**

```bash
npm --workspace=@haloframe/web run test:unit -- useConsent
```

Expected: FAIL — module not found.

**Step 3: Implement**

`apps/web/src/hooks/useConsent.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { hasConsented as readConsent, recordConsent } from '../lib/consent';

interface UseConsentValue {
  hasConsented: boolean;
  grant: () => Promise<void>;
  ready: boolean;
}

export function useConsent(): UseConsentValue {
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    setHasConsented(readConsent());
    setReady(true);
  }, []);

  const grant = useCallback(async () => {
    await recordConsent({ syncToServer: true });
    setHasConsented(true);
  }, []);

  return { hasConsented, grant, ready };
}
```

**Step 4: Run, verify pass**

```bash
npm --workspace=@haloframe/web run test:unit -- useConsent
```

Expected: 2 tests PASS.

**Step 5: Commit**

```bash
git add apps/web/src/hooks/useConsent.ts apps/web/src/hooks/useConsent.test.tsx
git commit -m "feat(web): useConsent hook

Wraps consent.ts utilities for React components. Returns
{hasConsented, grant, ready} so screens can gate uploads."
```

---

### Task 2.3: `AIConsentModal` component (TDD)

**Files:**
- Create: `apps/web/src/components/AIConsentModal.tsx`
- Create: `apps/web/src/components/AIConsentModal.test.tsx`

**Step 1: Write the failing test**

`apps/web/src/components/AIConsentModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIConsentModal } from './AIConsentModal';

describe('AIConsentModal', () => {
  it('renders the AI partner disclosure', () => {
    render(<AIConsentModal open onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/fal\.ai/i)).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent(/your photos/i);
  });

  it('does not render when open=false', () => {
    render(<AIConsentModal open={false} onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onAccept when "I understand" tapped', () => {
    const onAccept = vi.fn();
    render(<AIConsentModal open onAccept={onAccept} onDecline={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /understand/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when "Not now" tapped', () => {
    const onDecline = vi.fn();
    render(<AIConsentModal open onAccept={vi.fn()} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('links to the privacy policy', () => {
    render(<AIConsentModal open onAccept={vi.fn()} onDecline={vi.fn()} />);
    const link = screen.getByRole('link', { name: /privacy/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/privacy'));
  });
});
```

**Step 2: Run, verify fail**

```bash
npm --workspace=@haloframe/web run test:unit -- AIConsentModal
```

Expected: FAIL.

**Step 3: Implement (~120 LOC component)**

`apps/web/src/components/AIConsentModal.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIConsentModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function AIConsentModal({ open, onAccept, onDecline }: AIConsentModalProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-consent-heading"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="max-w-md rounded-2xl bg-white p-6 shadow-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <h2
              id="ai-consent-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-serif text-stone-900"
            >
              Your photos, your choice
            </h2>

            <div className="mt-4 space-y-3 text-sm text-stone-700 leading-relaxed">
              <p>
                haloFrame creates memorial portraits using AI. To do this, the
                photos you upload are sent to our AI partner,{' '}
                <strong>fal.ai</strong>, for processing.
              </p>
              <p>
                Your photos are encrypted in transit, never shared beyond
                processing, and never used to train AI models. You can delete
                them and your account at any time from Settings.
              </p>
              <p>
                Read the full{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-stone-900"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={onAccept}
                className="w-full rounded-full bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-800"
              >
                I understand — continue
              </button>
              <button
                type="button"
                onClick={onDecline}
                className="w-full py-2 text-sm text-stone-500 hover:text-stone-700"
              >
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 4: Run, verify pass**

```bash
npm --workspace=@haloframe/web run test:unit -- AIConsentModal
```

Expected: 5 tests PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/AIConsentModal.tsx apps/web/src/components/AIConsentModal.test.tsx
git commit -m "feat(web): AIConsentModal — Apple 5.1.2(i) gate

Explicit AI-processing disclosure shown before first photo upload.
Names fal.ai. Links to privacy policy. ARIA dialog + focus management.
Required for App Store approval."
```

---

### Task 2.4: Wire AIConsentModal to ReuniteFlow

**Files:**
- Modify: `apps/web/src/screens/ReuniteFlow.tsx`

**Step 1: Read the current ReuniteFlow** to find the upload entry point

```bash
grep -n "upload\|onPickPhoto\|file.*input" apps/web/src/screens/ReuniteFlow.tsx | head -20
```

Find the function that currently handles upload start (e.g. `handlePickFile` or similar).

**Step 2: Add the consent gate**

At the top of the component:

```tsx
import { useState } from 'react';
import { useConsent } from '../hooks/useConsent';
import { AIConsentModal } from '../components/AIConsentModal';

// ... inside the component body
const { hasConsented, grant } = useConsent();
const [pendingUpload, setPendingUpload] = useState<File | null>(null);
const [consentOpen, setConsentOpen] = useState(false);
```

Wrap the existing upload trigger:

```tsx
async function handlePickFile(file: File) {
  if (!hasConsented) {
    setPendingUpload(file);
    setConsentOpen(true);
    return;
  }
  // ... existing logic
}

async function handleConsentAccept() {
  await grant();
  setConsentOpen(false);
  if (pendingUpload) {
    const file = pendingUpload;
    setPendingUpload(null);
    await handlePickFile(file); // re-enter with consent now true
  }
}

function handleConsentDecline() {
  setConsentOpen(false);
  setPendingUpload(null);
}
```

Render the modal at the bottom of the JSX:

```tsx
<AIConsentModal
  open={consentOpen}
  onAccept={handleConsentAccept}
  onDecline={handleConsentDecline}
/>
```

**Step 3: Manual smoke test**

```bash
npm --workspace=@haloframe/web run dev
```

Open `http://localhost:5173`, navigate to Reunite, clear localStorage (`localStorage.clear()` in console), try to upload — modal should block. Click "I understand", upload should proceed.

**Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

**Step 5: Commit**

```bash
git add apps/web/src/screens/ReuniteFlow.tsx
git commit -m "feat(web): gate Reunite upload on AI consent

Blocks first photo upload until user explicitly consents to fal.ai
processing. Uses useConsent hook + AIConsentModal."
```

---

### Task 2.5: Wire AIConsentModal to EnhanceFlow

**Files:**
- Modify: `apps/web/src/screens/EnhanceFlow.tsx`

**Step 1-4:** Same pattern as Task 2.4 — find the upload entry point, wrap with consent gate, render modal, smoke-test.

**Step 5: Commit**

```bash
git add apps/web/src/screens/EnhanceFlow.tsx
git commit -m "feat(web): gate Enhance upload on AI consent

Same gating pattern as Reunite — useConsent + AIConsentModal block
first upload until explicit consent recorded."
```

---

## Phase 3 — AI badge + report sheet (Day 3)

**Goal:** Always-visible "✨ AI-generated" badge on every composite. User-reporting sheet. Copy scrub-pass to remove "deepfake/resurrect/alive again" language. These satisfy Google's AI Content Policy + the deepfake-mitigation half of the design.

### Task 3.1: `AIBadge` component (TDD)

**Files:**
- Create: `apps/web/src/components/AIBadge.tsx`
- Create: `apps/web/src/components/AIBadge.test.tsx`

**Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIBadge } from './AIBadge';

describe('AIBadge', () => {
  it('renders the AI label', () => {
    render(<AIBadge />);
    expect(screen.getByText(/AI-generated/i)).toBeInTheDocument();
  });

  it('uses ✨ prefix', () => {
    render(<AIBadge />);
    expect(screen.getByText(/✨/)).toBeInTheDocument();
  });

  it('accepts size="sm" / size="md"', () => {
    const { rerender } = render(<AIBadge size="sm" data-testid="badge" />);
    rerender(<AIBadge size="md" data-testid="badge" />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });
});
```

**Step 2-4: Implement, verify**

```tsx
interface AIBadgeProps {
  size?: 'sm' | 'md';
  'data-testid'?: string;
}

export function AIBadge({ size = 'sm', ...rest }: AIBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/85 ${sizeClass} font-medium text-stone-700 backdrop-blur-sm shadow-sm`}
      {...rest}
    >
      <span aria-hidden>✨</span>
      <span>AI-generated</span>
    </span>
  );
}
```

```bash
npm --workspace=@haloframe/web run test:unit -- AIBadge
```

**Step 5: Commit**

```bash
git add apps/web/src/components/AIBadge.tsx apps/web/src/components/AIBadge.test.tsx
git commit -m "feat(web): AIBadge component

Always-visible '✨ AI-generated' pill. Two sizes (sm/md). Used on
Editor canvas + MyTributes lightbox per Apple/Google AI labeling
guidance."
```

---

### Task 3.2: Bake AIBadge into Editor

**Files:**
- Modify: `apps/web/src/screens/Editor.tsx`

**Step 1: Locate the composite-image render**

```bash
grep -n "img\|<canvas\|composite\|finalImage\|image-preview" apps/web/src/screens/Editor.tsx | head
```

**Step 2: Add overlay**

Wrap the composite render in a `relative` parent and absolute-position the badge:

```tsx
import { AIBadge } from '../components/AIBadge';
// ...
<div className="relative">
  <img src={compositeUrl} alt="Tribute composite" />
  <div className="absolute bottom-3 right-3 pointer-events-none">
    <AIBadge size="sm" />
  </div>
</div>
```

**Step 3: Manual smoke test in dev** — generate a tribute, confirm badge visible bottom-right.

**Step 4: Typecheck**

```bash
npm run typecheck
```

**Step 5: Commit**

```bash
git add apps/web/src/screens/Editor.tsx
git commit -m "feat(web): AIBadge on Editor composite

Bottom-right '✨ AI-generated' badge always visible on the editor
preview. Pointer-events-none so it doesn't intercept gestures."
```

---

### Task 3.3: Bake AIBadge into MyTributes lightbox

**Files:**
- Modify: `apps/web/src/screens/MyTributesScreen.tsx`

Same pattern as Task 3.2 — find the lightbox image, overlay the badge.

```bash
git add apps/web/src/screens/MyTributesScreen.tsx
git commit -m "feat(web): AIBadge on MyTributes lightbox"
```

---

### Task 3.4: `api.ts` reportContent helper

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Locate where other api helpers live**

```bash
grep -n "export async function\|export function" apps/web/src/lib/api.ts | head
```

**Step 2: Add the helper near the bottom of the file**

```ts
export interface ReportContentInput {
  tributeId: string;
  reason:
    | 'inappropriate'
    | 'misuse'
    | 'wrong_person'
    | 'quality'
    | 'other';
  note?: string;
}

export async function reportContent(input: ReportContentInput): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new ApiRequestError(
      'Report submission failed',
      res.status,
      await res.json().catch(() => ({})),
    );
  }
}
```

(Adjust `API_BASE_URL` and `getAccessToken` to match the existing patterns in the file.)

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): api.reportContent helper

POSTs {tributeId, reason, note} to /api/report. Used by
ReportContentSheet."
```

---

### Task 3.5: `ReportContentSheet` component (TDD)

**Files:**
- Create: `apps/web/src/components/ReportContentSheet.tsx`
- Create: `apps/web/src/components/ReportContentSheet.test.tsx`

**Step 1: Test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportContentSheet } from './ReportContentSheet';
import * as api from '../lib/api';

describe('ReportContentSheet', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('renders all reason options', () => {
    render(<ReportContentSheet open tributeId="t1" onClose={vi.fn()} />);
    expect(screen.getByLabelText(/inappropriate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/misuse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/wrong person/i)).toBeInTheDocument();
  });

  it('submit button disabled until reason selected', () => {
    render(<ReportContentSheet open tributeId="t1" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/inappropriate/i));
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('calls api.reportContent then onClose on submit', async () => {
    const onClose = vi.fn();
    const spy = vi.spyOn(api, 'reportContent').mockResolvedValue(undefined);
    render(<ReportContentSheet open tributeId="t1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/inappropriate/i));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({
      tributeId: 't1',
      reason: 'inappropriate',
      note: undefined,
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

**Step 2: Implementation** (~80 LOC bottom sheet using framer-motion)

`apps/web/src/components/ReportContentSheet.tsx`:

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { reportContent, type ReportContentInput } from '../lib/api';

interface ReportContentSheetProps {
  open: boolean;
  tributeId: string;
  onClose: () => void;
}

const REASONS: Array<{ id: ReportContentInput['reason']; label: string }> = [
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'misuse', label: 'Misuse / impersonation' },
  { id: 'wrong_person', label: 'Wrong person rendered' },
  { id: 'quality', label: 'Quality issue' },
  { id: 'other', label: 'Something else' },
];

export function ReportContentSheet({ open, tributeId, onClose }: ReportContentSheetProps) {
  const [reason, setReason] = useState<ReportContentInput['reason'] | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setErr(null);
    try {
      await reportContent({ tributeId, reason, note: note.trim() || undefined });
      onClose();
      setReason(null);
      setNote('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit report');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-t-2xl bg-white p-6"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-serif text-stone-900">Report this tribute</h3>
            <p className="mt-2 text-sm text-stone-600">
              Tell us what's wrong. We review every report within 24 hours.
            </p>

            <fieldset className="mt-4 space-y-2">
              {REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>

            <textarea
              className="mt-3 w-full rounded-lg border border-stone-200 p-2 text-sm"
              placeholder="Anything else we should know? (optional)"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full py-2 text-sm text-stone-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!reason || submitting}
                className="flex-1 rounded-full bg-stone-900 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 3-4: Run tests, verify**

```bash
npm --workspace=@haloframe/web run test:unit -- ReportContentSheet
```

**Step 5: Commit**

```bash
git add apps/web/src/components/ReportContentSheet.tsx apps/web/src/components/ReportContentSheet.test.tsx
git commit -m "feat(web): ReportContentSheet — Google AI Content Policy reporting

Bottom sheet w/ 5 reason radios + optional note. POSTs to /api/report.
Required by Google Play AI-generated content policy."
```

---

### Task 3.6: Wire ReportContentSheet trigger into Editor + MyTributes

**Files:**
- Modify: `apps/web/src/screens/Editor.tsx`
- Modify: `apps/web/src/screens/MyTributesScreen.tsx`

Pattern: small "Report" button next to the AIBadge (or in an overflow menu), opens `ReportContentSheet open={true} tributeId={...} onClose={...}`.

**Step 1: Editor — Add trigger near AIBadge**

```tsx
import { useState } from 'react';
import { ReportContentSheet } from '../components/ReportContentSheet';

const [reportOpen, setReportOpen] = useState(false);
// ...
<button
  type="button"
  onClick={() => setReportOpen(true)}
  className="text-xs text-stone-500 underline"
>
  Report
</button>
<ReportContentSheet
  open={reportOpen}
  tributeId={currentTributeId}
  onClose={() => setReportOpen(false)}
/>
```

**Step 2: MyTributes** — same pattern in the lightbox.

**Step 3: Typecheck + commit**

```bash
npm run typecheck
git add apps/web/src/screens/Editor.tsx apps/web/src/screens/MyTributesScreen.tsx
git commit -m "feat(web): wire ReportContentSheet into Editor + MyTributes"
```

---

### Task 3.7: copy.ts scrub-pass

**Files:**
- Modify: `apps/web/src/lib/copy.ts`
- Modify: `apps/web/src/lib/copy.test.ts` (add regression tests)

The design doc §7.B mandates scrubbing: "deepfake," "alive again," "resurrect," "bring back" → "honor," "memorial," "tribute," "remember." Reasoning: see APPSTORE_PLAYSTORE_RESEARCH.md §4.2.

**Step 1: Add a regression test FIRST**

```ts
// In copy.test.ts, append:
describe('store-safe vocabulary', () => {
  const FORBIDDEN = ['deepfake', 'resurrect', 'alive again', 'bring back', 'bring them back'];
  const json = JSON.stringify(COPY).toLowerCase();

  for (const word of FORBIDDEN) {
    it(`does not contain "${word}"`, () => {
      expect(json).not.toContain(word.toLowerCase());
    });
  }
});
```

**Step 2: Run test to verify which words trip**

```bash
npm --workspace=@haloframe/web run test:unit -- copy
```

If anything fails, those are the strings to scrub.

**Step 3: Open `apps/web/src/lib/copy.ts`** and search for each forbidden word; replace with the approved vocabulary:

| Forbidden | Replacement |
|---|---|
| deepfake | composite portrait |
| resurrect / resurrected | honor / honoring |
| alive again | with us in spirit |
| bring back / bring them back | bring together / reunite gently |

**Step 4: Re-run, verify pass**

```bash
npm --workspace=@haloframe/web run test:unit -- copy
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/copy.ts apps/web/src/lib/copy.test.ts
git commit -m "fix(web): scrub-pass copy for store-safe vocabulary

Removes 'deepfake/resurrect/alive again/bring back' per Apple+Google
review-risk research. Adds regression test that fails the build if
forbidden vocabulary regresses."
```

---

## Phase 4 — Server-side report + watermark (Day 4)

**Goal:** Land the `/api/report` endpoint and the `applyWatermark` service. Both are single-purpose, server-only code paths. Tests use Vitest + supertest where possible (or direct function-call tests).

### Task 4.1: `/api/report` route — TDD

**Files:**
- Create: `apps/api/src/routes/report.ts`
- Create: `apps/api/src/routes/report.test.ts`

**Step 1: Test (uses supertest if available, else direct handler invocation)**

`apps/api/src/routes/report.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { reportRouter } from './report.js';

vi.mock('../config/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('POST /api/report', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/report', reportRouter);
  });

  it('rejects body without tributeId', async () => {
    const res = await request(app).post('/api/report').send({ reason: 'misuse' });
    expect(res.status).toBe(400);
  });

  it('rejects body with unknown reason', async () => {
    const res = await request(app).post('/api/report').send({
      tributeId: '00000000-0000-0000-0000-000000000001',
      reason: 'this-is-not-valid',
    });
    expect(res.status).toBe(400);
  });

  it('inserts report and updates tribute on valid body', async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const { supabaseAdmin } = await import('../config/supabase.js');
    (supabaseAdmin.from as any) = vi.fn((tbl: string) => ({
      insert: tbl === 'reports' ? insert : vi.fn(),
      update: tbl === 'tributes' ? update : vi.fn(),
    }));

    const res = await request(app).post('/api/report').send({
      tributeId: '00000000-0000-0000-0000-000000000001',
      reason: 'inappropriate',
      note: 'short note',
    });
    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalled();
  });
});
```

**Step 2: Add `supertest` to api devDeps if not present**

```bash
npm --workspace=@haloframe/api install -D supertest@^7 @types/supertest
```

**Step 3: Run, verify fail**

```bash
npm --workspace=@haloframe/api run test
```

Expected: FAIL — module not found.

**Step 4: Implement**

`apps/api/src/routes/report.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import * as Sentry from '@sentry/node';

const reportSchema = z.object({
  tributeId: z.string().uuid(),
  reason: z.enum(['inappropriate', 'misuse', 'wrong_person', 'quality', 'other']),
  note: z.string().max(2000).optional(),
});

export const reportRouter = Router();

reportRouter.post('/', async (req: Request, res: Response) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  }

  const { tributeId, reason, note } = parsed.data;
  const userId = (req as any).userId ?? null; // populated by auth middleware if mounted

  try {
    const { error: insertErr } = await supabaseAdmin.from('reports').insert({
      tribute_id: tributeId,
      user_id: userId,
      reason,
      note: note ?? null,
    });
    if (insertErr) throw insertErr;

    const { error: updateErr } = await supabaseAdmin
      .from('tributes')
      .update({
        flagged_at: new Date().toISOString(),
        flagged_reason: reason,
      })
      .eq('id', tributeId);
    if (updateErr) throw updateErr;

    Sentry.captureMessage(`tribute reported: ${tributeId} (${reason})`, 'info');
    logger.info({ tributeId, reason, userId }, 'tribute reported');
    return res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err, tributeId }, '[report] insert/update failed');
    Sentry.captureException(err);
    return res.status(500).json({ error: 'report_failed' });
  }
});
```

**Step 5: Run, verify pass**

```bash
npm --workspace=@haloframe/api run test -- report
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/report.ts apps/api/src/routes/report.test.ts apps/api/package.json
git commit -m "feat(api): /api/report endpoint

POST {tributeId, reason, note} → inserts into reports, flags tribute,
fires Sentry. Zod-validated. Required by Google AI Content Policy."
```

---

### Task 4.2: Register reportRouter in `apps/api/src/index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

**Step 1: Add inside the conditional block (around line 158, where other routers mount)**

```ts
const { reportRouter } = await import('./routes/report.js');
app.use('/api/report', reportRouter);
```

(Place after `app.use('/api/me', meRouter);` to keep things alphabetical-ish.)

**Step 2: Smoke**

```bash
npm --workspace=@haloframe/api run dev &
curl -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:4000/api/report
# Expected: 400 invalid_body
kill %1
```

**Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): mount /api/report under full-product routes"
```

---

### Task 4.3: Audit `/api/me` delete cascades

**Files:**
- Modify (only if needed): `apps/api/src/routes/me.ts`
- Modify (only if needed): a new test confirming end-to-end cascade

**Step 1: Read the current handler**

```bash
grep -n "DELETE\|delete\|cascade\|tributes\|storage\|credit_ledger" apps/api/src/routes/me.ts
```

**Step 2: Verify the delete chain covers**:
- `tributes` rows (the migration FK should already cascade reports)
- Supabase storage objects (composites + uploaded photos)
- `credit_ledger` rows
- `profiles` row
- `auth.users` (admin API)

If any are missing, add them. The new `reports` FK uses `ON DELETE CASCADE` to `tributes` and `auth.users`, so deleting either parent already cleans up `reports`.

**Step 3: If you make changes, add a test; otherwise, document the audit as a comment**

If no code changes: leave a comment in the handler:

```ts
// AUDIT 2026-04-25 (app-store-launch): cascade verified for tributes,
// storage, credit_ledger, profiles, auth.users. New `reports` table
// auto-cascades via FK to tributes + auth.users.
```

**Step 4: Commit (if changes)**

```bash
git add apps/api/src/routes/me.ts
git commit -m "chore(api): audit /api/me delete cascades for app-store launch

Verified cascade reaches tributes, storage objects, credit_ledger,
profiles, auth.users. New reports table auto-cascades via FK."
```

---

### Task 4.4: `watermark.ts` service — TDD

**Files:**
- Create: `apps/api/src/services/watermark.ts`
- Create: `apps/api/src/services/watermark.test.ts`

The watermark adds "✨ AI-generated · haloframe.app" to the bottom-right of every composite. Uses `sharp.composite` (already in the api deps; it's used elsewhere for image ops).

**Step 1: Test**

`apps/api/src/services/watermark.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyWatermark } from './watermark.js';

async function solidPng(width: number, height: number, rgba: number[]): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 },
    },
  })
    .png()
    .toBuffer();
}

describe('applyWatermark', () => {
  it('preserves output dimensions', async () => {
    const input = await solidPng(800, 600, [200, 200, 200, 255]);
    const output = await applyWatermark(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('changes pixels in the bottom-right region', async () => {
    const input = await solidPng(800, 600, [200, 200, 200, 255]);
    const output = await applyWatermark(input);
    // Sample bottom-right strip
    const inputStrip = await sharp(input)
      .extract({ left: 600, top: 540, width: 200, height: 60 })
      .raw()
      .toBuffer();
    const outputStrip = await sharp(output)
      .extract({ left: 600, top: 540, width: 200, height: 60 })
      .raw()
      .toBuffer();
    expect(Buffer.compare(inputStrip, outputStrip)).not.toBe(0);
  });

  it('does not change pixels in the top-left region', async () => {
    const input = await solidPng(800, 600, [200, 200, 200, 255]);
    const output = await applyWatermark(input);
    const inputStrip = await sharp(input)
      .extract({ left: 0, top: 0, width: 200, height: 60 })
      .raw()
      .toBuffer();
    const outputStrip = await sharp(output)
      .extract({ left: 0, top: 0, width: 200, height: 60 })
      .raw()
      .toBuffer();
    expect(Buffer.compare(inputStrip, outputStrip)).toBe(0);
  });

  it('is a no-op when WATERMARK_DISABLED=true', async () => {
    const oldEnv = process.env.WATERMARK_DISABLED;
    process.env.WATERMARK_DISABLED = 'true';
    const input = await solidPng(400, 400, [100, 100, 100, 255]);
    const output = await applyWatermark(input);
    expect(Buffer.compare(input, output)).toBe(0);
    process.env.WATERMARK_DISABLED = oldEnv;
  });
});
```

**Step 2: Run, verify fail**

```bash
npm --workspace=@haloframe/api run test -- watermark
```

**Step 3: Implement**

`apps/api/src/services/watermark.ts`:

```ts
import sharp from 'sharp';

const WATERMARK_TEXT = '✨ AI-generated · haloframe.app';

function buildWatermarkSvg(width: number): Buffer {
  const fontSize = Math.max(12, Math.round(width * 0.022));
  const padding = fontSize * 0.6;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 80">
      <rect x="0" y="0" rx="20" ry="20" width="600" height="80"
            fill="rgba(0,0,0,0.45)" />
      <text x="${padding}" y="50"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="32" fill="#ffffff" font-weight="500">${WATERMARK_TEXT}</text>
    </svg>`;
  return Buffer.from(svg);
}

export async function applyWatermark(input: Buffer): Promise<Buffer> {
  if (process.env.WATERMARK_DISABLED === 'true') {
    return input;
  }
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // Scale watermark width to ~38% of image width, maintain aspect ratio.
  const wmTargetWidth = Math.round(width * 0.38);
  const wmSvg = buildWatermarkSvg(wmTargetWidth);
  const wmRendered = await sharp(wmSvg)
    .resize({ width: wmTargetWidth })
    .png()
    .toBuffer();
  const wmMeta = await sharp(wmRendered).metadata();
  const wmHeight = wmMeta.height ?? 0;

  const margin = Math.round(width * 0.02);
  const left = width - wmTargetWidth - margin;
  const top = height - wmHeight - margin;

  return sharp(input)
    .composite([{ input: wmRendered, left, top }])
    .png()
    .toBuffer();
}
```

**Step 4: Verify tests pass**

```bash
npm --workspace=@haloframe/api run test -- watermark
```

**Step 5: Commit**

```bash
git add apps/api/src/services/watermark.ts apps/api/src/services/watermark.test.ts
git commit -m "feat(api): watermark service

sharp.composite + SVG-rendered '✨ AI-generated · haloframe.app' on
bottom-right ~38% width. Honors WATERMARK_DISABLED=true env for
testing. Tests assert dim preservation + bottom-right delta + top-left
no-op."
```

---

### Task 4.5: Pipe watermark through tribute output

**Files:**
- Modify: `apps/api/src/routes/spike.ts` (or `tribute.ts`, whichever produces the final composite)

**Step 1: Locate the upload-or-export step**

```bash
grep -n "uploadFromUrl\|signed\|upload(\|composite\|finalImage\|finalBuffer" apps/api/src/routes/spike.ts
```

**Step 2: Insert `applyWatermark` immediately before the upload**

```ts
import { applyWatermark } from '../services/watermark.js';
// ...
const watermarkedBuf = await applyWatermark(compositeBuf);
const { data, error } = await supabaseAdmin
  .storage
  .from('composites')
  .upload(path, watermarkedBuf, { contentType: 'image/png', upsert: true });
```

**Step 3: Smoke test in dev** — generate a tribute on web and confirm the badge appears in the saved image. Expected: download the composite, see the watermark. If not visible, adjust margin/font size in the SVG.

**Step 4: Commit**

```bash
git add apps/api/src/routes/spike.ts
git commit -m "feat(api): watermark every composite output

applyWatermark() runs immediately before the storage upload so every
generated composite carries the AI label as a baked-in pixel — even
if downloaded outside the app."
```

---

## Phase 5 — RevenueCat client SDK (Days 1-2)

**Goal:** Wire `@revenuecat/purchases-capacitor` so that on iOS/Android, subscription purchases route through Apple IAP / Google Play Billing instead of Stripe. Web retains Stripe. Restore Purchases button added to Settings (Apple-required).

This phase can run in **parallel with Phases 2–4** if you have a partner agent (the surfaces don't overlap).

### Task 5.1: `purchases.ts` — TDD with platform stubs

**Files:**
- Create: `apps/web/src/lib/purchases.ts`
- Create: `apps/web/src/lib/purchases.test.ts`

**Step 1: Test**

`apps/web/src/lib/purchases.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
}));

const purchasesMock = {
  configure: vi.fn(),
  getOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  getCustomerInfo: vi.fn(),
};

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: purchasesMock,
  LOG_LEVEL: { WARN: 'WARN' },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('purchases (web no-op mode)', () => {
  it('initRC is a no-op on web', async () => {
    const { initRC } = await import('./purchases');
    await initRC({ apiKey: 'web_key' });
    expect(purchasesMock.configure).not.toHaveBeenCalled();
  });

  it('getOfferings returns null on web', async () => {
    const { getOfferings } = await import('./purchases');
    const result = await getOfferings();
    expect(result).toBeNull();
  });
});

describe('purchases (native mode)', () => {
  beforeEach(async () => {
    const { Capacitor } = await import('@capacitor/core');
    (Capacitor.isNativePlatform as any).mockReturnValue(true);
    (Capacitor.getPlatform as any).mockReturnValue('ios');
  });

  it('initRC configures the SDK', async () => {
    vi.resetModules();
    const { initRC } = await import('./purchases');
    await initRC({ apiKey: 'ios_key' });
    expect(purchasesMock.configure).toHaveBeenCalledWith({ apiKey: 'ios_key' });
  });

  it('getOfferings returns mocked offerings', async () => {
    vi.resetModules();
    purchasesMock.getOfferings.mockResolvedValue({ current: { identifier: 'default' } });
    const { getOfferings } = await import('./purchases');
    const result = await getOfferings();
    expect(result?.current?.identifier).toBe('default');
  });
});
```

**Step 2: Run, verify fail**

```bash
npm --workspace=@haloframe/web run test:unit -- purchases
```

**Step 3: Implement**

`apps/web/src/lib/purchases.ts`:

```ts
import { Capacitor } from '@capacitor/core';

let initialised = false;

interface InitRCOptions {
  apiKey: string;
  appUserId?: string;
}

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initRC(opts: InitRCOptions): Promise<void> {
  if (!isNative() || initialised) return;
  const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey: opts.apiKey, appUserID: opts.appUserId });
  initialised = true;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const result = await Purchases.getOfferings();
  return result.offerings;
}

export async function purchasePackage(pkg: any) {
  if (!isNative()) {
    throw new Error('IAP only available on native platforms');
  }
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  return Purchases.purchasePackage({ aPackage: pkg });
}

export async function restorePurchases() {
  if (!isNative()) {
    throw new Error('Restore Purchases only available on native platforms');
  }
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  return Purchases.restorePurchases();
}

export async function getCustomerInfo() {
  if (!isNative()) return null;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const result = await Purchases.getCustomerInfo();
  return result.customerInfo;
}

export async function logIn(userId: string) {
  if (!isNative()) return;
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  await Purchases.logIn({ appUserID: userId });
}
```

**Step 4: Run, verify pass**

```bash
npm --workspace=@haloframe/web run test:unit -- purchases
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/purchases.ts apps/web/src/lib/purchases.test.ts
git commit -m "feat(web): purchases.ts — RevenueCat SDK wrapper

initRC/getOfferings/purchasePackage/restorePurchases/getCustomerInfo.
No-ops on web (returns null/throws), real RC calls on native. Lazy-
imports the SDK to keep web bundle clean."
```

---

### Task 5.2: Init RC in `main.tsx`

**Files:**
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/.env.example` (add VITE_RC_*)

**Step 1: Add env keys to `.env.example`**

```
VITE_RC_IOS_KEY=
VITE_RC_ANDROID_KEY=
```

**Step 2: Update `main.tsx`**

```tsx
import { Capacitor } from '@capacitor/core';
import { initRC } from './lib/purchases';

// ... near the top, after injectRootVars()
if (Capacitor.isNativePlatform()) {
  const platform = Capacitor.getPlatform();
  const apiKey =
    platform === 'ios'
      ? import.meta.env.VITE_RC_IOS_KEY
      : platform === 'android'
        ? import.meta.env.VITE_RC_ANDROID_KEY
        : undefined;
  if (apiKey) {
    void initRC({ apiKey });
  } else {
    console.warn('[main] No RC API key for platform', platform);
  }
}
```

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/main.tsx apps/web/.env.example
git commit -m "feat(web): initialize RevenueCat on native boot

Reads VITE_RC_IOS_KEY / VITE_RC_ANDROID_KEY env. No-op on web (purchases.ts
gates by Capacitor.isNativePlatform)."
```

---

### Task 5.3: Update `useSubscription` hook

**Files:**
- Modify: `apps/web/src/hooks/useSubscription.ts`

The hook currently fetches subscription state from `/api/subscription/status`. On native, prefer RC's customerInfo as the source of truth, but keep backend-fetched credit count.

**Step 1: Add a native branch**

```ts
import { Capacitor } from '@capacitor/core';
import { getCustomerInfo } from '../lib/purchases';

// Inside the hook's data-fetch effect:
async function refresh() {
  if (Capacitor.isNativePlatform()) {
    const info = await getCustomerInfo();
    // Reconcile: entitlement from RC, credit count from backend
    const isActive = !!info?.entitlements.active['tributes'];
    const backend = await fetchBackendStatus();
    setSnapshot({
      ...backend,
      isActive: isActive || backend.isActive, // either source can confirm
    });
    return;
  }
  // ... existing web-only logic
}
```

**Step 2: Typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useSubscription.ts
git commit -m "feat(web): useSubscription reconciles RC + backend on native

On native, RC.getCustomerInfo() is consulted alongside the existing
/api/subscription/status fetch. Either source can flip isActive=true."
```

---

### Task 5.4: PaywallScreen native branch

**Files:**
- Modify: `apps/web/src/screens/PaywallScreen.tsx`

**Step 1: Locate `handlePurchase`** (currently at line ~60).

**Step 2: Add native branch**

```tsx
import { Capacitor } from '@capacitor/core';
import { getOfferings, purchasePackage } from '../lib/purchases';
// ...
async function handlePurchase() {
  if (!selected) return;
  if (selected === 'free') {
    pop();
    return;
  }
  setPurchaseError(null);
  try {
    if (Capacitor.isNativePlatform()) {
      const offerings = await getOfferings();
      const pkg = offerings?.current?.availablePackages.find(
        (p: any) => p.product.identifier === productIdFor(selected),
      );
      if (!pkg) {
        setPurchaseError('Product not found in offerings — try again later');
        return;
      }
      await purchasePackage(pkg);
      await refetchSubscription();
      pop();
      return;
    }
    // ... existing Stripe path
  } catch (err) {
    // ... existing error handling
  }
}
```

Add a small `productIdFor()` helper at the bottom of the file (or in `purchases.ts`):

```ts
function productIdFor(planId: SubscriptionPlanId): string {
  switch (planId) {
    case 'keepsake_monthly': return 'haloframe_keepsake_monthly';
    case 'heritage_monthly': return 'haloframe_heritage_monthly';
    case 'heritage_annual': return 'haloframe_heritage_annual';
    case 'topup_4pack': return 'haloframe_topup_4pack';
    case 'topup_single': return 'haloframe_topup_single';
    default: throw new Error(`unknown plan ${planId}`);
  }
}
```

**Step 3: Typecheck + smoke**

```bash
npm run typecheck
```

Manual web smoke: still launches Stripe path. Native smoke deferred to TestFlight Internal in Day 12.

**Step 4: Commit**

```bash
git add apps/web/src/screens/PaywallScreen.tsx
git commit -m "feat(web): PaywallScreen routes purchases through RC on native

On Capacitor.isNativePlatform(), maps planId → RC product identifier
and calls purchasePackage. Web retains the existing Stripe checkout."
```

---

### Task 5.5: Restore Purchases button in Settings

**Files:**
- Modify: `apps/web/src/screens/SettingsScreen.tsx`

**Step 1: Add the button — native-only**

```tsx
import { Capacitor } from '@capacitor/core';
import { restorePurchases } from '../lib/purchases';

// Inside the component:
const [restoring, setRestoring] = useState(false);
const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

async function handleRestore() {
  setRestoring(true);
  try {
    const info = await restorePurchases();
    setRestoreMsg(
      info?.entitlements.active['tributes']
        ? 'Subscription restored.'
        : 'No active subscription found.',
    );
  } catch (err) {
    setRestoreMsg(err instanceof Error ? err.message : 'Restore failed.');
  } finally {
    setRestoring(false);
  }
}

// In the JSX, native-only block:
{Capacitor.isNativePlatform() && (
  <section className="mt-6">
    <button
      type="button"
      onClick={handleRestore}
      disabled={restoring}
      className="w-full rounded-full border border-stone-300 py-3 text-sm"
    >
      {restoring ? 'Restoring…' : 'Restore Purchases'}
    </button>
    {restoreMsg && <p className="mt-2 text-sm text-stone-600">{restoreMsg}</p>}
    <a
      href="https://apps.apple.com/account/subscriptions"
      target="_blank"
      rel="noreferrer"
      className="mt-3 block text-center text-sm text-stone-500 underline"
    >
      Manage subscription
    </a>
  </section>
)}
```

**Step 2: Typecheck**

```bash
npm run typecheck
```

**Step 3: Commit**

```bash
git add apps/web/src/screens/SettingsScreen.tsx
git commit -m "feat(web): Restore Purchases + Manage Subscription in Settings

Apple-required UI for IAP. Native-only block — web users use Stripe
customer portal which is unchanged."
```

---

## Phase 6 — Native photo picker (Day 5)

**Goal:** Replace `<input type=file>` with Capacitor `Camera.pickImages()` on native, satisfying Apple 5.1.1(iii) (out-of-process picker).

### Task 6.1: `photoPicker.ts` — TDD

**Files:**
- Create: `apps/web/src/lib/photoPicker.ts`
- Create: `apps/web/src/lib/photoPicker.test.ts`

**Step 1: Test (mock Capacitor + fall back to web)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativeMock = vi.fn(() => false);
const pickImagesMock = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativeMock },
}));
vi.mock('@capacitor/camera', () => ({
  Camera: { pickImages: pickImagesMock },
}));

beforeEach(() => {
  isNativeMock.mockReset().mockReturnValue(false);
  pickImagesMock.mockReset();
});

describe('pickPhoto', () => {
  it('uses native picker on iOS/Android', async () => {
    isNativeMock.mockReturnValue(true);
    pickImagesMock.mockResolvedValue({
      photos: [{ webPath: 'http://localhost/blob:1234', format: 'jpeg' }],
    });
    const { pickPhoto } = await import('./photoPicker');
    const result = await pickPhoto();
    expect(pickImagesMock).toHaveBeenCalled();
    expect(result?.url).toContain('blob:');
  });

  it('uses input[type=file] on web', async () => {
    const { pickPhoto } = await import('./photoPicker');
    // We can't fully simulate the file dialog; just confirm it doesn't call native.
    const promise = pickPhoto();
    // Expect the promise to be pending (waits on user interaction)
    expect(pickImagesMock).not.toHaveBeenCalled();
    // Cancel by resolving via document.body click — left intentionally untested
    // here; the core branch logic is covered.
  });
});
```

**Step 2: Implement**

`apps/web/src/lib/photoPicker.ts`:

```ts
import { Capacitor } from '@capacitor/core';

export interface PickedPhoto {
  url: string;
  blob?: Blob;
  format?: string;
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.pickImages({ limit: 1, quality: 90 });
    const photo = result.photos[0];
    if (!photo) return null;
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    return { url: photo.webPath, blob, format: photo.format };
  }

  // Web: programmatic <input type=file>
  return new Promise<PickedPhoto | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      resolve({ url, blob: file, format: file.type });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
```

**Step 3-5: Verify + commit**

```bash
npm --workspace=@haloframe/web run test:unit -- photoPicker
git add apps/web/src/lib/photoPicker.ts apps/web/src/lib/photoPicker.test.ts
git commit -m "feat(web): pickPhoto wrapper — Capacitor Camera on native

Uses @capacitor/camera Camera.pickImages on iOS/Android (out-of-process
picker per Apple 5.1.1(iii)); programmatic input[type=file] on web."
```

---

### Task 6.2 + 6.3: Wire to Enhance + Reunite flows

**Files:**
- Modify: `apps/web/src/screens/EnhanceFlow.tsx`
- Modify: `apps/web/src/screens/ReuniteFlow.tsx`

For each flow, replace the existing file-input handling with `pickPhoto()`. Keep the consent gate from Phase 2 wrapping it.

**Step 1: Read current upload entry point** (Task 2.4 located it for Reunite; Enhance has the same pattern).

**Step 2: Replace**

```tsx
// Before:
<input type="file" accept="image/*" onChange={handleFileChange} />

// After:
import { pickPhoto } from '../lib/photoPicker';
// ...
async function openPicker() {
  if (!hasConsented) { /* trigger consent modal — existing path */ return; }
  const photo = await pickPhoto();
  if (photo?.blob) await handlePickFile(new File([photo.blob], 'upload.jpg'));
}
// JSX:
<button onClick={openPicker}>Choose a photo</button>
```

**Step 3: Smoke** — web should still open the system picker; native test deferred to TestFlight Internal.

**Step 4: Commit**

```bash
git add apps/web/src/screens/EnhanceFlow.tsx apps/web/src/screens/ReuniteFlow.tsx
git commit -m "feat(web): use pickPhoto in Enhance + Reunite flows

Replaces raw <input type=file> with the platform-aware wrapper.
Native shells now use the iOS/Android out-of-process picker; web
behavior unchanged."
```

---

## Phase 7 — Public legal hosting (Day 2)

**Goal:** Render the Privacy/Terms content from `LegalScreen.tsx` to static HTML at `apps/web/public/privacy.html`, `terms.html`, `support.html` so they are served at `https://haloframe.app/privacy`, `/terms`, `/support`.

### Task 7.1: `scripts/build-legal.mjs` — TDD-lite

**Files:**
- Create: `scripts/build-legal.mjs`
- Create: `scripts/build-legal.test.mjs` (light integration test)

**Step 1: Read LegalScreen.tsx to understand the content shape**

```bash
grep -n "PRIVACY\|TERMS\|export const" apps/web/src/screens/LegalScreen.tsx | head
```

(Confirm the content lives as exported arrays you can import in Node.)

**Step 2: Light test**

`scripts/build-legal.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';

test('build-legal generates privacy + terms + support HTML', () => {
  rmSync('apps/web/public/privacy.html', { force: true });
  rmSync('apps/web/public/terms.html', { force: true });
  rmSync('apps/web/public/support.html', { force: true });

  const result = spawnSync('node', ['scripts/build-legal.mjs'], { stdio: 'pipe' });
  assert.strictEqual(result.status, 0, result.stderr.toString());

  for (const f of ['privacy.html', 'terms.html', 'support.html']) {
    assert.ok(existsSync(`apps/web/public/${f}`), `${f} missing`);
    const html = readFileSync(`apps/web/public/${f}`, 'utf8');
    assert.match(html, /<html/);
    assert.match(html, /<title>/);
  }
});

test('privacy mentions fal.ai', () => {
  const html = readFileSync('apps/web/public/privacy.html', 'utf8');
  assert.match(html, /fal\.ai/i);
});
```

**Step 3: Run, verify fail**

```bash
node --test scripts/build-legal.test.mjs
```

**Step 4: Implement script**

`scripts/build-legal.mjs`:

```js
#!/usr/bin/env node
// Render Privacy + Terms + Support pages from LegalScreen content arrays
// to static HTML in apps/web/public/. Run as a prebuild step.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = resolve('apps/web/src/screens/LegalScreen.tsx');
const OUT_DIR = resolve('apps/web/public');

// We extract via simple regex rather than build LegalScreen with TypeScript —
// keeps the script zero-dep and Vercel-prebuild-friendly.
const src = readFileSync(SOURCE, 'utf8');

function extractArray(name) {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`, 'm'));
  if (!m) throw new Error(`could not find export const ${name}`);
  // Crude: parse with eval inside a sandbox-ish wrapper. Acceptable for build-time.
  return Function(`"use strict"; return [${m[1]}]`)();
}

const PRIVACY = extractArray('PRIVACY_SECTIONS');
const TERMS = extractArray('TERMS_SECTIONS');

function htmlShell(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · haloFrame</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1f1d18; line-height: 1.6; }
  h1 { font-family: Georgia, serif; font-size: 2rem; }
  h2 { font-family: Georgia, serif; font-size: 1.4rem; margin-top: 2rem; }
  a { color: #5a4a2c; }
  p { margin: 1rem 0; }
  footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #e5e1d6; color: #7a6f5a; font-size: 0.9rem; }
</style>
</head>
<body>
<h1>${title}</h1>
${bodyHtml}
<footer>
  <p><a href="/">← Back to haloFrame</a></p>
</footer>
</body>
</html>`;
}

function sectionsToHtml(sections) {
  return sections
    .map((s) => `<h2>${s.heading}</h2>${s.body.map((p) => `<p>${p}</p>`).join('\n')}`)
    .join('\n');
}

writeFileSync(
  `${OUT_DIR}/privacy.html`,
  htmlShell('Privacy Policy', sectionsToHtml(PRIVACY)),
);
writeFileSync(
  `${OUT_DIR}/terms.html`,
  htmlShell('Terms of Service', sectionsToHtml(TERMS)),
);
writeFileSync(
  `${OUT_DIR}/support.html`,
  htmlShell(
    'Support',
    `<p>Need help? Email <a href="mailto:support@haloframe.app">support@haloframe.app</a> — we reply within 24 hours.</p>
     <h2>Frequently asked</h2>
     <p><strong>How do I delete my account?</strong> Open Settings → Delete Account in the app. We remove all your photos and data within 30 days.</p>
     <p><strong>How do I cancel my subscription?</strong> iOS / Android: open the App Store / Play Store → Subscriptions → haloFrame → Cancel. Web: contact support.</p>
     <p><strong>How is my photo data used?</strong> See the <a href="/privacy">Privacy Policy</a>. Briefly: photos are sent to fal.ai for AI processing only, never used to train models, never shared.</p>`,
  ),
);

console.log('[build-legal] wrote privacy.html, terms.html, support.html');
```

**Step 5: Run + verify**

```bash
node scripts/build-legal.mjs
node --test scripts/build-legal.test.mjs
```

Expected: tests pass; three HTML files in `apps/web/public/`.

**Step 6: Commit**

```bash
git add scripts/build-legal.mjs scripts/build-legal.test.mjs apps/web/public/privacy.html apps/web/public/terms.html apps/web/public/support.html
git commit -m "feat(scripts): build-legal.mjs renders privacy/terms/support to public HTML

Extracts PRIVACY_SECTIONS + TERMS_SECTIONS from LegalScreen.tsx and
writes apps/web/public/{privacy,terms,support}.html. Vercel will serve
these at haloframe.app/{privacy,terms,support}."
```

---

### Task 7.2: Wire as Vite prebuild

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Update build script**

```json
"build": "node ../../scripts/build-legal.mjs && tsc -b && vite build"
```

(Path adjusts for the workspace structure; verify the relative path from `apps/web/` works.)

**Step 2: Smoke**

```bash
npm --workspace=@haloframe/web run build
```

Expected: HTML files regenerated, then Vite build succeeds.

**Step 3: Commit**

```bash
git add apps/web/package.json
git commit -m "build(web): run build-legal as prebuild step

Ensures privacy.html / terms.html / support.html are in sync with
LegalScreen.tsx on every deploy."
```

---

### Task 7.3: Aqil placeholder fills + 2026 store-policy clauses

**Files:**
- Modify: `apps/web/src/screens/LegalScreen.tsx`

**Step 1: Confirm Aqil supplied:**
- `{{COMPANY_LEGAL_NAME}}`
- `{{CONTACT_EMAIL}}` = `support@haloframe.app`
- `{{JURISDICTION}}`

**Step 2: Find + replace** the placeholders in `LegalScreen.tsx`. Run:

```bash
grep -n "{{" apps/web/src/screens/LegalScreen.tsx
```

Replace each match with the Aqil-supplied value.

**Step 3: Add 2026 store-policy clauses** per design doc §8.2:

In Privacy section, add a paragraph naming fal.ai explicitly:

> "Photos you upload are sent to **fal.ai** (https://fal.ai), our AI processing partner, to generate composite portraits. Photos are encrypted in transit, processed once, and not used to train AI models. fal.ai's privacy policy: https://fal.ai/privacy."

Add 30-day deletion SLA, GDPR Art. 15/17, CCPA §1798.100/.105, and the processor list (Supabase, fal.ai, Stripe, Resend, Vercel, Railway, RevenueCat, Sentry).

In Terms section, add:
- Auto-renewal disclosure with Apple-required wording
- Acceptable-use prohibitions on deepfakes-of-others / sexually explicit / defamatory
- AI accuracy disclaimer
- User content license grant (non-exclusive, royalty-free, only for processing)
- Arbitration clause (binding, individual, in Aqil's jurisdiction)

**Step 4: Regenerate HTML**

```bash
node scripts/build-legal.mjs
```

**Step 5: Visual smoke** — open `apps/web/public/privacy.html` in a browser. Confirm fal.ai, deletion SLA, GDPR/CCPA mentions all visible.

**Step 6: Commit**

```bash
git add apps/web/src/screens/LegalScreen.tsx apps/web/public/privacy.html apps/web/public/terms.html
git commit -m "fix(legal): fill placeholders + add 2026 store-policy clauses

- {{COMPANY_LEGAL_NAME}}, {{CONTACT_EMAIL}}, {{JURISDICTION}} resolved
- fal.ai named explicitly (Apple 5.1.2(i))
- 30-day deletion SLA
- GDPR Art. 15/17 + CCPA §1798.100/.105
- Auto-renewal disclosure (Apple)
- Deepfake / sexual / defamatory prohibitions
- AI-accuracy disclaimer
- Processor list (8 named processors)
- Arbitration clause"
```

---

## Phase 8 — Capacitor native scaffolds (Day 8-9)

**Goal:** Run `npx cap add ios` and `npx cap add android` from Windows, edit native config files, generate icon/splash assets. The first iOS archive then happens on Codemagic in Phase 9.

> ⚠ `npx cap add ios` on Windows: scaffolds the directory tree fine; you cannot pod install or open Xcode. That's intentional — Codemagic does it remotely.

### Task 8.1: `npx cap add ios`

**Files:**
- Create: `apps/web/ios/` (entire directory tree, ~2000 generated files)

**Step 1: Run from `apps/web/`**

```bash
cd apps/web
npx cap add ios
cd ../..
```

Expected: a new `apps/web/ios/App/` directory tree.

**Step 2: Add a `.gitignore` exemption** for the parts we DO want tracked

`apps/web/ios/.gitignore`:

```
# Capacitor's default ignores Xcode-private bits but keeps project files.
# Verified by: cat apps/web/ios/.gitignore after cap add
# We retain the default; add nothing.
```

(Skip if `cap add` already created one.)

**Step 3: Commit the entire scaffold**

```bash
git add apps/web/ios
git commit -m "feat(ios): scaffold Capacitor iOS project

Generated by 'npx cap add ios'. Codemagic builds from this on archive."
```

---

### Task 8.2: `npx cap add android`

**Files:**
- Create: `apps/web/android/` (entire directory tree, ~1500 generated files)

```bash
cd apps/web
npx cap add android
cd ../..
git add apps/web/android
git commit -m "feat(android): scaffold Capacitor Android project

Generated by 'npx cap add android'. Local gradlew bundleRelease will
build AAB for Play Console upload."
```

---

### Task 8.3: Edit `Info.plist`

**Files:**
- Modify: `apps/web/ios/App/App/Info.plist`

**Step 1: Add required keys**

Inside the `<dict>`:

```xml
<key>CFBundleDisplayName</key>
<string>haloFrame</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>haloFrame needs access to your Photos so you can choose pictures of your loved ones to bring together in a memorial portrait.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>haloFrame would like to save your finished tributes to Photos.</string>

<key>NSCameraUsageDescription</key>
<string>haloFrame uses the camera to scan family photos when you'd rather snap them in than upload from Photos.</string>

<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

**Step 2: Commit**

```bash
git add apps/web/ios/App/App/Info.plist
git commit -m "feat(ios): Info.plist usage descriptions + bundle display name

NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription,
NSCameraUsageDescription, CFBundleDisplayName=haloFrame, encryption
exemption flag."
```

---

### Task 8.4: Edit `AndroidManifest.xml`

**Files:**
- Modify: `apps/web/android/app/src/main/AndroidManifest.xml`

**Step 1: Add permissions inside `<manifest>` (above `<application>`)**

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
```

**Step 2: Set the app label inside `<application>`**

```xml
android:label="haloFrame"
```

**Step 3: Commit**

```bash
git add apps/web/android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): manifest permissions + app label

INTERNET + READ_MEDIA_IMAGES (Android 13+) + legacy READ_EXTERNAL_STORAGE.
android:label=haloFrame."
```

---

### Task 8.5: `capacitor.config.ts` updates

**Files:**
- Modify: `apps/web/capacitor.config.ts`

**Step 1: Add Camera plugin config + tighten Splash**

```ts
plugins: {
  SplashScreen: {
    launchShowDuration: 800,           // was 1200 — feels snappier
    launchAutoHide: true,
    backgroundColor: '#FAF3E2',
    androidSplashResourceName: 'splash',
    splashFullScreen: true,
    splashImmersive: true,
  },
  CapacitorHttp: { enabled: true },
  Camera: {
    allowEditing: false,
    presentationStyle: 'popover',
    resultType: 'uri',
  },
},
```

**Step 2: Sync to native**

```bash
cd apps/web && npx cap sync && cd ../..
```

**Step 3: Commit**

```bash
git add apps/web/capacitor.config.ts
# cap sync touches generated files — review before adding
git status
git add apps/web/ios apps/web/android  # if any plugin config files updated
git commit -m "chore(cap): Camera plugin config + Splash tightening

allowEditing=false + presentationStyle=popover for Camera. Splash
launchShowDuration 1200→800."
```

---

### Task 8.6: Generate icon + splash assets

**Files:**
- Create: `apps/web/resources/icon.png` (1024×1024)
- Create: `apps/web/resources/splash.png` (2732×2732)
- (Generated trees) `apps/web/ios/.../Assets.xcassets/`, `apps/web/android/.../mipmap*/`

**Step 1: Get the source assets**

If Aqil hasn't shipped V1 yet, use placeholders:
- `icon.png`: 1024×1024 warm beige `#FAF3E2`, gold halo ring `#C9A971`
- `splash.png`: 2732×2732 same palette, centered ornament

Quick generation via ImageMagick (Bash):

```bash
mkdir -p apps/web/resources
convert -size 1024x1024 xc:'#FAF3E2' \
  -fill '#C9A971' -draw 'circle 512,512 512,200' \
  apps/web/resources/icon.png

convert -size 2732x2732 xc:'#FAF3E2' \
  -fill '#C9A971' -draw 'circle 1366,1366 1366,800' \
  apps/web/resources/splash.png
```

**Step 2: Run the asset generator**

```bash
npm --workspace=@haloframe/web run assets:gen
```

Expected: populates iOS `Assets.xcassets` + Android `res/mipmap-*` + `res/drawable-*`.

**Step 3: Verify**

```bash
ls apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset/
ls apps/web/android/app/src/main/res/mipmap-hdpi/
```

Both should have multiple sized PNGs.

**Step 4: Commit**

```bash
git add apps/web/resources apps/web/ios apps/web/android
git commit -m "feat(assets): generate icon + splash for iOS + Android

V1 placeholder warm-beige + gold-halo-ring. Aqil iterates Day 7+ via
@capacitor/assets pipeline."
```

---

## Phase 9 — Codemagic iOS CI (Day 9-10)

**Goal:** Land `codemagic.yaml` so tag pushes (`v1.0.0-rc*`) trigger an iOS archive + TestFlight upload, all without a Mac.

### Task 9.1: `codemagic.yaml`

**Files:**
- Create: `codemagic.yaml`

**Step 1: Author the workflow**

```yaml
workflows:
  ios-testflight:
    name: iOS · TestFlight
    instance_type: mac_mini_m2
    max_build_duration: 60
    integrations:
      app_store_connect: haloframe_asc

    environment:
      groups:
        - haloframe_secrets   # APP_STORE_CONNECT_KEY_IDENTIFIER, _ISSUER_ID, _PRIVATE_KEY, APPLE_TEAM_ID
      vars:
        BUNDLE_ID: com.haloframe.app
        XCODE_WORKSPACE: apps/web/ios/App/App.xcworkspace
        XCODE_SCHEME: App
      node: 20
      xcode: latest
      cocoapods: default

    triggering:
      events: [tag]
      tag_patterns:
        - pattern: 'v*'
          include: true

    scripts:
      - name: Install root deps
        script: npm ci
      - name: Build web bundle
        script: npm --workspace=@haloframe/web run build
      - name: Capacitor sync
        script: |
          cd apps/web
          npx cap sync ios
      - name: Pod install
        script: |
          cd apps/web/ios/App
          pod install
      - name: Set Xcode build version
        script: |
          cd apps/web/ios/App
          agvtool new-version -all $BUILD_NUMBER
          agvtool new-marketing-version $(echo $CM_TAG | sed 's/^v//' | sed 's/-rc.*//')
      - name: Use App Store Connect API key for signing
        script: keychain initialize
      - name: Fetch signing files
        script: |
          app-store-connect fetch-signing-files $BUNDLE_ID \
            --type IOS_APP_STORE \
            --create
      - name: Add certs to keychain
        script: keychain add-certificates
      - name: Set up code signing
        script: xcode-project use-profiles
      - name: Build .ipa
        script: |
          xcode-project build-ipa \
            --workspace "$XCODE_WORKSPACE" \
            --scheme "$XCODE_SCHEME"

    artifacts:
      - build/ios/ipa/*.ipa
      - $HOME/Library/Developer/Xcode/DerivedData/**/Build/**/*.app
      - $HOME/Library/Developer/Xcode/DerivedData/**/Build/**/*.dSYM

    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
        beta_groups:
          - external testers
```

**Step 2: Smoke-validate the YAML**

```bash
# If you have codemagic CLI installed:
codemagic-cli-tools workflow validate codemagic.yaml
# Or just YAML-lint:
python -c "import yaml; yaml.safe_load(open('codemagic.yaml'))"
```

**Step 3: Commit**

```bash
git add codemagic.yaml
git commit -m "ci: codemagic.yaml for iOS TestFlight via tag push

Tag-triggered (v*) workflow runs npm ci, vite build, cap sync, pod
install, xcode-project build-ipa, then publishes to TestFlight via
ASC integration. No-Mac path."
```

---

### Task 9.2: `.codemagic/secrets.md`

**Files:**
- Create: `.codemagic/secrets.md`

**Step 1: Document the secrets**

```markdown
# Codemagic secrets — haloFrame

Set in Codemagic dashboard → Project → Environment variables → groups.

## haloframe_secrets (encrypted)

| Var | Source | Notes |
|---|---|---|
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | ASC → Users and Access → Keys | The "Key ID" string |
| `APP_STORE_CONNECT_ISSUER_ID` | ASC → Users and Access → Keys (top of page) | UUID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | The .p8 file Apple gave you when you created the key | Paste full contents including BEGIN/END markers |
| `APPLE_TEAM_ID` | Apple Developer → Membership → Team ID | 10-char string |

## App Store Connect Integration

In Codemagic → Teams → Integrations → App Store Connect:
- Name: `haloframe_asc`
- Issuer ID: same as `APP_STORE_CONNECT_ISSUER_ID`
- Key ID: same as `APP_STORE_CONNECT_KEY_IDENTIFIER`
- Private key: upload the .p8 file directly here
- This is what `app_store_connect: haloframe_asc` in codemagic.yaml refers to.

## First-run checklist

1. Push a tag: `git tag v1.0.0-rc1 && git push origin v1.0.0-rc1`
2. Codemagic auto-starts the iOS workflow
3. ~12-15 min: build completes, IPA uploaded to TestFlight
4. ~5-10 min: TestFlight processes the build, becomes available to internal group
5. Submit for external review (manual step in App Store Connect)
```

**Step 2: Commit**

```bash
git add .codemagic/secrets.md
git commit -m "docs(ci): document Codemagic secrets + first-run checklist"
```

---

## Phase 10 — Demo account seeder (Day 5)

**Goal:** Idempotent script that creates `reviewer@haloframe.app` with 4 sample portrait photos, for App Review Information demo credentials.

### Task 10.1: `scripts/seed-reviewer-account.mjs`

**Files:**
- Create: `scripts/seed-reviewer-account.mjs`
- Add: `scripts/fixtures/reviewer-photos/{01..04}.jpg` (sample images, royalty-free)

**Step 1: Acquire 4 sample portrait photos**

Use the 4 sample images already in `apps/web/public/templates/` (or similar) — those are royalty-free thumbnails Aqil has already cleared. Or use a public domain set (Unsplash CC0).

```bash
mkdir -p scripts/fixtures/reviewer-photos
# Copy 4 known-cleared portraits into this directory
```

**Step 2: Author the script**

```js
#!/usr/bin/env node
// Idempotent reviewer-account seeder. Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   REVIEWER_PASSWORD='...' node scripts/seed-reviewer-account.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REVIEWER_PASSWORD'];
for (const v of REQUIRED) {
  if (!process.env[v]) throw new Error(`Missing ${v}`);
}

const REVIEWER_EMAIL = 'reviewer@haloframe.app';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function ensureUser() {
  const { data: list } = await supa.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === REVIEWER_EMAIL);
  if (existing) {
    console.log('[seed] reviewer exists:', existing.id);
    return existing;
  }
  const { data, error } = await supa.auth.admin.createUser({
    email: REVIEWER_EMAIL,
    password: process.env.REVIEWER_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log('[seed] created reviewer:', data.user.id);
  return data.user;
}

async function ensureCredits(userId) {
  const { error } = await supa.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: 20,
    p_source: 'manual_seed',
    p_external_id: `reviewer-seed-${new Date().toISOString().slice(0, 10)}`,
    p_expires_in_days: 365,
  });
  if (error) throw error;
  console.log('[seed] granted 20 credits');
}

async function ensurePhotos(userId) {
  const photos = [1, 2, 3, 4].map((n) => ({
    name: `${n}.jpg`,
    buf: readFileSync(resolve(`scripts/fixtures/reviewer-photos/0${n}.jpg`)),
  }));
  for (const p of photos) {
    const path = `${userId}/seed/${p.name}`;
    const { error } = await supa.storage
      .from('uploads')
      .upload(path, p.buf, { contentType: 'image/jpeg', upsert: true });
    if (error && !String(error.message).includes('already exists')) throw error;
  }
  console.log('[seed] uploaded 4 sample photos');
}

async function main() {
  const user = await ensureUser();
  await ensureCredits(user.id);
  await ensurePhotos(user.id);
  console.log('\nReviewer account ready:');
  console.log(`  email:    ${REVIEWER_EMAIL}`);
  console.log(`  password: (from REVIEWER_PASSWORD env)`);
  console.log('  credits:  20 (1-year expiry)');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
```

**Step 3: Smoke-test against a dev DB**

```bash
SUPABASE_URL="$DEV_URL" SUPABASE_SERVICE_ROLE_KEY="$DEV_KEY" \
  REVIEWER_PASSWORD='Test-1234-haloframe-reviewer' \
  node scripts/seed-reviewer-account.mjs
```

Expected: prints "Reviewer account ready" with the email + credit count.

**Step 4: Run it twice** to confirm idempotency. Second run should print "reviewer exists" and not error.

**Step 5: Commit**

```bash
git add scripts/seed-reviewer-account.mjs scripts/fixtures/reviewer-photos
git commit -m "feat(scripts): seed-reviewer-account.mjs for App Review

Idempotent. Creates reviewer@haloframe.app with 20 credits + 4 sample
portrait photos. Used to populate ASC App Access fields + Play Console
reviewer credentials."
```

---

## Phase 11 — Documentation (Days 6-11)

**Goal:** Author the three new doc files + update DEPLOY + MORNING_CHECKLIST. Most of this is straight prose extracted from the design doc + research.

### Task 11.1: `docs/STORE_LISTINGS.md`

**Files:**
- Create: `docs/STORE_LISTINGS.md`

**Step 1: Author** with sections for both stores. Source content from design doc §8.4 + §8.5 and research §1.5 + §6.3.

Sections:
- App Store Connect listing
  - Name, subtitle, category
  - Description (4000 char)
  - Promotional text (170 char)
  - Keywords (100 char)
  - Support URL
  - Privacy Policy URL
  - Age rating answers
- Play Console listing
  - Title (50 char)
  - Short description (80 char)
  - Full description (4000 char)
  - Data Safety form answers
  - Content rating answers
  - Target audience
- Subscription product display names + descriptions (5 products × 2 stores = 10 entries)
- App Review Information / "How to Test" notes (mirror of REVIEWER_NOTES.md, but in store-listing context)

Length target: ~1500-2000 lines of structured markdown.

**Step 2: Commit**

```bash
git add docs/STORE_LISTINGS.md
git commit -m "docs: STORE_LISTINGS.md — full App Store + Play Console copy

Title, subtitle, descriptions, keywords, age rating answers, demo
account, review notes, Data Safety form, IAP product copy."
```

---

### Task 11.2: `docs/REVIEWER_NOTES.md`

**Files:**
- Create: `docs/REVIEWER_NOTES.md`

**Step 1: Author** the exact text Aqil pastes into App Review Information. Source from research §6.2.

Should cover:
- Demo account credentials (refer to env, never commit literal password)
- Native integration list (Camera, Haptics, Share, Restore Purchases)
- AI processing summary (fal.ai, encrypted, no training, deletable)
- Subscription overview
- Why memorial AI is appropriate (cite MyHeritage Deep Nostalgia precedent)
- AI safety surface description (consent modal, watermark, badge, reporting)
- Account deletion flow (in-app + web endpoint)
- OTA update policy (assets/JS only, no native code changes)

**Step 2: Commit**

```bash
git add docs/REVIEWER_NOTES.md
git commit -m "docs: REVIEWER_NOTES.md — App Review Information copy

Exact text for ASC App Review Information field + Play Console review
notes. Demo credentials reference, AI safety surface, OTA policy."
```

---

### Task 11.3: `docs/BETA_RECRUITMENT.md`

**Files:**
- Create: `docs/BETA_RECRUITMENT.md`

**Step 1: Author** the recruitment kit from design doc §8.8.

Sections:
- DM template (300-400 chars, friendly, names the value)
- Where to recruit (family chats, friends, r/genealogy, Facebook memorial groups, Discord)
- Incentive: lifetime Heritage tier
- Recruitment math (15-18 → target 12 active in 14d)
- Reminder DMs at Day 5 + Day 10 (templates included)
- "What to do when a tester replies yes" (Play Console invite flow)
- "What to do when fewer than 12 are active by Day 10" (escalation playbook)

**Step 2: Commit**

```bash
git add docs/BETA_RECRUITMENT.md
git commit -m "docs: BETA_RECRUITMENT.md — Google Closed Testing tester kit

DM templates, channels, incentive, escalation playbook for the 14-day
Closed Testing window."
```

---

### Task 11.4: Update `docs/DEPLOY.md` §4

**Files:**
- Modify: `docs/DEPLOY.md`

**Step 1: Locate §4** (currently a "later" placeholder).

**Step 2: Replace with the Codemagic walkthrough**

Sections:
- Prerequisites (Apple Developer account, ASC API key, Codemagic free tier)
- Step-by-step: connect repo, paste codemagic.yaml, encrypt secrets
- First trigger: tag push `v1.0.0-rc1` → archive → TestFlight
- Android local build (gradlew bundleRelease) → upload to Play Console Internal
- Promotion: Internal → Closed Testing → Production
- Troubleshooting common issues (signing, pods, version-bump conflicts)

Cross-link `.codemagic/secrets.md` for the exact env-var setup.

**Step 3: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): expand §4 — Codemagic + Play Console walkthrough

Replaces 'later' placeholder with complete iOS no-Mac flow + Android
local build flow + promotion path."
```

---

### Task 11.5: Update `docs/MORNING_CHECKLIST.md`

**Files:**
- Modify: `docs/MORNING_CHECKLIST.md`

**Step 1: Add a new section** at the bottom: "12. App-store launch — what's left for Aqil"

Cover:
- Apply migration `20260425000001_app_store_compliance.sql` to prod (link Phase 1)
- Set env vars on Vercel (`VITE_RC_IOS_KEY`, `VITE_RC_ANDROID_KEY`)
- Set env vars on Railway (none new at the API level — `WATERMARK_DISABLED` only used in tests)
- Run `seed-reviewer-account.mjs` against prod once
- Commit Phase 8 `cap add ios` / `cap add android` outputs (already done in this branch)
- Submit Day 14 — TestFlight + Play Closed Testing

**Step 2: Commit**

```bash
git add docs/MORNING_CHECKLIST.md
git commit -m "docs: MORNING_CHECKLIST §12 — app-store launch manual steps

Lists Aqil-only actions: prod DB migration, Vercel env vars, reviewer
seed run, Day 14 dual-submit."
```

---

## Phase 12 — E2E + release candidate (Days 13-14)

**Goal:** Land the Playwright E2E for consent gating, run the full verification sweep, tag `v1.0.0-rc1` to fire the Codemagic build.

### Task 12.1: Playwright E2E for consent gating

**Files:**
- Create: `apps/web/tests/e2e/consent.spec.ts`

**Step 1: Author**

```ts
import { test, expect } from '@playwright/test';

test.describe('AI consent gating', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.addInitScript(() => localStorage.clear());
  });

  test('first upload triggers the consent modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /enhance/i }).click();
    // Try to upload — modal should block
    await page.getByRole('button', { name: /choose a photo/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/fal\.ai/);
  });

  test('declining keeps the upload blocked', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /enhance/i }).click();
    await page.getByRole('button', { name: /choose a photo/i }).click();
    await page.getByRole('button', { name: /not now/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    // Modal closed; consent NOT recorded; reopening should re-show modal
    await page.getByRole('button', { name: /choose a photo/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('accepting persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /enhance/i }).click();
    await page.getByRole('button', { name: /choose a photo/i }).click();
    await page.getByRole('button', { name: /understand/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: /enhance/i }).click();
    await page.getByRole('button', { name: /choose a photo/i }).click();
    // Upload widget should NOT show modal again
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
```

**Step 2: Run** the suite

```bash
npm --workspace=@haloframe/web run test:e2e
```

Expected: all 3 new tests + existing home-loads spec pass.

**Step 3: Commit**

```bash
git add apps/web/tests/e2e/consent.spec.ts
git commit -m "test(e2e): consent gating end-to-end

Verifies first upload triggers modal, declining keeps it blocked,
accepting persists across reload."
```

---

### Task 12.2: Final verification sweep

**Files:**
- No new files. Just running.

**Step 1: Run the full suite**

```bash
npm run typecheck
npm --workspace=@haloframe/web run test:unit
npm --workspace=@haloframe/api run test
npm --workspace=@haloframe/web run test:e2e
node scripts/smoke-redesign.mjs
node scripts/build-legal.mjs   # confirm public HTML still generates
node scripts/seed-reviewer-account.mjs # only against dev — confirms idempotency
```

All seven must pass green. If anything is red, fix it. Do not tag while red.

**Step 2: Manual web smoke**

```bash
npm --workspace=@haloframe/web run dev
```

Manually verify:
- ✅ Open home, navigate to Enhance, try to upload — consent modal blocks
- ✅ Accept → upload proceeds, generates a tribute, AIBadge visible bottom-right
- ✅ Click Report → ReportContentSheet opens, can submit
- ✅ Open MyTributes lightbox → AIBadge visible
- ✅ Settings → no Restore button on web (correct — native-only)
- ✅ Visit `/privacy`, `/terms`, `/support` — public HTML loads, mentions fal.ai

**Step 3: No commit** — verification only.

---

### Task 12.3: Tag `v1.0.0-rc1`

**Files:**
- No file changes.

**Step 1: Confirm clean tree**

```bash
git status
```

Expected: clean.

**Step 2: Tag + push**

```bash
git tag -a v1.0.0-rc1 -m "Release candidate 1 — app-store launch dual-submit"
git push origin appstore-launch
git push origin v1.0.0-rc1
```

**Step 3: Verify Codemagic auto-trigger**

Watch the Codemagic dashboard for the new `ios-testflight` workflow run. Expected: archive completes in ~12-15 min, IPA uploaded to TestFlight, Apple processes (~5-10 min), build appears in TestFlight Internal group.

**Step 4: Aqil submits TestFlight external review** + uploads first AAB to Play Closed Testing on Day 14 per design doc §6.

The implementation plan ends here. Track A from the design doc covers everything else through Day 42.

---

## Track A — Manual prerequisites (Aqil-owned)

**These are NOT Claude tasks.** They are listed here so the implementation plan stays connected to the broader launch. Full detail lives in design doc §8.

| Day | Aqil action | Effort | Cost |
|---|---|---|---|
| 0 | Register `haloframe.app` (Cloudflare) | 30 min | $15 |
| 0 | Cloudflare Email Routing → Gmail | 10 min | $0 |
| 0 | Send 18 beta DMs (template in `docs/BETA_RECRUITMENT.md`) | 60 min | $0 |
| 1 | Apply DB migration `20260425000001_app_store_compliance.sql` to prod | 10 min | $0 |
| 1 | Supply `{{COMPANY_LEGAL_NAME}}` + `{{JURISDICTION}}` | 5 min | $0 |
| 1-2 | DNS records, SSL verification, support@haloframe.app reachable | 30 min | $0 |
| 4 | RevenueCat dashboard setup (project, apps, products, entitlement, offering, webhook) | 2h | $0 |
| 5 | App Store Connect setup (bundle ID, app, sub group, IAP products, ASC API key → RC) | 2-3h | $0 |
| 5 | Run `node scripts/seed-reviewer-account.mjs` against prod once | 5 min | $0 |
| 6 | Play Console setup (app, listing skeleton, IAP products, service account → RC) | 2-3h | $0 |
| 7 | App icon V1 + asset iteration | 2-4h | $0 (or $50 outsourced) |
| 8 | Confirm 12+ firm beta-tester yeses | 30 min | $0 |
| 9-10 | Codemagic.io account + connect repo + paste codemagic.yaml + encrypt secrets | 2h | $0 |
| 10-11 | Capture 5-7 screenshots (Pixel 7 AVD + Figma overlays) OR Fiverr | 4h or $50 | $0-$50 |
| 11 | App Privacy + Data Safety questionnaires | 90 min | $0 |
| 14 | 🔒 Submit TestFlight external review | 30 min | $0 |
| 14 | 🔒 Promote AAB Internal → Closed Testing + add 12 testers | 30 min | $0 |
| 28 | 🔒 Google production submit (after 14-day Closed Testing) | 30 min | $0 |
| 28-30 | 🔒 Apple App Store production submit (after TestFlight cleared) | 30 min | $0 |

Total Aqil effort: ~12-15 hours spread across the 5-6 weeks. Total spend: $15-65.

---

## Parallel execution map

If executing with **two concurrent agents** (one main, one subagent), this is the safe split:

```
Day 0  — Phase 0 (sequential, foundation)
Day 1  ┬─ Phase 1 (DB migration)         ┬─ Phase 5 (RC SDK) [Tasks 5.1, 5.2]
       └─ Phase 7 Task 7.1 (build-legal) ┘
Day 2  ┬─ Phase 2 (consent UX)           ─ Phase 5 [Tasks 5.3, 5.4, 5.5]
       └─ Phase 7 [Tasks 7.2, 7.3]
Day 3  ─ Phase 3 (badge + report)        ─ Phase 6 (photo picker)
Day 4  ─ Phase 4 (server side)
Day 5  ─ Phase 10 (seeder)
Day 6  ─ Phase 11 [Tasks 11.1, 11.2, 11.3]
Day 7  ─ Phase 11 [Tasks 11.4, 11.5]
Day 8  ─ Phase 8 [Tasks 8.1, 8.2, 8.3, 8.4]
Day 9  ─ Phase 8 [Tasks 8.5, 8.6] + Phase 9 (Codemagic)
Day 10 ─ Phase 9 + buffer
Day 11 ─ TestFlight Internal demo (manual)
Day 12 ─ Bug-fix window
Day 13 ─ Phase 12 [Tasks 12.1, 12.2]
Day 14 ─ Phase 12 Task 12.3 (tag + dual-submit)
```

**Cannot parallelize:**
- Phase 0 (foundation) → blocks everything
- Phase 1 (migration) → blocks Phase 2 + Phase 4 (server consent persistence)
- Phase 2 → blocks Phase 6 (consent gates the picker call)
- Phase 8 (cap add) → blocks Phase 9 (Codemagic builds from `apps/web/ios/`)

**Can parallelize:**
- Phase 5 (RC SDK) is fully disjoint from Phases 2-4 (different surfaces)
- Phase 7 (legal hosting script) is disjoint from Phases 2-4
- Phase 11 (docs) is disjoint from everything else after the relevant code phases land
- Phase 10 (seeder) is disjoint from everything

Use [@superpowers:dispatching-parallel-agents](skills/dispatching-parallel-agents) when fanning out.

---

## Definition of done

(From design doc §10.)

- ✅ App Store: "Ready for Sale" + downloadable from public US App Store search
- ✅ Play Store: "Published" + downloadable via direct link AND search (search indexing lags 2-3d)
- ✅ One real purchase from a non-tester flowed through RC webhook → backend → user got credits
- ✅ One real canvas-print order flowed through Stripe → email → fulfillment notification reached `ORDER_NOTIFICATION_EMAIL`
- ✅ Account deletion verified end-to-end on a non-test account
- ✅ No CRITICAL or HIGH Sentry issues open in launch-week dashboard
- ✅ Both stores' Reviews tabs being monitored

---

## Post-implementation checklist

After the last commit on `appstore-launch`:

1. ✅ All 7 verification commands green (Phase 12.2)
2. ✅ All 12 phases of this plan committed
3. ✅ `v1.0.0-rc1` tag pushed
4. ✅ Codemagic auto-build succeeded
5. ✅ TestFlight Internal build appears in App Store Connect
6. ✅ Aqil is unblocked on Track A submit-day actions

If 1-6 all check out: open a PR `appstore-launch` → `prod-ready/main` and request merge after Day 14 dual-submit confirms TestFlight + Play Closed Testing kicked off cleanly.

If anything fails: read the failure mode in design doc §9 (risk register) — most rejections have pre-built mitigations.

---

**Plan generated 2026-04-25 from `docs/plans/2026-04-25-app-store-launch-design.md` (Aqil-approved). Implementation begins next session per executing-plans skill.**
