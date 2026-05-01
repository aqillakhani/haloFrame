// =============================================================================
// HaloFrame API server entry point
// =============================================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { spikeRouter } from './routes/spike.js';
import { supabaseAdmin } from './config/supabase.js';

// -----------------------------------------------------------------------------
// Sentry (Phase H). Loads as a no-op when SENTRY_DSN is unset so dev + CI
// don't need a project.
// -----------------------------------------------------------------------------
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
  logger.info('Sentry initialized');
}

const app = express();

const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

// Helmet with a modest CSP tuned for the API (no HTML delivery — just headers
// that harden the JSON surface against common mis-use).
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    // The API doesn't serve HTML, so `contentSecurityPolicy: false` is
    // appropriate — the web layer enforces CSP via vercel.json.
    contentSecurityPolicy: false,
  }),
);
app.use(cors({ origin: corsOrigins }));

// Request IDs land in the pino-http log for traceability (pair with
// structured logs to follow a single request through the stack).
app.use((req, _res, next) => {
  const incoming = req.get('x-request-id');
  req.headers['x-request-id'] = incoming ?? randomUUID();
  next();
});

// -----------------------------------------------------------------------------
// Rate limits. Tighter on auth-sensitive routes.
// -----------------------------------------------------------------------------
const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stripe webhook MUST be mounted BEFORE express.json — Stripe's signature
// verification covers the raw bytes of the request body. A late mount would
// have the body parsed as JSON + rebuilt, breaking the signature.
if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const { webhookRouter } = await import('./routes/webhook.js');
  app.use('/api/webhook', webhookRouter);
}

app.use(express.json({ limit: '4mb' }));
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
  }),
);

// -----------------------------------------------------------------------------
// Liveness + readiness probes (Phase H8). Railway / Vercel orchestrators
// poll /healthz; deeper readiness (DB reachability) lands on /readyz.
// -----------------------------------------------------------------------------
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/readyz', async (_req, res) => {
  try {
    // Lightweight DB probe — if Supabase is reachable, we can take traffic.
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const { error } = await supabaseAdmin
        .from('tribute_templates')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (error) throw error;
    }
    res.json({ ok: true, service: 'haloframe-api', env: env.NODE_ENV });
  } catch (err) {
    logger.warn({ err }, '[readyz] not ready');
    res.status(503).json({ ok: false });
  }
});

// Legacy endpoint retained for the smoke script.
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'haloframe-api',
    env: env.NODE_ENV,
    spikeMode: env.isSpikeMode,
  });
});

// Apply rate limits broadly — reads vs writes split by HTTP method so GETs
// (balance badge, list) aren't bottlenecked behind the stricter write cap.
app.use('/api', (req, _res, next) => {
  const handler = req.method === 'GET' ? readLimiter : writeLimiter;
  handler(req as Parameters<typeof handler>[0], _res as Parameters<typeof handler>[1], next);
});

// -----------------------------------------------------------------------------
// Spike routes — always mounted. No auth, no Supabase, pure fal.ai proxy.
// Used by the web test harness for AI quality validation.
// -----------------------------------------------------------------------------
app.use('/api/spike', spikeRouter);

// -----------------------------------------------------------------------------
// Subscription / credit-ledger routes. Mount whenever Supabase is configured,
// even in SPIKE_MODE, because the spike router now bills credits on final
// renders and merges — so the web needs a real /api/subscription/status to
// power the balance badge regardless of which mode the rest runs in.
// -----------------------------------------------------------------------------
if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const { subscriptionRouter } = await import('./routes/subscription.js');
  app.use('/api/subscription', subscriptionRouter);
  logger.info('Subscription routes mounted (credit ledger active)');
} else {
  logger.warn(
    'Supabase not configured — /api/subscription/* unavailable; credit checks on /api/spike/* will fail.',
  );
}

// -----------------------------------------------------------------------------
// Full-product routes — only mounted outside SPIKE_MODE and when Supabase
// is configured. tribute.ts still uses the legacy 5-tier quota model until
// the Phase 4 cutover.
// -----------------------------------------------------------------------------
if (!env.isSpikeMode && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const { tributeRouter } = await import('./routes/tribute.js');
  const { templatesRouter } = await import('./routes/templates.js');
  const { printRouter } = await import('./routes/print.js');
  const { printsRouter } = await import('./routes/prints.js');
  const { meRouter } = await import('./routes/me.js');
  const { reportRouter } = await import('./routes/report.js');
  const { requireAuth } = await import('./middleware/auth.js');

  app.use('/api/tribute', tributeRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/print', printRouter);
  app.use('/api/prints', printsRouter);
  app.use('/api/me', meRouter);
  // Mount with requireAuth at the app level — the route handler stays
  // testable without needing to stub the supabase auth.getUser call.
  app.use('/api/report', requireAuth, reportRouter);
  logger.info('Full-product routes mounted');
} else if (env.isSpikeMode) {
  logger.warn('SPIKE_MODE=true — /api/tribute, /api/templates, /api/print not mounted');
}

// Sentry express error handler must come before the error-handler chain.
if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(errorHandler);

// Prefer PORT (set dynamically by Railway/Heroku/etc) over API_PORT so the
// container binds to whatever the platform expects without needing config
// changes per environment.
const port = Number.parseInt(process.env.PORT ?? '', 10) || env.API_PORT;
const server = app.listen(port, () => {
  logger.info(`HaloFrame API listening on port ${port}`);
});

// -----------------------------------------------------------------------------
// Graceful shutdown (Phase H9). Drain in-flight requests, give Sentry +
// pino a moment to flush, then exit. Railway sends SIGTERM on redeploy.
// -----------------------------------------------------------------------------
const shutdownTimers: NodeJS.Timeout[] = [];
async function shutdown(signal: string, exitCode: number): Promise<void> {
  logger.info({ signal }, 'shutting down gracefully');
  const forceExit = setTimeout(() => {
    logger.warn('shutdown timed out, forcing exit');
    process.exit(exitCode);
  }, 30_000);
  shutdownTimers.push(forceExit);
  server.close(async () => {
    try {
      if (env.SENTRY_DSN) await Sentry.close(2_000);
    } catch (err) {
      logger.warn({ err }, '[shutdown] Sentry flush failed');
    }
    logger.info('server closed, exiting');
    clearTimeout(forceExit);
    process.exit(exitCode);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
process.on('SIGINT', () => void shutdown('SIGINT', 0));
