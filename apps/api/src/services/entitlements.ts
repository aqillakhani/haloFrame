// =============================================================================
// HaloFrame API — entitlement enforcement
//
// Server is the source of truth for whether a user can perform a paid action.
// The 2026-04-18 refactor introduced a credit-ledger model
// (`checkCredits` / `spendCredits`) that supersedes the legacy 5-tier quota
// check. Both code paths are exported during cutover: `/api/spike/*` uses
// the new credit path; the older authenticated `/api/tribute/*` routes
// still call the legacy path until Phase 4 rewrites them.
// =============================================================================
import {
  SUBSCRIPTION_TIERS,
  type EntitlementCheck,
  type Profile,
  type SubscriptionSnapshot,
  type SubscriptionTier,
} from '@haloframe/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { errors } from '../lib/errors.js';

// -----------------------------------------------------------------------------
// Dev-only credit bypass.
//
// When DEV_UNLIMITED_CREDITS=true AND NODE_ENV !== 'production', credit
// gates short-circuit: checkCredits returns allowed=true, spendCredits is a
// no-op (returns DEV_BYPASS_BALANCE unchanged), the free-tier per-flow gate
// returns false, and the UI snapshot reports DEV_BYPASS_BALANCE so buttons
// stay enabled. Production is hard-guarded — flipping the env var on a prod
// deploy does nothing.
//
// Note: charged operations (NB2 calls, fal storage uploads) STILL incur real
// fal.ai cost. The bypass only skips the user-facing balance accounting.
// -----------------------------------------------------------------------------
const DEV_BYPASS_BALANCE = 999;
function devUnlimited(): boolean {
  return env.DEV_UNLIMITED_CREDITS === true && env.NODE_ENV !== 'production';
}
let devBypassWarnedOnce = false;
function logDevBypassOnce(scope: string): void {
  if (devBypassWarnedOnce) return;
  devBypassWarnedOnce = true;
  logger.warn(
    { scope },
    'DEV_UNLIMITED_CREDITS active — credit checks bypassed (not for production)',
  );
}

// -----------------------------------------------------------------------------
// Credit-model plumbing
// -----------------------------------------------------------------------------

/**
 * Server-side per-operation credit cost. Stays in sync with the user-facing
 * `ACTION_CREDIT_COSTS` total: an Enhance save routes through `apply_final`
 * once (1 credit), a Reunite save routes through `merge` + `apply_final`
 * (1 + 1 = 2 credits). Keeping them separate lets the client display "this
 * save costs 2 tributes" atomically while the server charges per fal call.
 */
export const OPERATION_COSTS = {
  merge: 1,
  apply_final: 1,
} as const satisfies Record<string, number>;

export type CreditOperation = keyof typeof OPERATION_COSTS;

interface DbProfileCredit {
  id: string;
  plan_id: SubscriptionSnapshot['planId'];
  credits_remaining: number;
  credits_rollover: number;
  topup_credits_remaining: number;
  topup_expires_at: string | null;
  renews_on: string | null;
}

function computeTotalCredits(row: DbProfileCredit): number {
  // Mirror the RPC's stale-topup handling so the snapshot the UI sees lines
  // up with what spend_credits would actually let through on the next call.
  const topupAlive =
    row.topup_expires_at && new Date(row.topup_expires_at).getTime() > Date.now();
  const topup = topupAlive ? row.topup_credits_remaining : 0;
  return topup + row.credits_rollover + row.credits_remaining;
}

/**
 * Load the credit-model view of a profile. Returns the exact
 * SubscriptionSnapshot shape the UI expects from GET /api/subscription/status.
 */
export async function loadCreditSnapshot(userId: string): Promise<SubscriptionSnapshot> {
  if (devUnlimited()) {
    logDevBypassOnce('loadCreditSnapshot');
    return {
      planId: 'heritage_annual',
      creditsRemaining: DEV_BYPASS_BALANCE,
      renewsOn: null,
    };
  }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, plan_id, credits_remaining, credits_rollover, topup_credits_remaining, topup_expires_at, renews_on',
    )
    .eq('id', userId)
    .single<DbProfileCredit>();
  if (error || !data) {
    throw errors.internal('Failed to load credit snapshot', { error });
  }
  const base: SubscriptionSnapshot = {
    planId: data.plan_id,
    creditsRemaining: computeTotalCredits(data),
    renewsOn: data.renews_on,
  };
  // Free tier: fold in per-flow availability so the UI can show
  // "2 free tributes — 1 enhance + 1 reunite" without a second round-trip.
  // Non-free tiers omit the field (both flows always available).
  if (data.plan_id === 'free') {
    const perFlow = await loadPerFlowSnapshot(userId);
    if (perFlow.planId !== null) {
      base.freeTierFlows = {
        enhanceAvailable: perFlow.enhanceAvailable,
        mergeAvailable: perFlow.mergeAvailable,
      };
    }
  }
  return base;
}

