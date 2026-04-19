# haloFrame redesign strategy

**Date:** 2026-04-18
**Branch:** `redesign/v2` in worktree at `.worktrees/redesign-v2/`
**Scope:** Visual redesign of every screen using claude.ai/design, starting with Home.
**Non-scope:** Any change to auth, credit ledger, API, DB schema, or RevenueCat/Stripe wiring.

---

## Core principle

The app has two clean layers. The **logic layer** — `useAuth`, `useSubscription`, `lib/api.ts`, credit gates, webhook — shipped in commit `21ca7d1` and is production-ready. The **visual layer** — JSX, CSS, framer-motion animations — is what gets redesigned. Every rule below exists to enforce that separation.

## The nine-point strategy

### 1. Separation before pixels

Before any screen is touched, produce a contract manifest listing every screen's reads, writes, and routes. See `2026-04-18-redesign-contracts.md`. A redesigned screen that fails any invariant in that manifest does not merge, regardless of how good it looks.

### 2. Worktree isolation

All redesign work happens in `.worktrees/redesign-v2/` on branch `redesign/v2`. `main` stays deployable at all times. Merges to `main` are squash merges at ship time, not continuous.

### 3. Continuous smoke test

`scripts/smoke-redesign.mjs` hits the API's logic endpoints directly (no fal.ai) and verifies:

- Anonymous Supabase signup → 2-credit grant via trigger
- `GET /api/subscription/status` returns `{planId: 'free', creditsRemaining: 2, renewsOn: null}`
- `POST /api/spike/apply` with final resolution on a 0-credit user → HTTP 402 `insufficient_credits`
- `POST /api/subscription/purchase` (web) → HTTP 501 `web_checkout_not_configured`

Runs between every screen swap. A failure means the logic layer regressed — revert, investigate, do not proceed.

### 4. Token reconciliation, not mixing

claude.ai/design will emit CSS variables. Port them into:

- `packages/shared/src/constants/index.ts` → `COLORS` (consumed by server-rendered fallbacks)
- `apps/web/src/lib/tokens.ts` → exported token object (consumed by JSX / framer-motion configs)

Any inline hex or one-off `rgb(...)` value in screen JSX fails review. Tokens are the single source of truth.

### 5. Screen order (least → most coupled)

1. Home
2. Settings
3. Paywall
4. EnhanceFlow (upload / segment / subject select only — Editor stays)
5. ReuniteFlow (upload / placement / review only — Editor stays)
6. Editor (the heaviest — templates, previews, save gate, 402 routing, caching)
7. PrintShop
8. MyTributes (empty-state only right now, can land last)

One screen per commit on `redesign/v2`. Each commit must pass `npm run typecheck`, the smoke test, and a manual mobile (360) + desktop (1440) eyeball.

### 6. Animation policy

- **Screens 1–6**: reskin JSX only; keep existing framer-motion variants in `lib/motion.ts`. Swapping visuals and motion simultaneously makes regressions undebuggable.
- **Post-port polish pass**: adopt new motion proposals from claude.ai/design, one screen at a time, after the redesign is otherwise stable.

### 7. Accessibility gate

Every screen must preserve or exceed the current Phase-D a11y bar:

- Focus traps on modals (Paywall, SavedModal)
- `aria-live` regions on async state (segmenting, merging, purchase errors)
- Tab order matches visual order
- Reduced-motion guard via `useReducedMotion()` on every motion block
- Contrast ≥ AA on all text

Run the `audit` skill between screens. Any P0 or P1 a11y finding blocks the merge.

### 8. Rebase cadence

`redesign/v2` rebases onto `main` every time a fix or feature lands on main. Prevents weeks-of-drift merge hell. If a hotfix is needed during the redesign, it lands on `main` first, then `redesign/v2` rebases to absorb it.

### 9. Ship criteria for `redesign/v2` → `main`

- All 8 screens ported
- `npm run typecheck` clean across shared/api/web
- `scripts/smoke-redesign.mjs` green against a freshly provisioned test user
- Manual review on mobile (360) + desktop (1440)
- `audit` skill returns no P0 / P1 findings
- `git grep -E "SUPABASE_|FAL_KEY|SERVICE_ROLE"` returns no plaintext secrets
- README updated with new design-system inventory (token names, component list)

---

## Key invariants (do not break)

1. Credit ledger contract — `useSubscription().canAfford(action)` gates save buttons; 402 responses route to Paywall.
2. Auth bootstrap — `useAuth()` signs in anonymously on cold load; every API call threads `Authorization: Bearer <jwt>`.
3. Dedupe — final renders send a stable `saveId` so a double-click hits the ledger unique index, not a double-charge.
4. Preview rate limit — 15 previews per uploaded photo; the 429 response surfaces as a "save to continue" hint, not a generic error.
5. Webhook idempotency — never retries a grant with the same `revenuecat_event_id`.
6. Memorial tone — user-facing copy says "tributes" (not "credits"), "Keepsake"/"Heritage" (not "Basic"/"Pro"), "Extend your Heritage membership" (not "Upgrade your plan"). Dignified, not SaaS-cheerful.

## Risk ledger

| Risk | Mitigation |
|---|---|
| claude.ai/design ships incompatible framework (e.g. Next) | We only consume HTML + CSS vars; translate to React by hand |
| Animation layer rewrite introduces jank | Defer animation work to post-port polish pass |
| Design tokens drift across screens | Centralize in `lib/tokens.ts` on commit #1 and enforce in review |
| Accessibility regression | Audit between screens, P0/P1 blocks |
| Redesign drifts from main | Rebase cadence after any main commit |
| Smoke test goes stale | Owner updates it whenever the logic layer contract changes (rare — logic layer is frozen) |

## Entry points for a cold-start session

1. Read `memory/project_pricing_strategy.md` for credit-model context
2. Read this strategy doc
3. Read `2026-04-18-redesign-contracts.md` for the invariant manifest
4. Check out `.worktrees/redesign-v2/` — branch `redesign/v2`
5. Run `scripts/smoke-redesign.mjs` to confirm logic layer still green
6. Next screen in the order above that hasn't shipped yet = your target
