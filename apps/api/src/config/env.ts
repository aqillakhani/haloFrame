// =============================================================================
// HaloFrame API — environment variable loading & validation
//
// Two modes:
//   - Spike mode (SPIKE_MODE=true) — only FAL_KEY is required, Supabase
//     is optional. Used for the web test harness.
//   - Full mode (default) — all credentials required for production routes.
// =============================================================================
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the monorepo root, not from apps/api/ cwd
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootEnvPath = resolve(__dirname, '..', '..', '..', '..', '.env');
loadDotenv({ path: rootEnvPath });

const isSpikeMode = process.env.SPIKE_MODE === 'true';

/** Treat empty strings as "not set" for optional fields. */
function emptyToUndefined<T extends z.ZodTypeAny>(inner: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.optional(inner),
  );
}

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SPIKE_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // fal.ai — required in both modes
  FAL_KEY: z.string().min(1, 'FAL_KEY is required'),

  // Supabase — required in full mode, optional in spike mode
  SUPABASE_URL: isSpikeMode ? z.string().url().optional() : z.string().url(),
  SUPABASE_ANON_KEY: isSpikeMode ? z.string().optional() : z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: isSpikeMode ? z.string().optional() : z.string().min(1),

  // Optional everywhere — empty strings are treated as absent
  REVENUECAT_SECRET_KEY: emptyToUndefined(z.string()),
  REVENUECAT_WEBHOOK_AUTH_HEADER: emptyToUndefined(z.string()),
  STRIPE_SECRET_KEY: emptyToUndefined(z.string()),
  STRIPE_WEBHOOK_SECRET: emptyToUndefined(z.string()),
  STRIPE_PUBLISHABLE_KEY: emptyToUndefined(z.string()),
  STRIPE_PRICE_KEEPSAKE: emptyToUndefined(z.string()),
  STRIPE_PRICE_HERITAGE_MONTHLY: emptyToUndefined(z.string()),
  STRIPE_PRICE_HERITAGE_ANNUAL: emptyToUndefined(z.string()),
  STRIPE_PRICE_TOPUP_SINGLE: emptyToUndefined(z.string()),
  STRIPE_PRICE_TOPUP_4PACK: emptyToUndefined(z.string()),
  STRIPE_PRICE_CANVAS_12X16: emptyToUndefined(z.string()),
  STRIPE_PRICE_CANVAS_18X24: emptyToUndefined(z.string()),
  STRIPE_PRICE_CANVAS_24X36: emptyToUndefined(z.string()),
  STRIPE_PRICE_CANVAS_36X48: emptyToUndefined(z.string()),
  RESEND_API_KEY: emptyToUndefined(z.string()),
  RESEND_FROM: emptyToUndefined(z.string()),
  ORDER_NOTIFICATION_EMAIL: emptyToUndefined(z.string()),
  PRINT_ALERT_WEBHOOK_URL: emptyToUndefined(z.string().url()),
  PRINT_ALERT_EMAIL: emptyToUndefined(z.string().email()),
  SENTRY_DSN: emptyToUndefined(z.string()),

  // CORS allowlist (comma-separated)
  CORS_ORIGINS: z.string().default('http://localhost:5187'),

  // Dev-only: bypass credit checks (checkCredits, spendCredits, free-tier
  // per-flow gate). IGNORED unless NODE_ENV !== 'production' — see
  // entitlements.ts for the production guard.
  DEV_UNLIMITED_CREDITS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Bypass the pristine-main silhouette restore in /merge. With restore on
  // (legacy default), every output pixel outside the loved-one silhouette is
  // composited from the original main — protective but creates a visible
  // boundary where NB2 painted hair wisps, shadows, or extras get clipped
  // ("box around the loved one"). With restore off, NB2's raw output is the
  // final image; we rely on the prompt's "preserve every existing person"
  // clause for family fidelity. Set to true to test/use the simplified
  // architecture; defaults to false so existing behavior is preserved.
  MERGE_SKIP_RESTORE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const parsed = baseSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write('Invalid environment configuration:\n');
  process.stderr.write(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.stderr.write('\n');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isSpikeMode,
};
export type Env = typeof env;
