// =============================================================================
// HaloFrame API — print fulfillment
//
// PrintProvider is the extension point. The default StubPrintProvider just
// records the order and notifies you (webhook or email) so you can fulfill
// manually until the real provider's API spec is wired in.
//
// To swap providers later: implement PrintProvider, register it in
// `getPrintProvider()`, no route changes required.
// =============================================================================
import type { PrintOrder, PrintStatus } from '@haloframe/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface SubmitOrderInput {
  order: PrintOrder;
  /** Signed URL pointing at the HD final tribute image */
  imageUrl: string;
}

export interface SubmitOrderResult {
  externalOrderId: string;
  status: PrintStatus;
}

export interface PrintProvider {
  name: string;
  submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult>;
}

// -----------------------------------------------------------------------------
// StubPrintProvider — default. Records order, sends an alert, marks pending.
// -----------------------------------------------------------------------------
class StubPrintProvider implements PrintProvider {
  public readonly name = 'stub';

  async submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
    logger.info(
      {
        orderId: input.order.id,
        productType: input.order.productType,
        userId: input.order.userId,
      },
      'STUB print order received — manual fulfillment required',
    );

    await this.sendAlert(input);

    return {
      externalOrderId: `stub_${input.order.id}`,
      status: 'pending_fulfillment',
    };
  }

  private async sendAlert(input: SubmitOrderInput): Promise<void> {
    const summary = {
      orderId: input.order.id,
      product: input.order.productType,
      address: input.order.shippingAddress,
      tributeId: input.order.tributeId,
      imageUrl: input.imageUrl,
      priceCents: input.order.priceCents,
    };

    if (env.PRINT_ALERT_WEBHOOK_URL) {
      try {
        await fetch(env.PRINT_ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text: `🖼️ New HaloFrame print order needs fulfillment`,
            order: summary,
          }),
        });
      } catch (err) {
        logger.warn({ err }, 'failed to send print alert webhook');
      }
    } else {
      logger.warn(
        summary,
        'no PRINT_ALERT_WEBHOOK_URL configured — print order needs manual lookup',
      );
    }
  }
}

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------
let cachedProvider: PrintProvider | null = null;

export function getPrintProvider(): PrintProvider {
  if (!cachedProvider) {
    cachedProvider = new StubPrintProvider();
  }
  return cachedProvider;
}
