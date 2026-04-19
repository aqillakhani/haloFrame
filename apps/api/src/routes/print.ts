// =============================================================================
// HaloFrame API — /api/print
//
// Phase 4 — fulfillment is currently stubbed via StubPrintProvider. The route
// records a paid order, alerts the operator, and returns a confirmation. When
// the real provider's API spec arrives, swap StubPrintProvider in services/print.ts.
// =============================================================================
import { Router } from 'express';
import {
  PRINT_PRODUCTS,
  createPrintOrderRequestSchema,
  type PrintOrder,
  type PrintProductType,
} from '@haloframe/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getPrintProvider } from '../services/print.js';
import { createSourceSignedUrl } from '../services/storage.js';

export const printRouter = Router();

printRouter.get('/products', (_req, res) => {
  ok(res, { products: PRINT_PRODUCTS });
});

printRouter.use(requireAuth);

printRouter.post(
  '/order',
  validateBody(createPrintOrderRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { tributeId, productType, shippingAddress, stripePaymentIntentId } =
        req.body as ReturnType<typeof createPrintOrderRequestSchema.parse>;

      const product = PRINT_PRODUCTS.find((p) => p.type === productType);
      if (!product) throw errors.invalidRequest('Unknown product type');

      // Verify the tribute belongs to this user and has a final image
      const { data: tribute, error: tErr } = await supabaseAdmin
        .from('tributes')
        .select('*')
        .eq('id', tributeId)
        .eq('user_id', userId)
        .single<{
          id: string;
          state: { templatedPhotoUrl: string | null; finalPhotoHdUrl: string | null };
        }>();
      if (tErr || !tribute) throw errors.tributeNotFound();

      const sourcePath =
        tribute.state.finalPhotoHdUrl ?? tribute.state.templatedPhotoUrl;
      if (!sourcePath) {
        throw errors.invalidRequest('Tribute has no final image to print');
      }

      // Insert the order row
      const { data: orderRow, error: insertErr } = await supabaseAdmin
        .from('print_orders')
        .insert({
          user_id: userId,
          tribute_id: tributeId,
          print_product_type: productType,
          print_status: 'pending_fulfillment',
          shipping_address: shippingAddress,
          price_cents: product.priceCents,
          stripe_payment_intent_id: stripePaymentIntentId,
        })
        .select('*')
        .single();
      if (insertErr || !orderRow) {
        throw errors.internal('Failed to create print order', { insertErr });
      }

      const order: PrintOrder = {
        id: orderRow.id,
        userId: orderRow.user_id,
        tributeId: orderRow.tribute_id,
        productType: orderRow.print_product_type as PrintProductType,
        printStatus: orderRow.print_status,
        externalOrderId: orderRow.external_order_id,
        shippingAddress: orderRow.shipping_address,
        priceCents: orderRow.price_cents,
        createdAt: orderRow.created_at,
      };

      // Submit to the (stubbed) print provider
      const imageUrl = await createSourceSignedUrl(sourcePath);
      const provider = getPrintProvider();
      const result = await provider.submitOrder({ order, imageUrl });

      const { data: updated } = await supabaseAdmin
        .from('print_orders')
        .update({
          external_order_id: result.externalOrderId,
          print_status: result.status,
        })
        .eq('id', order.id)
        .select('*')
        .single();

      ok(res, { order: updated ?? orderRow }, 201);
    } catch (err) {
      next(err);
    }
  },
);

printRouter.get('/order/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const orderId = req.params.id!;
    const { data, error } = await supabaseAdmin
      .from('print_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();
    if (error || !data) throw errors.invalidRequest('Order not found');
    ok(res, { order: data });
  } catch (err) {
    next(err);
  }
});
