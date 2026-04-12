// =============================================================================
// EternalFrame API — /api/subscription
//
// GET  /status   — current tier + remaining creations (auth required)
// POST /webhook  — RevenueCat webhook receiver (no auth, header-based shared secret)
// =============================================================================
import { Router } from 'express';
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from '@eternalframe/shared';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';
import { loadProfile, checkPhotoEntitlement } from '../services/entitlements.js';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const subscriptionRouter = Router();

subscriptionRouter.get('/status', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const profile = await loadProfile(userId);
    const entitlement = await checkPhotoEntitlement(profile);
    const tierConfig = SUBSCRIPTION_TIERS[profile.subscriptionTier];
    ok(res, { profile, entitlement, tierConfig });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// RevenueCat webhook
// Mirror tier changes into profiles.subscription_tier
// -----------------------------------------------------------------------------
const ENTITLEMENT_TO_TIER: Record<string, SubscriptionTier> = {
  // RevenueCat entitlement IDs → app tier
  // Configure these in the RevenueCat dashboard to match.
  weekly: 'weekly',
  monthly: 'monthly',
  premium_monthly: 'premium_monthly',
  premium_annual: 'premium_annual',
};

subscriptionRouter.post('/webhook', async (req, res, next) => {
  try {
    if (env.REVENUECAT_WEBHOOK_AUTH_HEADER) {
      const header = req.headers.authorization;
      if (header !== env.REVENUECAT_WEBHOOK_AUTH_HEADER) {
        throw errors.unauthenticated('Invalid webhook signature');
      }
    }

    const event = req.body?.event;
    if (!event) {
      throw errors.invalidRequest('Missing event payload');
    }

    const appUserId: string | undefined = event.app_user_id;
    if (!appUserId) {
      throw errors.invalidRequest('Missing app_user_id');
    }

    const entitlementIds: string[] = event.entitlement_ids ?? [];
    const newTier: SubscriptionTier =
      entitlementIds
        .map((id) => ENTITLEMENT_TO_TIER[id])
        .find((t): t is SubscriptionTier => !!t) ?? 'free';

    logger.info(
      { type: event.type, appUserId, newTier },
      'revenuecat webhook',
    );

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_tier: newTier,
        revenuecat_id: appUserId,
      })
      .eq('id', appUserId);
    if (error) throw errors.internal('Failed to apply tier update', { error });

    ok(res, { applied: true, tier: newTier });
  } catch (err) {
    next(err);
  }
});
