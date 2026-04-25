// =============================================================================
// HaloFrame API — /api/report
//
// User-side reporting flow required by Google AI Content Policy. Records the
// report in `reports` (full audit trail) and tags `tributes.flagged_at` so
// flagged tributes can be filtered out of any future shared/community views.
//
// Auth: requires a signed-in user. The report's `user_id` is the reporter,
// not the tribute owner. RLS on `reports` is service-role-only — clients
// never read this table directly.
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { ok, fail } from '../lib/response.js';

const reportSchema = z.object({
  tributeId: z.string().uuid(),
  reason: z.enum(['inappropriate', 'misuse', 'wrong_person', 'quality', 'other']),
  note: z.string().max(2000).optional(),
});

export const reportRouter = Router();

reportRouter.post('/', async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(
      res,
      400,
      'invalid_request',
      'Invalid report body',
      parsed.error.issues,
    );
  }

  const { tributeId, reason, note } = parsed.data;
  // Auth middleware (or test stub) sets req.user. Without it, treat as
  // unauthenticated — the migration's NOT NULL on reports.user_id makes
  // anonymous reporting impossible at the DB level anyway.
  const userId = req.user?.id;
  if (!userId) {
    return fail(res, 401, 'unauthenticated', 'Sign in to report a tribute');
  }

  try {
    const { error: insertErr } = await supabaseAdmin.from('reports').insert({
      tribute_id: tributeId,
      user_id: userId,
      reason,
      note: note ?? null,
    });
    if (insertErr) throw insertErr;

    const updateChain = supabaseAdmin
      .from('tributes')
      .update({
        flagged_at: new Date().toISOString(),
        flagged_reason: reason,
      });
    const { error: updateErr } = await updateChain.eq('id', tributeId);
    if (updateErr) throw updateErr;

    Sentry.captureMessage(`tribute reported: ${tributeId} (${reason})`, 'info');
    logger.info({ tributeId, reason, userId }, 'tribute reported');
    return ok(res, { reported: true }, 201);
  } catch (err) {
    logger.error({ err, tributeId }, '[report] insert/update failed');
    Sentry.captureException(err);
    return fail(res, 500, 'internal_error', 'Report submission failed');
  }
});
