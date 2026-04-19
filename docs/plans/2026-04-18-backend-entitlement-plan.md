# Backend entitlement refactor — plan

**Status:** not started · deferred to its own session per `memory/project_pricing_strategy.md`
**Goal:** replace the 5-tier quota model on the server with the 3-tier credit-ledger model the UI already expects, and wire the web app to a real `useSubscription()` hook so `MOCK_SUBSCRIPTION` can be deleted.

---

## What "done" means

1. **`MOCK_SUBSCRIPTION` is gone.** `apps/web/src/lib/mockSubscription.ts` is replaced by a `useSubscription()` hook that fetches `/api/subscription/status` and returns the same `SubscriptionSnapshot` shape the UI already consumes.
2. **Server enforces credits, not the old quota.** `/api/spike/enhance` and `/api/spike/reunite` reject with a structured 402-style error when the caller has insufficient credits. UI catches that and surfaces the paywall — same entry point it already hits locally.
3. **Credits decrement on successful save, not start.** Same discipline as today's `recordUsage({ countTowardQuota: true })` — charge after the fal call succeeds so a 500 doesn't burn the user's tribute.
4. **RevenueCat webhook maps to the new tier set.** Entitlement IDs from `memory/project_pricing_strategy.md` (`haloframe_keepsake_monthly`, etc.) resolve to correct credit grants.
5. **Free signup grants 2 lifetime credits**, not a rolling monthly quota.

---

## Current state (2026-04-18)

### What the UI expects

`apps/web/src/lib/mockSubscription.ts`:

```ts
export interface SubscriptionSnapshot {
  planId: SubscriptionPlanId;   // 'free' | 'keepsake_monthly' | 'heritage_monthly' | 'heritage_annual'
  creditsRemaining: number;
  renewsOn: string | null;      // ISO date, null on Free
}
```

`ACTION_CREDIT_COSTS` in `packages/shared/src/constants/index.ts` — `enhance_save = 1`, `reunite_save = 2`. The `canAfford` helper is already written and consumed by `Editor.tsx`.

Consumers (grep for `MOCK_SUBSCRIPTION`):
- `apps/web/src/screens/PaywallScreen.tsx` — reads `creditsRemaining` + `planId` for subhead
- `apps/web/src/screens/SettingsScreen.tsx` — reads same for membership card
- `apps/web/src/screens/Editor.tsx` — calls `canAfford('enhance_save' | 'reunite_save')` before Save
- `apps/web/src/screens/EnhanceFlow.tsx`, `ReuniteFlow.tsx` — render the `tributes-remaining` header badge

### What the server has today

`apps/api/src/routes/subscription.ts` — GET `/status` + POST `/webhook`. Uses 5-tier `SUBSCRIPTION_TIERS` from shared constants (old system: `free | weekly | monthly | premium_monthly | premium_annual` with `photoCreationsPerPeriod` quotas).

`apps/api/src/services/entitlements.ts` — `loadProfile`, `checkPhotoEntitlement` (returns `allowed / remaining` based on `creations_used_this_period` vs `photoCreationsPerPeriod`), `recordUsage` (increments `creations_used_this_period` on successful finalize).

`profiles` table columns (from `supabase/migrations/20260410000001_initial_schema.sql`):
- `subscription_tier` (enum, 5 values)
- `creations_used_this_period INTEGER`
- `period_reset_at TIMESTAMPTZ`
- `total_creations INTEGER`
- `revenuecat_id TEXT`

`/api/spike/*` routes are **unauthenticated** today. The de-risk harness never wired `requireAuth`. The authenticated `/api/tribute/*` route does exist but the web app doesn't hit it — everything goes through spike.

### Two parallel pricing systems in shared constants

- **Old (server wiring):** `SUBSCRIPTION_TIERS` — 5 tiers, quota model
- **New (UI wiring):** `SUBSCRIPTION_PLANS_UI` + `ACTION_CREDIT_COSTS` — 3 tiers + top-ups + credit costs

Both exist in `packages/shared/src/constants/index.ts`. The refactor deletes `SUBSCRIPTION_TIERS` once nothing imports it.

---

## Data-model changes

New migration: `supabase/migrations/20260418000001_credit_ledger.sql`

```sql
-- Add credit fields to profiles
ALTER TABLE profiles ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN credits_remaining INTEGER NOT NULL DEFAULT 2;
ALTER TABLE profiles ADD COLUMN credits_rollover INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN renews_on TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN topup_credits_remaining INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN topup_expires_at TIMESTAMPTZ;

-- Migrate existing users: everyone becomes 'free' with 2 lifetime credits minus
-- what they've already used. Cap at 0.
UPDATE profiles SET
  plan_id = 'free',
  credits_remaining = GREATEST(0, 2 - creations_used_this_period);

-- Drop old columns in a follow-up migration once subscription.ts is fully cut over
-- (keeps the current webhook working during deploy).
```

**Atomic decrement RPC** (replaces `increment_creations`):

