// =============================================================================
// HaloFrame API — /api/prints (Phase F)
//
// Canvas-print checkout endpoint. Returns a Stripe Checkout Session URL
// scoped to the user's tribute + chosen size. The webhook handler (see
// routes/webhook.ts) emails both the fulfillment inbox + the customer on
// `checkout.session.completed`.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { ERROR_CODES } from '@haloframe/shared';
import { errors, ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import {
  createPrintCheckout,
  isStripeConfigured,
} from '../services/stripe.js';

export const printsRouter = Router();

const checkoutSchema = z.object({
  tributeId: z.string().uuid(),
  size: z.enum(['12x16', '18x24', '24x36', '36x48']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

printsRouter.post(
  '/checkout',
  requireAuth,
  validateBody(checkoutSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { tributeId, size } = req.body as z.infer<typeof checkoutSchema>;

      // Ownership check: confirm the tribute actually belongs to this user
      // before burning a Stripe Checkout create call.
      const { data: tribute, error: tErr } = await supabaseAdmin
        .from('tributes')
        .select('id')
        .eq('id', tributeId)
        .eq('user_id', userId)
        .maybeSingle();
      if (tErr || !tribute) {
        throw errors.tributeNotFound();
      }

      if (!isStripeConfigured()) {
        logger.info({ userId, tributeId, size }, 'print checkout requested without Stripe');
        throw new ApiError(
          ERROR_CODES.INVALID_REQUEST,
          'Canvas checkout is not yet available on this environment.',
          501,
          { code: 'web_checkout_not_configured' },
        );
      }

      const body = req.body as z.infer<typeof checkoutSchema>;
      const origin =
        req.get('origin') ?? req.get('referer') ?? 'http://localhost:5187';
      const session = await createPrintCheckout({
        userId,
        tributeId,
        size,
        successUrl: body.successUrl ?? `${origin}/?print=success`,
        cancelUrl: body.cancelUrl ?? `${origin}/?print=cancel`,
        customerEmail: req.user!.email ?? undefined,
      });

      ok(res, { checkoutUrl: session.url, sessionId: session.id });
    } catch (err) {
      next(err);
    }
  },
);
