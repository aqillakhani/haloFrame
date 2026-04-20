// =============================================================================
// HaloFrame API — email helper (Phase F)
//
// Two delivery modes:
//   - Live: when `RESEND_API_KEY` is set, sends via the Resend REST API.
//   - Log-only: when the key is absent, pretty-prints the would-be email to
//     stderr so integration testing can still exercise the code paths.
//
// Every template returns a Promise that resolves with `{ delivered: bool }`
// so callers can decide whether to surface a UI warning. We never throw on a
// logging-only mode — an unset key is a configuration choice, not an error.
// =============================================================================
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

async function sendViaResend(args: SendArgs): Promise<{ delivered: boolean }> {
  if (!env.RESEND_API_KEY) {
    logger.warn(
      { to: args.to, subject: args.subject },
      '[email] RESEND_API_KEY unset — email not delivered. Payload follows below.',
    );
    // Logging the HTML body is intentional in dev — it's the only visibility
    // the user has into what would've been sent.
    process.stderr.write(`\n[email:stub] TO: ${args.to}\nSUBJECT: ${args.subject}\nBODY:\n${args.html}\n\n`);
    return { delivered: false };
  }
  const from = env.RESEND_FROM ?? 'HaloFrame <orders@haloframe.app>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: args.replyTo,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, '[email] Resend rejected payload');
    return { delivered: false };
  }
  return { delivered: true };
}

// -----------------------------------------------------------------------------
// Order-notification (to fulfillment — the user himself)
// -----------------------------------------------------------------------------
export async function sendCanvasOrderNotification(args: {
  paymentId: string;
  tributeId: string;
  canvasSize: string;
  amountUsd: number;
  customerEmail: string;
  shippingName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  customerPhone: string | null;
  hdImageUrl: string | null;
}): Promise<{ delivered: boolean }> {
  const to = env.ORDER_NOTIFICATION_EMAIL ?? 'aqil.lakhani8@gmail.com';
  const fmt = (v: string | null) => v ?? '—';
  const html = `
    <h1>New canvas print order</h1>
    <p><strong>Stripe payment:</strong> ${fmt(args.paymentId)}</p>
    <p><strong>Tribute:</strong> ${fmt(args.tributeId)}</p>
    <p><strong>Size:</strong> ${fmt(args.canvasSize)}</p>
    <p><strong>Amount:</strong> $${args.amountUsd.toFixed(2)}</p>
    <hr />
    <h2>Ship to</h2>
    <p>
      ${fmt(args.shippingName)}<br />
      ${fmt(args.shippingLine1)}${args.shippingLine2 ? `<br />${args.shippingLine2}` : ''}<br />
      ${fmt(args.shippingCity)}, ${fmt(args.shippingState)} ${fmt(args.shippingPostalCode)}<br />
      ${fmt(args.shippingCountry)}
    </p>
    <p>Customer: ${fmt(args.customerEmail)} ${args.customerPhone ? `· ${args.customerPhone}` : ''}</p>
    <hr />
    <h2>HD download (30-day signed URL)</h2>
    <p>${args.hdImageUrl ? `<a href="${args.hdImageUrl}">${args.hdImageUrl}</a>` : '(not available — check Supabase storage manually)'}</p>
  `;
  return sendViaResend({
    to,
    subject: `haloFrame — canvas order (${args.canvasSize}) · ${fmt(args.paymentId)}`,
    html,
    replyTo: args.customerEmail,
  });
}

// -----------------------------------------------------------------------------
// Customer receipt (to purchaser)
// -----------------------------------------------------------------------------
export async function sendCustomerReceipt(args: {
  to: string;
  subject: string;
  summaryLine: string;
  amountUsd: number;
  detailsHtml?: string;
}): Promise<{ delivered: boolean }> {
  const html = `
    <h1>Thank you.</h1>
    <p>${args.summaryLine}</p>
    <p><strong>Amount:</strong> $${args.amountUsd.toFixed(2)}</p>
    ${args.detailsHtml ?? ''}
    <hr />
    <p style="color:#8a7e6e;font-size:13px;">
      Questions? Just reply to this email — we'll get back to you.
    </p>
  `;
  return sendViaResend({ to: args.to, subject: args.subject, html });
}