```sql
CREATE OR REPLACE FUNCTION spend_credits(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_remaining INTEGER;
BEGIN
  -- Prefer top-ups first (they expire), then monthly, then rollover
  UPDATE profiles SET
    topup_credits_remaining = GREATEST(0, topup_credits_remaining - p_amount),
    credits_remaining = credits_remaining -
      GREATEST(0, p_amount - topup_credits_remaining)
    -- simplified: real function needs a three-bucket tiered drain
  WHERE id = p_user_id
    AND (topup_credits_remaining + credits_remaining + credits_rollover) >= p_amount
  RETURNING credits_remaining INTO v_remaining;
  IF v_remaining IS NULL THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  RETURN v_remaining;
END; $$;
```

---

## Code changes (ordered)

### Phase 1 — shared types

- [ ] Add `entitlementSnapshotSchema` to `packages/shared/src/schemas/index.ts` matching `SubscriptionSnapshot`.
- [ ] Delete `SUBSCRIPTION_TIERS`, `SubscriptionTier`, `EntitlementCheck` once nothing imports them (do this last).

### Phase 2 — API

- [ ] `apps/api/src/services/entitlements.ts`: add `checkCredits(userId, action)` + `spendCredits(userId, action, tributeId)`. Keep `loadProfile`, retire `checkPhotoEntitlement` and `recordUsage`.
- [ ] `apps/api/src/routes/subscription.ts`:
  - GET `/status` → return `{ planId, creditsRemaining, renewsOn }` (shape = `SubscriptionSnapshot`)
  - POST `/webhook` → map new entitlement IDs (`haloframe_keepsake_monthly` → plan_id `keepsake_monthly`, grant 5 credits, set `renews_on`)
  - Top-up purchases: add to `topup_credits_remaining`, set `topup_expires_at = now + 90d`
- [ ] `apps/api/src/routes/spike.ts` enhance + reunite handlers: wrap in `requireAuth`, call `checkCredits` before fal invocation, call `spendCredits` after successful save. On insufficient credits, throw `errors.paymentRequired('insufficient_credits')` (new error code).
- [ ] `apps/api/src/lib/errors.ts`: add `paymentRequired` helper that returns HTTP 402 with `{ code: 'insufficient_credits' }`.

### Phase 3 — Web

- [ ] `apps/web/src/hooks/useSubscription.ts`: TanStack Query or plain `useEffect` + `useState` fetcher hitting `/api/subscription/status`. Returns `{ snapshot, isLoading, refetch }`.
- [ ] Replace every `MOCK_SUBSCRIPTION` import with `useSubscription()`. Consumers are already listed above.
- [ ] `canAfford` helper moves from `mockSubscription.ts` into the hook's return (`canAfford(action)`).
- [ ] Delete `apps/web/src/lib/mockSubscription.ts`.
- [ ] `PaywallScreen.tsx` `handlePurchase`: POST to `/api/subscription/purchase` (or kick off RevenueCat SDK flow — depends on whether we're still web-only or testing on native). Refetch `useSubscription` on success.
- [ ] Catch 402 from `/api/spike/*` in `Editor.tsx` save handler → push to Paywall instead of showing generic error.

### Phase 4 — Cleanup

- [ ] Second migration drops `subscription_tier`, `creations_used_this_period`, `period_reset_at`, `total_creations` columns.
- [ ] Delete unused exports from shared constants.
- [ ] Update `apps/api/src/routes/tribute.ts` if it still reads `subscription_tier`.

---

## Cutover strategy

The old columns stay in place during Phase 2 — `subscription.ts` reads from the new columns but the webhook also updates both during a transitional period. This keeps any in-flight mobile builds working.

Web traffic is gated by whichever hook is deployed; as long as the server accepts requests from the old + new shape, deploys don't need to be atomic.

---

## Out of scope (other sessions)

- **RevenueCat dashboard config** — entitlement IDs, product IDs, sandbox testers. Not code.
- **App Store Connect / Play Console** — product listings. Not code.
- **Stripe integration for canvas orders** — separate revenue stream, not credit-gated.
- **Save-to-Photos backend** — currently a no-op button. Tracked separately; orthogonal to entitlements.
- **Rate limiting on `/api/spike/*`** — independent hardening task.

---

## Risk notes

- **Credit drain race**: two concurrent save requests could both pass the pre-check and both spend. Mitigate with the atomic `spend_credits` RPC and a unique constraint on `tribute_id` in the spend ledger so double-spends conflict.
- **Webhook replay**: RevenueCat retries. Either ignore non-terminal states or make the grant operation idempotent (e.g. dedupe on `event.id`).
- **Free-tier bootstrapping**: new signups need the 2 lifetime credits on profile creation — either via trigger or explicit grant in the auth hook. Today's code grants nothing on signup.
- **Migration on a live DB**: the `UPDATE profiles SET credits_remaining = GREATEST(0, 2 - creations_used_this_period)` pass assumes Free users; any existing paid users need manual credit grants before the old tier column is dropped.

---

## Entry points for a cold-start session

1. Read `memory/project_pricing_strategy.md` for the tier matrix + naming rules
2. Read `apps/web/src/lib/mockSubscription.ts` for the exact UI contract
3. Read `apps/api/src/services/entitlements.ts` + `apps/api/src/routes/subscription.ts` for what's being replaced
4. Grep `MOCK_SUBSCRIPTION` to see every UI call site
5. Grep `checkPhotoEntitlement` to see every server call site
