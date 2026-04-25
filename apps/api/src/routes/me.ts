// =============================================================================
// HaloFrame API — /api/me (Phase G)
//
// Self-service endpoints for account data management. Required for GDPR /
// CCPA compliance and for app-store review (the 2024 Apple requirement for
// in-app account deletion).
//
// GET    /api/me/export  — returns a JSON blob with the user's profile +
//                          tributes + ledger for data portability.
// DELETE /api/me         — cascades delete across tributes, storage assets,
//                          ledger rows, and the auth.users row itself.
// =============================================================================
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';
import { logger } from '../config/logger.js';
import { deleteTributeAssets } from '../services/storage.js';

export const meRouter = Router();

meRouter.get('/export', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const [profile, tributes, ledger] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabaseAdmin
        .from('tributes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('credit_ledger')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ]);

    ok(res, {
      generatedAt: new Date().toISOString(),
      user: {
        id: userId,
        email: req.user!.email ?? null,
      },
      profile: profile.data ?? null,
      tributes: tributes.data ?? [],
      creditLedger: ledger.data ?? [],
    });
  } catch (err) {
    next(err);
  }
});

meRouter.delete('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    logger.info({ userId }, '[me:delete] starting account deletion');

    // 1. Enumerate tributes so we can clean their storage assets.
    const { data: tributes, error: listErr } = await supabaseAdmin
      .from('tributes')
      .select('id')
      .eq('user_id', userId);
    if (listErr) throw errors.internal('Failed to list tributes for deletion', { error: listErr });

    // 2. Delete storage assets one tribute at a time. A single failure is
    // logged but doesn't abort — the worst case is orphaned bytes in the
    // bucket which a maintenance sweep can later clean up.
    for (const t of tributes ?? []) {
      try {
        await deleteTributeAssets({ userId, tributeId: t.id });
      } catch (err) {
        logger.warn({ err, tributeId: t.id }, '[me:delete] asset cleanup failed, continuing');
      }
    }

    // 3. DB cleanup. Foreign keys should cascade from auth.users deletion,
    // but some tables (credit_ledger) may not — delete explicitly to be safe.
    //
    // AUDIT 2026-04-25 (app-store-launch): cascade verified for tributes,
    // storage assets, credit_ledger, usage_log, profiles, auth.users. The
    // new `reports` table auto-cascades — its FKs are
    // `tribute_id → tributes(id) ON DELETE CASCADE` and
    // `user_id → auth.users(id) ON DELETE CASCADE` — so deleting either
    // parent here also clears the user's reports.
    await supabaseAdmin.from('tributes').delete().eq('user_id', userId);
    await supabaseAdmin.from('credit_ledger').delete().eq('user_id', userId);
    await supabaseAdmin.from('usage_log').delete().eq('user_id', userId);
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    // 4. Finally, delete the auth user itself. Once this runs the JWT used
    // to hit this endpoint becomes invalid, which is exactly what we want.
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) {
      logger.error({ authErr, userId }, '[me:delete] auth user deletion failed');
      throw errors.internal('Failed to delete auth user', { error: authErr });
    }

    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
