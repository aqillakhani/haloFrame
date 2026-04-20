// =============================================================================
// HaloFrame API — /api/subscription
//
// GET  /status    — SubscriptionSnapshot for the signed-in user (auth required)
// POST /purchase  — start a checkout session for a plan or top-up (auth required)
// POST /webhook   — RevenueCat webhook receiver (shared-secret header auth)
//
// Replaces the 2026-04 5-tier quota wiring with the credit-ledger model
// (see supabase/migrations/20260418000001_credit_ledger.sql and
// memory/project_pricing_strategy.md). Every grant and every spend lands
// in the `credit_ledger` table; idempotency is enforced by the unique index
// on `revenuecat_event_id`, so replayed webhooks cannot double-grant.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import {
  ERROR_CODES,
  SUBSCRIPTION_PLANS_UI,
  type SubscriptionSnapshot,
} from '@haloframe/shared';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';
import { ApiError } from '../lib/errors.js';
import { loadCreditSnapshot } from '../services/entitlements.js';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { validateBody } from '../middleware/validate.js';
import {
  createSubscriptionCheckout,
  isStripeConfigured,
  getStripe,
} from '../services/stripe.js';

export const subscriptionRouter = Router();

// -----------------------------------------------------------------------------
// GET /status
// -----------------------------------------------------------------------------
subscriptionRouter.get('/status', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const snapshot: SubscriptionSnapshot = await loadCreditSnapshot(userId);
    ok(res, snapshot);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /purchase
//
// MVP scaffold for the checkout flow. Native clients (iOS/Android) surface
// the in-app-purchase UI themselves via the RevenueCat SDK — they do NOT
// hit this endpoint; the purchase confirmation flows back through the
// /webhook handler below.
//
// Web clients need a server-initiated checkout (Stripe-backed through
// RevenueCat Billing or a direct Stripe integration). Until that's wired,
// this endpoint validates the plan ID, confirms the user is authenticated,
// and returns HTTP 501 with a structured code the Paywall screen can
// recognize. The return shape already matches what the real flow will
// emit (a redirect URL), so the web side can be written against the
// final contract right now.
// -----------------------------------------------------------------------------
const purchaseSchema = z.object({
  planId: z.enum([
    'keepsake_monthly',
    'heritage_monthly',
    'heritage_annual',
    'topup_4pack',
    'topup_single',
  ]),
  platform: z.enum(['web', 'ios', 'android']).default('web'),
  /**
   * Absolute URLs the checkout session returns to. Only consulted on web;
   * ignored on native. Client provides these so Stripe (or RC Billing)
   * knows where to bounce the user after success/cancel.
   */
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

subscriptionRouter.post(
  '/purchase',
  requireAuth,
  validateBody(purchaseSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { planId, platform } = req.body as z.infer<typeof purchaseSchema>;

      const plan = SUBSCRIPTION_PLANS_UI.find((p) => p.id === planId);
      if (!plan) throw errors.invalidRequest(`Unknown planId: ${planId}`);

      if (platform === 'ios' || platform === 'android') {
        // Native SDK-initiated purchases don't round-trip through this
        // endpoint — RevenueCat's IAP flow completes on-device and its
        // webhook lands at /webhook. Reject so a mis-wired native client
        // gets a clear signal instead of a silent success.
        throw errors.invalidRequest(
          'Native purchases are handled by the RevenueCat SDK, not this endpoint',
        );
      }

      // Web: once Stripe / RevenueCat Billing is configured we'll create
      // a checkout session here and return its URL. Until then, 501 lets
      // the PaywallScreen show a "coming soon on web — use iOS/Android"
      // message without falsely claiming success.
      if (!isStripeConfigured()) {
        logger.info(
          { userId, planId, platform },
          'purchase requested but Stripe is not configured',
        );
        throw new ApiError(
          ERROR_CODES.INVALID_REQUEST,
          'Web checkout is not yet available. Please use the iOS or Android app to subscribe.',
          501,
          { code: 'web_checkout_not_configured', planId },
        );
      }

      const body = req.body as z.infer<typeof purchaseSchema>;
      const origin = req.get('origin') ?? req.get('referer') ?? 'http://localhost:5173';
      const success =
        body.successUrl ??
        `${origin}/?purchase=success`;
      const cancel =
        body.cancelUrl ?? `${origin}/?purchase=cancel`;
      const session = await createSubscriptionCheckout({
        userId,
        planId: planId as
          | 'keepsake_monthly'
          | 'heritage_monthly'
          | 'heritage_annual'
          | 'topup_single'
          | 'topup_4pack',
        successUrl: success,
        cancelUrl: cancel,
        customerEmail: req.user!.email ?? undefined,
      });
      ok(res, { checkoutUrl: session.url, sessionId: session.id });
      return;
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// Product → plan mapping
//
// Subscription products grant `credits` on initial purchase and on each
// renewal, and set `planId` + `renewsOn` on the profile. Non-renewing
// top-ups grant `credits` into the `topup_credits_remaining` bucket with a
// 90-day expiry window.
//
// Product IDs match the RevenueCat dashboard config documented in
// memory/project_pricing_strategy.md.
// -----------------------------------------------------------------------------
interface SubscriptionPlanConfig {
  planId: SubscriptionSnapshot['planId'];
  creditsPerPeriod: number;
  periodDays: number;
}

const SUBSCRIPTION_PRODUCTS: Record<string, SubscriptionPlanConfig> = {
  haloframe_keepsake_monthly: {
    planId: 'keepsake_monthly',
    creditsPerPeriod: 5,
    periodDays: 30,
  },
  haloframe_heritage_monthly: {
    planId: 'heritage_monthly',
    creditsPerPeriod: 20,
    periodDays: 30,
  },
  // Annual plan refreshes the credit pool monthly (per pricing strategy:
  // 20/mo × 12 = 240/yr). `renewsOn` still reflects the ANNUAL billing
  // anniversary; the monthly cadence is a separate refresh event that
  // RevenueCat does not emit, so the cron in a follow-up session will
  // drive monthly refreshes for annual holders. MVP behavior: grant
  // one month's worth on INITIAL_PURCHASE/RENEWAL, and rely on the cron
  // for intermediate monthly bumps.
  haloframe_heritage_annual: {
    planId: 'heritage_annual',
    creditsPerPeriod: 20,
    periodDays: 365,
  },
};

interface TopupProductConfig {
  credits: number;
  expiresInDays: number;
}

// Every top-up bucket gets a 90-day expiry regardless of product to keep
// the single-bucket semantics simple. Pricing strategy flagged "—" for
// single but didn't specify non-expiring; treating it as 90d here and
// documenting on the paywall is the cleanest trade-off for now.
const TOPUP_PRODUCTS: Record<string, TopupProductConfig> = {
  haloframe_topup_4pack: { credits: 4, expiresInDays: 90 },
  haloframe_topup_single: { credits: 1, expiresInDays: 90 },
};

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[];
  expiration_at_ms?: number;
  purchased_at_ms?: number;
}

// RevenueCat terminal / no-op event types we treat as "no credit change".
// EXPIRATION and CANCELLATION are logged but don't revoke already-granted
// credits — users keep what they paid for through the end of the period.
// PRODUCT_CHANGE is handled by the renewal that follows it.
const IGNORE_EVENT_TYPES = new Set([
  'CANCELLATION',
  'UNCANCELLATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'PRODUCT_CHANGE',
  'EXPIRATION',
  'TRANSFER',
]);

// -----------------------------------------------------------------------------
// POST /webhook
// -----------------------------------------------------------------------------
subscriptionRouter.post('/webhook', async (req, res, next) => {
  try {
    if (env.REVENUECAT_WEBHOOK_AUTH_HEADER) {
      const header = req.headers.authorization;
      if (header !== env.REVENUECAT_WEBHOOK_AUTH_HEADER) {
        throw errors.unauthenticated('Invalid webhook signature');
      }
    }

    const event = req.body?.event as RevenueCatEvent | undefined;
    if (!event) {
      throw errors.invalidRequest('Missing event payload');
    }

    const userId = event.app_user_id;
    if (!userId) {
      throw errors.invalidRequest('Missing app_user_id');
    }

    const eventType = event.type ?? '';
    const eventId = event.id;
    const productId = event.product_id;

    if (IGNORE_EVENT_TYPES.has(eventType)) {
      logger.info({ eventType, eventId, userId }, 'revenuecat: ignoring event');
      ok(res, { applied: false, reason: `ignored:${eventType}` });
      return;
    }

    // INITIAL_PURCHASE or RENEWAL of a subscription
    if (
      (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL') &&
      productId &&
      SUBSCRIPTION_PRODUCTS[productId]
    ) {
      const plan = SUBSCRIPTION_PRODUCTS[productId];
      const renewsOn = event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : new Date(Date.now() + plan.periodDays * 86_400_000).toISOString();

      const { error, data } = await supabaseAdmin.rpc('grant_credits', {
        p_user_id: userId,
        p_amount: plan.creditsPerPeriod,
        p_action: eventType === 'INITIAL_PURCHASE' ? 'signup_grant' : 'monthly_refresh',
        p_plan_id: plan.planId,
        p_renews_on: renewsOn,
        p_topup_expires_at: null,
        p_revenuecat_event_id: eventId ?? null,
      });
      if (error) throw errors.internal('Failed to grant subscription credits', { error });

      // Heritage Annual: RevenueCat only re-fires at the annual anniversary,
      // but the plan delivers 20 credits per MONTH. Hand off to the
      // run_annual_monthly_refresh pg_cron job by stamping the next monthly
      // trigger 30 days from the event that just landed.
      if (plan.planId === 'heritage_annual') {
        const nextMonthly = new Date(Date.now() + 30 * 86_400_000).toISOString();
        const { error: refreshErr } = await supabaseAdmin
          .from('profiles')
          .update({ monthly_refresh_at: nextMonthly })
          .eq('id', userId);
        if (refreshErr) {
          logger.error(
            { err: refreshErr, userId },
            'failed to set monthly_refresh_at for heritage_annual',
          );
          // Non-fatal: credits were granted. The cron will no-op until this
          // column gets set on a later event or manual backfill.
        }
      }

      logger.info(
        { eventType, eventId, userId, planId: plan.planId, creditsAfter: data },
        'revenuecat: subscription credits granted',
      );
      ok(res, { applied: true, planId: plan.planId, creditsAfter: data });
      return;
    }

    // NON_RENEWING_PURCHASE = top-up
    if (
      eventType === 'NON_RENEWING_PURCHASE' &&
      productId &&
      TOPUP_PRODUCTS[productId]
    ) {
      const topup = TOPUP_PRODUCTS[productId];
      const expiresAt = new Date(
        Date.now() + topup.expiresInDays * 86_400_000,
      ).toISOString();

      const { error, data } = await supabaseAdmin.rpc('grant_credits', {
        p_user_id: userId,
        p_amount: topup.credits,
        p_action: 'topup_purchase',
        p_plan_id: null,
        p_renews_on: null,
        p_topup_expires_at: expiresAt,
        p_revenuecat_event_id: eventId ?? null,
      });
      if (error) throw errors.internal('Failed to grant top-up credits', { error });

      logger.info(
        { eventType, eventId, userId, productId, creditsAfter: data },
        'revenuecat: top-up credits granted',
      );
      ok(res, { applied: true, productId, creditsAfter: data });
      return;
    }

    // Unknown product or unhandled event — don't error out (RevenueCat
    // retries on non-2xx), just log and acknowledge.
    logger.warn(
      { eventType, eventId, userId, productId },
      'revenuecat: no handler for event',
    );
    ok(res, { applied: false, reason: 'no_handler' });
  } catch (err) {
    next(err);
  }
});
