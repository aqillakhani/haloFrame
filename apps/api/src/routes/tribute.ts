// =============================================================================
// HaloFrame API — /api/tribute/*
//
// The state-machine routes for creating and progressing a tribute:
//
//   POST   /                          Create draft tribute
//   POST   /:id/upload-url             Get a signed upload URL
//   POST   /:id/segment                Run SAM 3 on the main photo
//   POST   /:id/select                 Pick which detected subject is the deceased
//   POST   /:id/merge                  (Reunite only) Merge two photos
//   POST   /:id/apply                  Apply a memorial template
//   POST   /:id/finalize               Mark tribute composited (text/border layered client-side)
//   POST   /:id/hd                     Generate the 4K HD version
//   GET    /:id                        Get tribute snapshot
//   GET    /                           List user tributes
//   DELETE /:id                        Delete tribute and all its assets
// =============================================================================
import { Router } from 'express';
import {
  applyTemplateRequestSchema,
  createTributeRequestSchema,
  finalizeRequestSchema,
  mergeRequestSchema,
  selectSubjectRequestSchema,
  uploadPhotoRequestSchema,
  INITIAL_TRIBUTE_STATE,
  type Tribute,
  type TributeState,
  type TributeStep,
} from '@haloframe/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import {
  applyMemorialEffect,
  applyMemorialEffectPro,
  describeSubject,
  detectSubjects,
  mergePhotos,
} from '../services/falai.js';
import { processSamResult } from '../services/segmentation.js';
import {
  createSourceSignedUrl,
  createUploadUrl,
  deleteTributeAssets,
  rehostFromUrl,
} from '../services/storage.js';
import {
  checkPhotoEntitlement,
  loadProfile,
  recordUsage,
} from '../services/entitlements.js';

export const tributeRouter = Router();

tributeRouter.use(requireAuth);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// @types/express v5 types req.params values as string | string[], but Express
// 4's runtime only yields strings for colon-style routes. Narrow once per site.
function requireIdParam(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string') throw errors.invalidRequest('Invalid route parameter');
  return raw;
}

interface DbTribute {
  id: string;
  user_id: string;
  flow_type: Tribute['flowType'];
  status: Tribute['status'];
  step: TributeStep;
  state: TributeState;
  is_pet: boolean;
  created_at: string;
  updated_at: string;
}

