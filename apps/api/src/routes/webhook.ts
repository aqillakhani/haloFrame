// =============================================================================
// HaloFrame API — /api/webhook (Stripe) (Phase F)
//
// Stripe retries aggressively on non-2xx responses, so this handler is
// idempotent on `event.id` via the `credit_ledger.revenuecat_event_id`
// unique index (the column is repurposed as a general payment-event key).
// The route is mounted BEFORE the JSON body parser at the app-level —
// Stripe's signature verification needs the raw request body.
// =============================================================================
import { Router, raw } from 'express';
import type Stripe from 'stripe';
import { logger } from '../config/logger.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';
import { supabaseAdmin } from '../config/supabase.js';
import { parseWebhookEvent } from '../services/stripe.js';
import {
  sendCanvasOrderNotification,
  sendCustomerReceipt,
} from '../services/email.js';

export const webhookRouter = Router();

// `express.raw` is mandatory — Stripe's signature covers the exact bytes
// of the request body. If we parsed JSON first, the bytes would be rebuilt
// and the signature would fail.
webhookRouter.post(
  '/stripe',
  raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      const sig = req.get('stripe-signature');
      if (!sig) throw errors.invalidRequest('Missing stripe-signature header');
      const event = parseWebhookEvent({
        rawBody: req.body as Buffer,
        signature: sig,
      });
      logger.info({ eventId: event.id, type: event.type }, '[stripe:webhook] received');

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutCompleted(event.id, session);
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(event.type, sub);
          break;
        }
        default:
          logger.info({ type: event.type }, '[stripe:webhook] ignored');
      }
      ok(res, { received: true });
    } catch (err) {
      logger.error({ err }, '[stripe:webhook] handler failed');
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// Event handlers
// -----------------------------------------------------------------------------

async function handleCheckoutCompleted(
  eventId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const kind = session.metadata?.kind;
  const userId =
    session.metadata?.userId ??
    (typeof session.client_reference_id === 'string' ? session.client_reference_id : null);
  if (!userId) {
    logger.warn({ sessionId: session.id }, '[stripe:checkout.completed] missing userId');
    return;
  }

  if (kind === 'canvas_print') {
    await fulfillCanvasPrint(eventId, session, userId);
    return;
  }

  // Default path: subscription or top-up. Grant credits via the existing RPC.
  const planId = session.metadata?.planId;
  if (!planId) {
    logger.warn({ sessionId: session.id }, '[stripe:checkout.completed] missing planId metadata');
    return;
  }
  await grantCreditsForPlan(eventId, userId, planId, session);
}

async function fulfillCanvasPrint(
  eventId: string,
  session: Stripe.Checkout.Session,
  userId: string,
): Promise<void> {
  const tributeId = session.metadata?.tributeId ?? null;
  const size = session.metadata?.canvasSize ?? 'unknown';
  const amountUsd = (session.amount_total ?? 0) / 100;
  const shipping = session.collected_information?.shipping_details ?? null;
  const address = shipping?.address ?? null;
  const customerPhone = (session.customer_details?.phone ?? null) as string | null;
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? '';

  // Look up the HD signed URL for the fulfillment email. Falls back to null
  // if the tribute is gone or never had an HD.
  let hdImageUrl: string | null = null;
  if (tributeId) {
    try {
      const { data } = await supabaseAdmin
        .from('tributes')
        .select('state')
        .eq('id', tributeId)
        .maybeSingle<{ state: { finalPhotoHdUrl?: string | null; finalPhotoUrl?: string | null } }>();
      const path = data?.state?.finalPhotoHdUrl ?? data?.state?.finalPhotoUrl ?? null;
      if (path) {
        const { data: signed } = await supabaseAdmin.storage
          .from('tributes-final')
          .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
        hdImageUrl = signed?.signedUrl ?? null;
      }
    } catch (err) {
      logger.warn({ err, tributeId }, '[stripe:webhook] failed to resolve HD asset');
    }
  }

  await sendCanvasOrderNotification({
    paymentId: session.payment_intent as string ?? session.id,
    tributeId: tributeId ?? 'unknown',
    canvasSize: size,
    amountUsd,
    customerEmail,
    shippingName: shipping?.name ?? null,
    shippingLine1: address?.line1 ?? null,
    shippingLine2: address?.line2 ?? null,
    shippingCity: address?.city ?? null,
    shippingState: address?.state ?? null,
    shippingPostalCode: address?.postal_code ?? null,
    shippingCountry: address?.country ?? null,
    customerPhone,
    hdImageUrl,
  });

  if (customerEmail) {
    await sendCustomerReceipt({
      to: customerEmail,
      subject: `Your haloFrame canvas is on the way`,
      summaryLine: `We received your order for a ${size} canvas and will reach out with tracking within two business days.`,
      amountUsd,
    });
  }

  // Record the fulfillment intent in the credit ledger (idempotent by event id).
  await supabaseAdmin.from('credit_ledger').insert({
    user_id: userId,
    amount: 0,
    action: 'print_order',
    revenuecat_event_id: eventId,
    metadata: {
      tribute_id: tributeId,
      canvas_size: size,
      amount_usd: amountUsd,
      stripe_session_id: session.id,
    },
  }).then(({ error }) => {
    if (error && !String(error.message).includes('duplicate key')) {
      logger.warn({ error }, '[stripe:webhook] ledger insert warning');
    }
  });
}

async function grantCreditsForPlan(
  eventId: string,
  userId: string,
  planId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  // Map planId → credit count (kept in sync with project_pricing_strategy.md).
  const grantMap: Record<string, { credits: number; bucket: 'monthly' | 'topup' }> = {
    keepsake_monthly: { credits: 5, bucket: 'monthly' },
    heritage_monthly: { credits: 20, bucket: 'monthly' },
    heritage_annual: { credits: 240, bucket: 'monthly' },
    topup_single: { credits: 1, bucket: 'topup' },
    topup_4pack: { credits: 4, bucket: 'topup' },
  };
  const config = grantMap[planId];
  if (!config) {
    logger.warn({ planId, userId }, '[stripe:webhook] unknown plan');
    return;
  }

  const { error } = await supabaseAdmin.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: config.credits,
    p_bucket: config.bucket,
    p_event_id: eventId,
    p_plan_id: planId,
  });
  if (error) {
    // Idempotency: the ledger's unique index rejects a replayed event. That's
    // fine — log at info and move on.
    if (String(error.message).includes('duplicate key')) {
      logger.info({ eventId }, '[stripe:webhook] duplicate event ignored');
      return;
    }
    logger.error({ error, userId, planId }, '[stripe:webhook] grant_credits failed');
    throw errors.internal('grant_credits RPC failed', { error });
  }

  const customerEmail = session.customer_details?.email ?? session.customer_email ?? '';
  if (customerEmail) {
    await sendCustomerReceipt({
      to: customerEmail,
      subject: `Your haloFrame membership is active`,
      summaryLine: `We've added ${config.credits} tributes to your account.`,
      amountUsd: (session.amount_total ?? 0) / 100,
    });
  }
}

async function handleSubscriptionChange(
  eventType: Stripe.Event.Type,
  sub: Stripe.Subscription,
): Promise<void> {
  const userId = (sub.metadata?.userId ?? null) as string | null;
  const planId = (sub.metadata?.planId ?? null) as string | null;
  if (!userId) return;

  const status = sub.status;
  const cancelled =
    eventType === 'customer.subscription.deleted' || status === 'canceled';

  // Stripe's `Subscription` type exposes `current_period_end` as a unix
  // timestamp on live responses, but the generated TS shape omits it in
  // recent SDK versions. Access it defensively without `any` by narrowing
  // to a record lookup.
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  await supabaseAdmin
    .from('profiles')
    .update({
      plan_id: cancelled ? 'free' : planId ?? 'free',
      renews_on: typeof periodEnd === 'number'
        ? new Date(periodEnd * 1000).toISOString()
        : null,
    })
    .eq('id', userId);
}
