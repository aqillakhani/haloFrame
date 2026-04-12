// =============================================================================
// EternalFrame API server entry point
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
    service: 'eternalframe-api',
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
// Full-product routes — only mounted when Supabase credentials are present.
// Avoids startup crashes when running in spike-only mode.
// -----------------------------------------------------------------------------
if (!env.isSpikeMode && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  // Lazy-load so spike mode never imports the Supabase-dependent route modules
  const { tributeRouter } = await import('./routes/tribute.js');
  const { templatesRouter } = await import('./routes/templates.js');
  const { subscriptionRouter } = await import('./routes/subscription.js');
  const { printRouter } = await import('./routes/print.js');

  app.use('/api/tribute', tributeRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/subscription', subscriptionRouter);
  app.use('/api/print', printRouter);
  logger.info('Full-product routes mounted');
} else {
  logger.warn('Running in SPIKE-ONLY mode — only /api/spike/* routes are mounted');
}

app.use(errorHandler);

app.listen(env.API_PORT, () => {
  logger.info(`EternalFrame API listening on port ${env.API_PORT}`);
});
