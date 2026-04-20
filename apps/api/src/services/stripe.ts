// =============================================================================
// HaloFrame API — Stripe client + helpers (Phase F)
//
// All Stripe access lives here so the routes can stay slim. Throws
// `errors.notConfigured()` if `STRIPE_SECRET_KEY` is absent so routes can
// branch on that and return a well-shaped 501 instead of a stack trace.
// =============================================================================
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { errors } from '../lib/errors.js';

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw errors.invalidRequest('Stripe is not configured on this server');
  }
  if (!cached) {
    cached = new Stripe(env.STRIPE_SECRET_KEY!, {
      typescript: true,
    });
  }
  return cached;
}

export type StripePlanId =
  | 'keepsake_monthly'
  | 'heritage_monthly'
  | 'heritage_annual'
  | 'topup_single'
  | 'topup_4pack';

export type CanvasSize = '12x16' | '18x24' | '24x36' | '36x48';

/** Map internal plan ids to env-resolved Stripe price IDs. */
export function priceIdForPlan(planId: StripePlanId): string | null {
  switch (planId) {
    case 'keepsake_monthly':
      return env.STRIPE_PRICE_KEEPSAKE ?? null;
    case 'heritage_monthly':
      return env.STRIPE_PRICE_HERITAGE_MONTHLY ?? null;
    case 'heritage_annual':
      return env.STRIPE_PRICE_HERITAGE_ANNUAL ?? null;
    case 'topup_single':
      return env.STRIPE_PRICE_TOPUP_SINGLE ?? null;
    case 'topup_4pack':
      return env.STRIPE_PRICE_TOPUP_4PACK ?? null;
  }
}

export function priceIdForCanvas(size: CanvasSize): string | null {
  switch (size) {
    case '12x16':
      return env.STRIPE_PRICE_CANVAS_12X16 ?? null;
    case '18x24':
      return env.STRIPE_PRICE_CANVAS_18X24 ?? null;
    case '24x36':
      return env.STRIPE_PRICE_CANVAS_24X36 ?? null;
    case '36x48':
      return env.STRIPE_PRICE_CANVAS_36X48 ?? null;
  }
}

export function isSubscriptionPlan(planId: StripePlanId): boolean {
  return (
    planId === 'keepsake_monthly' ||
    planId === 'heritage_monthly' ||
    planId === 'heritage_annual'
  );
}

/**
 * Create a Checkout Session for a subscription or one-time purchase.
 * `clientReferenceId` is the haloFrame user_id so the webhook can bind the
 * Stripe customer back to our profile.
 */
export async function createSubscriptionCheckout(args: {
  userId: string;
  planId: StripePlanId;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}): Promise<{ url: string; id: string }> {
  const stripe = getStripe();
  const priceId = priceIdForPlan(args.planId);
  if (!priceId) {
    throw errors.invalidRequest(`Stripe price id not configured for ${args.planId}`);
  }
  const session = await stripe.checkout.sessions.create({
    mode: isSubscriptionPlan(args.planId) ? 'subscription' : 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    client_reference_id: args.userId,
    customer_email: args.customerEmail,
    metadata: {
      userId: args.userId,
      planId: args.planId,
      kind: 'subscription_or_topup',
    },
    subscription_data: isSubscriptionPlan(args.planId)
      ? {
          metadata: { userId: args.userId, planId: args.planId },
        }
      : undefined,
  });
  if (!session.url) {
    throw errors.internal('Stripe returned a session without a URL', { session });
  }
  return { url: session.url, id: session.id };
}

/**
 * Create a Checkout Session for a canvas print. Uses Stripe's built-in
 * shipping-address collection so we don't have to build our own form.
 */
export async function createPrintCheckout(args: {
  userId: string;
  tributeId: string;
  size: CanvasSize;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}): Promise<{ url: string; id: string }> {
  const stripe = getStripe();
  const priceId = priceIdForCanvas(args.size);
  if (!priceId) {
    throw errors.invalidRequest(`Stripe price id not configured for canvas ${args.size}`);
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    client_reference_id: args.userId,
    customer_email: args.customerEmail,
    shipping_address_collection: {
      // US-only for launch; user can expand post-launch.
      allowed_countries: ['US'],
    },
    phone_number_collection: { enabled: true },
    metadata: {
      userId: args.userId,
      tributeId: args.tributeId,
      canvasSize: args.size,
      kind: 'canvas_print',
    },
  });
  if (!session.url) {
    throw errors.internal('Stripe returned a session without a URL', { session });
  }
  return { url: session.url, id: session.id };
}

/**
 * Verify + parse a Stripe webhook payload. Throws on bad signature.
 * Caller must pass the **raw** request body (Buffer or string), not the
 * JSON-parsed object — Stripe's signature covers the raw bytes.
 */
export function parseWebhookEvent(args: {
  rawBody: string | Buffer;
  signature: string;
}): Stripe.Event {
  const stripe = getStripe();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw errors.invalidRequest('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return stripe.webhooks.constructEvent(
    args.rawBody,
    args.signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
}
