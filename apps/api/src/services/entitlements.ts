// =============================================================================
// EternalFrame API — entitlement enforcement
//
// Server is the source of truth for whether a user can perform a paid action.
// Mobile UI mirrors RevenueCat for fast gating, but every cost-bearing
// endpoint re-checks here before calling fal.ai.
// =============================================================================
import {
  SUBSCRIPTION_TIERS,
  type EntitlementCheck,
  type Profile,
  type SubscriptionTier,
} from '@eternalframe/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { errors } from '../lib/errors.js';

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
    .select('*')
    .eq('id', userId)
    .single<DbProfile>();
  if (error || !data) {
    throw errors.internal('Failed to load profile', { error });
  }
  return dbToProfile(data);
}

/**
 * Check if a profile is allowed to start a new tribute. Also rolls the
 * usage period over if `period_reset_at` has elapsed.
 */
export async function checkPhotoEntitlement(profile: Profile): Promise<EntitlementCheck> {
  const tier = SUBSCRIPTION_TIERS[profile.subscriptionTier];

  // Reset rolling window if expired
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
 * Atomically increment usage and write a usage_log row. Call this *after* a
 * successful AI operation, not before, so failures don't burn the user's quota.
 */
export async function recordUsage(opts: {
  userId: string;
  tributeId: string;
  creationType: 'photo' | 'video' | 'segment' | 'merge' | 'apply' | 'finalize';
  apiCostCents: number;
  /** True for the operation that 'counts' against the per-period quota (typically `apply` or `finalize`) */
  countTowardQuota: boolean;
}): Promise<void> {
  await supabaseAdmin.from('usage_log').insert({
    user_id: opts.userId,
    tribute_id: opts.tributeId,
    creation_type: opts.creationType,
    api_cost_cents: opts.apiCostCents,
  });

  if (opts.countTowardQuota) {
    // Use rpc-style atomic increment to avoid races
    const { error } = await supabaseAdmin.rpc('increment_creations', {
      p_user_id: opts.userId,
    });
    if (error) {
      // Fallback: read-modify-write
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