export interface CreditCheckResult {
  allowed: boolean;
  creditsRemaining: number;
  requiredCredits: number;
}

// -----------------------------------------------------------------------------
// Per-flow free-tier gate (Phase D). Free users get 1 Enhance + 1 Reunite.
// Paid users ignore these flags entirely — credits are the gate for them.
//
// The `enhance_used` and `merge_used` boolean columns are added by migration
// `20260421000001_per_flow_free_tier.sql`. The helpers below are forward-
// compatible: if the columns don't exist yet (migration not applied) the
// check is permissive and logs a warn so the app keeps working without a
// hard dependency on the schema bump.
// -----------------------------------------------------------------------------

export type FreeTierFlow = 'enhance' | 'reunite';

interface PerFlowFlags {
  planId: SubscriptionSnapshot['planId'];
  enhanceUsed: boolean;
  mergeUsed: boolean;
}

/**
 * Attempt to read the plan id + per-flow flags for a profile. Returns
 * `null` when either the profile doesn't exist or the `enhance_used` /
 * `merge_used` columns are missing (e.g. pre-migration); callers should
 * treat `null` as "permissive" rather than fail closed.
 */
async function readPerFlowFlags(userId: string): Promise<PerFlowFlags | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('plan_id, enhance_used, merge_used')
      .eq('id', userId)
      .single<{
        plan_id: SubscriptionSnapshot['planId'];
        enhance_used: boolean | null;
        merge_used: boolean | null;
      }>();
    if (error || !data) return null;
    return {
      planId: data.plan_id,
      enhanceUsed: data.enhance_used === true,
      mergeUsed: data.merge_used === true,
    };
  } catch (err) {
    // Typically "column does not exist" pre-migration. Log once and soft-fail.
    console.warn('[entitlements:readPerFlowFlags] soft-fail, treating as permissive:', err);
    return null;
  }
}

/** True when the user is free-tier AND has already used this flow type. */
export async function isFlowBlockedForFree(
  userId: string,
  flow: FreeTierFlow,
): Promise<boolean> {
  if (devUnlimited()) {
    logDevBypassOnce('isFlowBlockedForFree');
    return false;
  }
  const flags = await readPerFlowFlags(userId);
  if (!flags) return false; // fail-open during migration lag
  if (flags.planId !== 'free') return false;
  if (flow === 'enhance') return flags.enhanceUsed;
  return flags.mergeUsed;
}

/**
 * Flip the corresponding flag to true on a successful save. Idempotent —
 * repeated calls with the same flow just re-write `true`. Paid users still
 * get the flag flipped (harmless; their gate is credits, not flags).
 */
export async function markFreeTierFlowUsed(
  userId: string,
  flow: FreeTierFlow,
): Promise<void> {
  const patch = flow === 'enhance' ? { enhance_used: true } : { merge_used: true };
  try {
    await supabaseAdmin.from('profiles').update(patch).eq('id', userId);
  } catch (err) {
    console.warn('[entitlements:markFreeTierFlowUsed] soft-fail (pre-migration?):', err);
  }
}

export interface PerFlowSnapshot {
  /** Null during migration lag — caller should not surface to UI. */
  planId: SubscriptionSnapshot['planId'] | null;
  enhanceAvailable: boolean;
  mergeAvailable: boolean;
}

/** Compose a per-flow availability snapshot for the home badge + paywall. */
export async function loadPerFlowSnapshot(userId: string): Promise<PerFlowSnapshot> {
  const flags = await readPerFlowFlags(userId);
  if (!flags) {
    return { planId: null, enhanceAvailable: true, mergeAvailable: true };
  }
  if (flags.planId !== 'free') {
    return { planId: flags.planId, enhanceAvailable: true, mergeAvailable: true };
  }
  return {
    planId: flags.planId,
    enhanceAvailable: !flags.enhanceUsed,
    mergeAvailable: !flags.mergeUsed,
  };
}

/**
 * Non-destructive check: does the user have enough credits to perform `action`?
 * Route handlers call this BEFORE invoking fal.ai so an insufficient balance
 * fails fast with a 402 instead of burning the provider cost.
 */
export async function checkCredits(
  userId: string,
  action: CreditOperation,
): Promise<CreditCheckResult> {
  const required = OPERATION_COSTS[action];
  if (devUnlimited()) {
    logDevBypassOnce('checkCredits');
    return { allowed: true, creditsRemaining: DEV_BYPASS_BALANCE, requiredCredits: required };
  }
  const snapshot = await loadCreditSnapshot(userId);
  return {
    allowed: snapshot.creditsRemaining >= required,
    creditsRemaining: snapshot.creditsRemaining,
    requiredCredits: required,
  };
}

export interface SpendCreditsOptions {
  /**
   * Stable client-supplied save identifier. The ledger's unique
   * (user_id, dedupe_key) index rejects a second spend with the same
   * key, so a double-clicked save button can't double-charge.
   */
  dedupeKey?: string;
  tributeId?: string;
}

