# haloFrame Production-Ready — Progress Log

**Plan:** [`2026-04-21-production-ready.md`](./2026-04-21-production-ready.md)
**Branch:** `prod-ready/main` (worktree at `.worktrees/prod-ready`)
**Base:** `main@bfe8a3b` (plan doc commit)
**Session start:** 2026-04-20

This is the append-only log for the overnight autonomous run. Every phase entry,
every task result, and every blocker goes here in the order it happens.

---

## 2026-04-20 — Session start: worktree setup

**Action:**
- `git worktree add .worktrees/prod-ready -b prod-ready/main` (from `main@bfe8a3b`)
- `npm install` — 245 packages, 39s, 2 moderate-sev vulns (defer — audit fix would be destructive)
- Baseline verified: `npm run typecheck` → green across `@haloframe/api`, `@haloframe/web`, `@haloframe/shared`

**Notes:**
- Vite dev server port is `5173` in `apps/web/vite.config.ts`. Plan doc references `5187` which is stale — using `5173`.
- Old `.worktrees/redesign-v2` worktree left in place (not removed) since memory notes it as optional.
- Untracked on `main` (`design/`, `docs/redesign/prompts/`, `scripts/extract-design-*.mjs`) don't appear in the worktree since they were never committed.

---

## 2026-04-20 — Phase A, Task A1: install Playwright

**Action:** `npm i -D -w @haloframe/web @playwright/test` + `npx playwright install chromium`. Authored `apps/web/playwright.config.ts` (chromium project, `baseURL=http://localhost:5173`, `webServer` spawns repo-root `npm run dev`, `reuseExistingServer: !CI`).
**Verification:** `npx playwright --version` → 1.59.1. Test discovery sees config.
**Result:** pass
**Commit:** `4c7af3d chore(test): install playwright and scaffold config`
**Notes:** Added `apps/web/{test-results,playwright-report,blob-report}/` to `.gitignore` to avoid committing artifacts.

## 2026-04-20 — Phase A, Task A2: smoke E2E + Vite env fix

**Action:** Authored `apps/web/tests/e2e/home-loads.spec.ts` asserting the headline `/For the ones we carry with us/i` via `getByRole('heading')`. Killed 3 stale dev-server node processes (days 2-4 old) that were holding 5173/5174/4000 and serving a broken bundle. Discovered latent bug: Vite's default `envDir` is `apps/web/`, so the repo-root `.env` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` was never loaded, making `createClient('','')` throw at module init and white-screening the app. Fixed by setting `envDir: resolve(__dirname, '../..')` in `vite.config.ts`.
**Verification:** Fresh `npx playwright test home-loads` → 1 passed. Console shows Supabase client constructed (no `supabaseUrl is required` anymore).
**Result:** pass
**Commit:** `6367765 chore(test): add home smoke E2E and fix Vite envDir for monorepo .env`

## 2026-04-20 — Phase A, Task A3: test:e2e scripts

**Action:** Added `test:e2e` and `test:e2e:ui` scripts to `apps/web/package.json`.
**Verification:** `npm --workspace=@haloframe/web run test:e2e` → 1 passed, 12.2s.
**Result:** pass
**Commit:** `2d2d668 chore(test): add test:e2e and test:e2e:ui npm scripts`

## 2026-04-20 — Phase A, Task A4: Vitest unit tests

**Action:** Installed `vitest@4.1.4` and `@vitest/ui`. Added `apps/web/vitest.config.ts` (excludes `tests/**` so Vitest doesn't collide with Playwright specs, aliases `@haloframe/shared`). Added `test`, `test:unit`, `test:unit:ui` scripts. Authored `apps/web/src/lib/copy.test.ts` with three cases exercising `COPY.home.badgeOfFree`, `COPY.enhance.stepLabel`, and the split-headline concatenation.
**Verification:** `npm --workspace=@haloframe/web run test:unit` → 3 tests passed, 409ms. `npm run typecheck` green across all workspaces.
**Result:** pass
**Commit:** `fe609bd chore(test): add vitest with copy.test.ts trivial suite`

## 2026-04-20 — Phase A, Task A5: GitHub Actions CI

**Action:** Scaffolded `.github/workflows/ci.yml`. Pipeline: checkout → Node 20 → `npm ci` → `npm run typecheck` → `vitest --run` → (secret-gated) Playwright install + E2E → (secret-gated) `scripts/smoke-redesign.mjs`. Uses output flags `has_supabase` / `has_fal` so the workflow is green on a fresh fork without secrets; emits `::warning::` line when gated steps are skipped. Uploads the Playwright HTML report as an artifact.
**Verification:** `python -c "yaml.safe_load(open(ci.yml))"` → YAML OK. Eyeballed the step graph.
**Result:** pass