function dbToTribute(row: DbTribute): Tribute {
  return {
    id: row.id,
    userId: row.user_id,
    flowType: row.flow_type,
    status: row.status,
    step: row.step,
    state: row.state,
    isPet: row.is_pet,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadTribute(userId: string, tributeId: string): Promise<DbTribute> {
  const { data, error } = await supabaseAdmin
    .from('tributes')
    .select('*')
    .eq('id', tributeId)
    .eq('user_id', userId)
    .single<DbTribute>();
  if (error || !data) throw errors.tributeNotFound();
  return data;
}

async function patchTribute(
  tributeId: string,
  patch: Partial<DbTribute> & { state: TributeState; step: TributeStep },
): Promise<DbTribute> {
  const { data, error } = await supabaseAdmin
    .from('tributes')
    .update(patch)
    .eq('id', tributeId)
    .select('*')
    .single<DbTribute>();
  if (error || !data) throw errors.internal('Failed to update tribute', { error });
  return data;
}

// -----------------------------------------------------------------------------
// POST / — create draft
// -----------------------------------------------------------------------------
tributeRouter.post(
  '/',
  validateBody(createTributeRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { flowType, isPet } = req.body as ReturnType<
        typeof createTributeRequestSchema.parse
      >;

      // Up-front entitlement check (we re-check before each AI call too)
      const profile = await loadProfile(userId);
      const ent = await checkPhotoEntitlement(profile);
      if (!ent.allowed) {
        if (ent.reason === 'upgrade_required') throw errors.upgradeRequired();
        throw errors.limitReached();
      }

      const initialState: TributeState = {
        ...INITIAL_TRIBUTE_STATE,
        flowType,
        isPet,
      };

      const { data, error } = await supabaseAdmin
        .from('tributes')
        .insert({
          user_id: userId,
          flow_type: flowType,
          step: 'created',
          status: 'draft',
          state: initialState,
          is_pet: isPet,
        })
        .select('*')
        .single<DbTribute>();
      if (error || !data) throw errors.internal('Failed to create tribute', { error });

      ok(res, { tribute: dbToTribute(data) }, 201);
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /:id/upload-url — get a signed upload URL for a photo slot
// -----------------------------------------------------------------------------
tributeRouter.post(
  '/:id/upload-url',
  validateBody(uploadPhotoRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const tributeId = requireIdParam(req.params.id);
      const { slot } = req.body as ReturnType<typeof uploadPhotoRequestSchema.parse>;

      const tribute = await loadTribute(userId, tributeId);
      const filename = slot === 'main' ? 'main.jpg' : 'loved-one.jpg';
      const upload = await createUploadUrl({ userId, tributeId, filename });

      // Persist the storage path so subsequent calls know where to find the file
      const newState: TributeState = {
        ...tribute.state,
        ...(slot === 'main'
          ? { mainPhotoUrl: upload.storagePath }
          : { lovedOnePhotoUrl: upload.storagePath }),
      };
      await patchTribute(tributeId, {
        state: newState,
        step: 'uploaded',
      });

      ok(res, upload);
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /:id/segment — run SAM 3
// -----------------------------------------------------------------------------
tributeRouter.post('/:id/segment', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const tributeId = requireIdParam(req.params.id);
    const tribute = await loadTribute(userId, tributeId);

    if (!tribute.state.mainPhotoUrl) {
      throw errors.invalidRequest('Main photo must be uploaded first');
    }

    const sourceSigned = await createSourceSignedUrl(tribute.state.mainPhotoUrl);
    const samResult = await detectSubjects(sourceSigned, tribute.state.isPet);

    // Re-host every mask in our bucket so we own the data
    const rehosted: string[] = [];
    for (let i = 0; i < samResult.masks.length; i++) {
      const r = await rehostFromUrl({
        sourceUrl: samResult.masks[i]!.url,
        userId,
        tributeId,
        filename: `mask-${i}.png`,
        bucket: 'source',
      });
      rehosted.push(r.signedUrl);
    }

    const segmentation = await processSamResult(samResult, rehosted);

    const newState: TributeState = {
      ...tribute.state,
      segmentation,
      // Auto-skip selection screen if there's only one viable subject
      selectedSubjectIndex: segmentation.subjects.length === 1 ? 0 : null,
    };

    await patchTribute(tributeId, {
      state: newState,
      step: segmentation.subjects.length === 1 ? 'subject_selected' : 'segmented',
    });

    await recordUsage({
      userId,
      tributeId,
      creationType: 'segment',
      apiCostCents: 1, // ~$0.005 per call → 0.5¢, round up
      countTowardQuota: false,
    });

    ok(res, { segmentation });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /:id/select — user picks which detected subject is the deceased
// -----------------------------------------------------------------------------
tributeRouter.post(
  '/:id/select',
  validateBody(selectSubjectRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const tributeId = requireIdParam(req.params.id);
      const { subjectIndex, subjectName } = req.body as ReturnType<
        typeof selectSubjectRequestSchema.parse
      >;
      const tribute = await loadTribute(userId, tributeId);

      if (
        !tribute.state.segmentation ||
        subjectIndex >= tribute.state.segmentation.subjects.length
      ) {
        throw errors.invalidRequest('Invalid subject index');
      }

      const newState: TributeState = {
        ...tribute.state,
        selectedSubjectIndex: subjectIndex,
        textOverlay: {
          ...tribute.state.textOverlay,
          name: subjectName ?? tribute.state.textOverlay.name,
        },
      };

      const updated = await patchTribute(tributeId, {
        state: newState,
        step: 'subject_selected',
      });
      ok(res, { tribute: dbToTribute(updated) });
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /:id/merge — Reunite flow only
// -----------------------------------------------------------------------------
tributeRouter.post(
  '/:id/merge',
  validateBody(mergeRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const tributeId = requireIdParam(req.params.id);
      const { placement, subjectName } = req.body as ReturnType<
        typeof mergeRequestSchema.parse
      >;
      const tribute = await loadTribute(userId, tributeId);

      if (!tribute.state.mainPhotoUrl || !tribute.state.lovedOnePhotoUrl) {
        throw errors.invalidRequest('Both photos must be uploaded for the Reunite flow');
      }

      const mainSigned = await createSourceSignedUrl(tribute.state.mainPhotoUrl);
      const lovedSigned = await createSourceSignedUrl(tribute.state.lovedOnePhotoUrl);

      const subjectDescription = describeSubject({
        name: subjectName,
        isPet: tribute.state.isPet,
      });

      const merged = await mergePhotos({
        mainPhotoUrl: mainSigned,
        lovedOnePhotoUrl: lovedSigned,
        placement,
        subjectDescription,
      });

      const rehosted = await rehostFromUrl({
        sourceUrl: merged.imageUrl,
        userId,
        tributeId,
        filename: `merged-${placement}.png`,
        bucket: 'source',
      });

      const newState: TributeState = {
        ...tribute.state,
        placement,
        mergedPhotoUrl: rehosted.storagePath,
        textOverlay: {
          ...tribute.state.textOverlay,
          name: subjectName ?? tribute.state.textOverlay.name,
        },
      };

      const updated = await patchTribute(tributeId, {
        state: newState,
        step: 'merged',
      });

      await recordUsage({
        userId,
        tributeId,
        creationType: 'merge',
        apiCostCents: 8, // ~$0.08
        countTowardQuota: false,
      });

      ok(res, { tribute: dbToTribute(updated), mergedSignedUrl: rehosted.signedUrl });
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /:id/apply — apply a memorial template effect
// -----------------------------------------------------------------------------
tributeRouter.post(
  '/:id/apply',
  validateBody(applyTemplateRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const tributeId = requireIdParam(req.params.id);
      const { templateIds, intensity } = req.body as ReturnType<
        typeof applyTemplateRequestSchema.parse
      >;
      // v1.3 supports stacking multiple styles, but the full-product tribute
      // route still resolves a primary template for DB persistence. The
      // combiner in services/templateCombiner runs on the spike route; when
      // this route is re-enabled, swap to combine all resolved templates.
      const primaryTemplateId = templateIds[0]!;
      const tribute = await loadTribute(userId, tributeId);

      // Re-check entitlement immediately before the cost-bearing call
      const profile = await loadProfile(userId);
      const ent = await checkPhotoEntitlement(profile);
      if (!ent.allowed) {
        if (ent.reason === 'upgrade_required') throw errors.upgradeRequired();
        throw errors.limitReached();
      }

      // Resolve the template
      const { data: tpl, error: tplError } = await supabaseAdmin
        .from('tribute_templates')
        .select('*')
        .eq('id', primaryTemplateId)
        .eq('is_active', true)
        .single();
      if (tplError || !tpl) throw errors.templateNotFound();

      const template = {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description ?? '',
        category: tpl.category,
        promptTemplate: tpl.prompt_template,
        promptModifiers: tpl.prompt_modifiers ?? {},
        sampleImageUrl: tpl.preview_image_url,
        isPetCompatible: tpl.is_pet_compatible,
        isHumanCompatible: tpl.is_human_compatible,
        sortOrder: tpl.sort_order,
      };

      // Source = merged photo if it exists (Reunite), otherwise main photo
      const sourcePath = tribute.state.mergedPhotoUrl ?? tribute.state.mainPhotoUrl;
      if (!sourcePath) throw errors.invalidRequest('No source photo available');
      const sourceSigned = await createSourceSignedUrl(sourcePath);

      const subjectName = tribute.state.textOverlay.name;
      const subjectDescription = describeSubject({
        name: subjectName,
        isPet: tribute.state.isPet,
      });

      let result;
      try {
        result = await applyMemorialEffect({
          photoUrl: sourceSigned,
          template,
          subjectDescription,
          intensity,
        });
      } catch (err) {
        logger.warn({ err, templateId: primaryTemplateId }, 'primary apply failed, trying pro fallback');
        result = await applyMemorialEffectPro({
          photoUrl: sourceSigned,
          template,
          subjectDescription,
          intensity,
        });
      }

      const rehosted = await rehostFromUrl({
        sourceUrl: result.imageUrl,
        userId,
        tributeId,
        filename: `templated-${primaryTemplateId}-${intensity}.png`,
        bucket: 'source',
      });

      const newState: TributeState = {
        ...tribute.state,
        templateIds,
        effectIntensity: intensity,
        templatedPhotoUrl: rehosted.storagePath,
      };

      const updated = await patchTribute(tributeId, {
        state: newState,
        step: 'templated',
      });

      await recordUsage({
        userId,
        tributeId,
        creationType: 'apply',
        apiCostCents: 8,
        countTowardQuota: true, // this is the 'count' that decrements the quota
      });

      ok(res, {
        tribute: dbToTribute(updated),
        templatedSignedUrl: rehosted.signedUrl,
      });
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /:id/finalize — record the chosen text/border (rendered client-side)
// -----------------------------------------------------------------------------
tributeRouter.post(
  '/:id/finalize',
  validateBody(finalizeRequestSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const tributeId = requireIdParam(req.params.id);
      const { textOverlay, borderStyle } = req.body as ReturnType<
        typeof finalizeRequestSchema.parse
      >;
      const tribute = await loadTribute(userId, tributeId);

      const newState: TributeState = {
        ...tribute.state,
        textOverlay,
        borderStyle,
      };

      const updated = await patchTribute(tributeId, {
        state: newState,
        step: 'composited',
        status: 'completed',
      } as Partial<DbTribute> & { state: TributeState; step: TributeStep });

      ok(res, { tribute: dbToTribute(updated) });
    } catch (err) {
      next(err);
    }
  },
);

// -----------------------------------------------------------------------------
// POST /:id/hd — generate 4K HD version (paying users only)
// -----------------------------------------------------------------------------
tributeRouter.post('/:id/hd', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const tributeId = requireIdParam(req.params.id);
    const tribute = await loadTribute(userId, tributeId);

    const profile = await loadProfile(userId);
    if (profile.subscriptionTier === 'free') {
      throw errors.upgradeRequired('HD downloads require a subscription');
    }

    if (tribute.state.templateIds.length === 0 || !tribute.state.templatedPhotoUrl) {
      throw errors.invalidRequest('Tribute has no template applied yet');
    }
    // HD render uses the first selected template as the representative style.
    // Combined-prompt HD rendering is handled by the spike route; when this
    // full route is re-enabled, mirror the combiner logic here.
    const hdTemplateId = tribute.state.templateIds[0]!;

    const sourcePath = tribute.state.mergedPhotoUrl ?? tribute.state.mainPhotoUrl;
    if (!sourcePath) throw errors.invalidRequest('No source photo available');
    const sourceSigned = await createSourceSignedUrl(sourcePath);

    const { data: tpl } = await supabaseAdmin
      .from('tribute_templates')
      .select('*')
      .eq('id', hdTemplateId)
      .single();
    if (!tpl) throw errors.templateNotFound();

    const template = {
      id: tpl.id,
      name: tpl.name,
      description: tpl.description ?? '',
      category: tpl.category,
      promptTemplate: tpl.prompt_template,
      promptModifiers: tpl.prompt_modifiers ?? {},
      sampleImageUrl: tpl.preview_image_url,
      isPetCompatible: tpl.is_pet_compatible,
      isHumanCompatible: tpl.is_human_compatible,
      sortOrder: tpl.sort_order,
    };

    const subjectDescription = describeSubject({
      name: tribute.state.textOverlay.name,
      isPet: tribute.state.isPet,
    });

    const result = await applyMemorialEffect({
      photoUrl: sourceSigned,
      template,
      subjectDescription,
      intensity: tribute.state.effectIntensity,
      resolution: '4K',
    });

    const rehosted = await rehostFromUrl({
      sourceUrl: result.imageUrl,
      userId,
      tributeId,
      filename: `final-hd.png`,
      bucket: 'final',
    });

    const newState: TributeState = {
      ...tribute.state,
      finalPhotoHdUrl: rehosted.storagePath,
    };

    const updated = await patchTribute(tributeId, {
      state: newState,
      step: 'finalized',
    });

    await recordUsage({
      userId,
      tributeId,
      creationType: 'finalize',
      apiCostCents: 8,
      countTowardQuota: false,
    });

    ok(res, {
      tribute: dbToTribute(updated),
      hdSignedUrl: rehosted.signedUrl,
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// GET /:id
// -----------------------------------------------------------------------------
tributeRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const tributeId = requireIdParam(req.params.id);
    const tribute = await loadTribute(userId, tributeId);
    ok(res, { tribute: dbToTribute(tribute) });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// GET / — list user tributes
// -----------------------------------------------------------------------------
tributeRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { data, error } = await supabaseAdmin
      .from('tributes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw errors.internal('Failed to list tributes', { error });
    const tributes = (data as DbTribute[]).map(dbToTribute);
    ok(res, { tributes });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// DELETE /:id
// -----------------------------------------------------------------------------
tributeRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const tributeId = requireIdParam(req.params.id);
    await loadTribute(userId, tributeId); // verify ownership
    await deleteTributeAssets({ userId, tributeId });
    await supabaseAdmin.from('tributes').delete().eq('id', tributeId);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});