/**
 * Atomically decrement credits. Call ONLY after the cost-bearing
 * operation succeeds — a 500 in the middle of fal.subscribe should not
 * burn the user's tribute. Throws `errors.paymentRequired()` when the
 * balance is insufficient, which maps to HTTP 402 at the response layer.
 */
export async function spendCredits(
  userId: string,
  action: CreditOperation,
  opts: SpendCreditsOptions = {},
): Promise<number> {
  const amount = OPERATION_COSTS[action];
  if (devUnlimited()) {
    logDevBypassOnce('spendCredits');
    return DEV_BYPASS_BALANCE;
  }
  const { error, data } = await supabaseAdmin.rpc('spend_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_action: action,
    p_dedupe_key: opts.dedupeKey ?? null,
    p_tribute_id: opts.tributeId ?? null,
  });

  if (error) {
    // Postgres raises 'insufficient_credits' by name; the supabase-js client
    // surfaces it as `message === 'insufficient_credits'`. Any other error
    // shape (connection drop, permission, etc.) bubbles up as internal.
    const message = error.message ?? '';
    if (message.includes('insufficient_credits')) {
      throw errors.paymentRequired();
    }
    throw errors.internal('Failed to spend credits', { error });
  }

  if (typeof data !== 'number') {
    throw errors.internal('spend_credits RPC returned an unexpected shape', { data });
  }
  return data;
}

// -----------------------------------------------------------------------------
// Legacy 5-tier quota path (still used by /api/tribute/* until Phase 4)
// -----------------------------------------------------------------------------

interface DbProfile {
  id: string;
  display_name: string | null;
  subscription_tier: SubscriptionTier;
  creations_used_this_period: number;
  period_reset_at: string | null;
  total_creations: number;
  revenuecat_id: string | null;
  created_at: string;
  updated_at: string;
}

function dbToProfile(row: DbProfile): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    subscriptionTier: row.subscription_tier,
    creationsUsedThisPeriod: row.creations_used_this_period,
    periodResetAt: row.period_reset_at,
    totalCreations: row.total_creations,
    revenuecatId: row.revenuecat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, display_name, subscription_tier, creations_used_this_period, period_reset_at, total_creations, revenuecat_id, created_at, updated_at',
    )
    .eq('id', userId)
    .single<DbProfile>();
  if (error || !data) {
    throw errors.internal('Failed to load profile', { error });
  }
  return dbToProfile(data);
}

/**
 * @deprecated Use `checkCredits` instead. Retained for the legacy
 * `/api/tribute/*` route until Phase 4 cuts those over to the credit model.
 */
export async function checkPhotoEntitlement(profile: Profile): Promise<EntitlementCheck> {
  const tier = SUBSCRIPTION_TIERS[profile.subscriptionTier];

  if (
    tier.periodDays !== null &&
    profile.periodResetAt &&
    new Date(profile.periodResetAt).getTime() <= Date.now()
  ) {
    const nextReset = new Date(Date.now() + tier.periodDays * 86_400_000);
    await supabaseAdmin
      .from('profiles')
      .update({
        creations_used_this_period: 0,
        period_reset_at: nextReset.toISOString(),
      })
      .eq('id', profile.id);
    profile.creationsUsedThisPeriod = 0;
    profile.periodResetAt = nextReset.toISOString();
  }

  if (tier.photoCreationsPerPeriod === -1) {
    return { allowed: true };
  }

  if (profile.creationsUsedThisPeriod >= tier.photoCreationsPerPeriod) {
    return {
      allowed: false,
      reason: profile.subscriptionTier === 'free' ? 'upgrade_required' : 'limit_reached',
    };
  }

  return {
    allowed: true,
    remaining: tier.photoCreationsPerPeriod - profile.creationsUsedThisPeriod,
  };
}

/**
 * @deprecated Use `spendCredits` for cost-bearing saves. Retained for the
 * legacy tribute router's segment/merge/finalize usage-log rows (non-quota)
 * until Phase 4.
 */
export async function recordUsage(opts: {
  userId: string;
  tributeId: string;
  creationType: 'photo' | 'video' | 'segment' | 'merge' | 'apply' | 'finalize';
  apiCostCents: number;
  countTowardQuota: boolean;
}): Promise<void> {
  await supabaseAdmin.from('usage_log').insert({
    user_id: opts.userId,
    tribute_id: opts.tributeId,
    creation_type: opts.creationType,
    api_cost_cents: opts.apiCostCents,
  });

  if (opts.countTowardQuota) {
    const { error } = await supabaseAdmin.rpc('increment_creations', {
      p_user_id: opts.userId,
    });
    if (error) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('creations_used_this_period, total_creations')
        .eq('id', opts.userId)
        .single<{ creations_used_this_period: number; total_creations: number }>();
      if (prof) {
        await supabaseAdmin
          .from('profiles')
          .update({
            creations_used_this_period: prof.creations_used_this_period + 1,
            total_creations: prof.total_creations + 1,
          })
          .eq('id', opts.userId);
      }
    }
  }
}
