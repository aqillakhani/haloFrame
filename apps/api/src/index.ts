// =============================================================================
// HaloFrame API server entry point
// =============================================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { spikeRouter } from './routes/spike.js';

const app = express();

const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '4mb' }));
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'haloframe-api',
    env: env.NODE_ENV,
    spikeMode: env.isSpikeMode,
  });
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

  app.use('/api/tribute', tributeRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/print', printRouter);
  logger.info('Full-product routes mounted');
} else if (env.isSpikeMode) {
  logger.warn('SPIKE_MODE=true — /api/tribute, /api/templates, /api/print not mounted');
}

app.use(errorHandler);

app.listen(env.API_PORT, () => {
  logger.info(`HaloFrame API listening on port ${env.API_PORT}`);
});
