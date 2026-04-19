// =============================================================================
// HaloFrame API — /api/templates
// =============================================================================
import { Router } from 'express';
import type { TributeTemplate } from '@haloframe/shared';
import { supabaseAdmin } from '../config/supabase.js';
import { ok } from '../lib/response.js';
import { errors } from '../lib/errors.js';

interface DbTemplate {
  id: string;
  name: string;
  description: string | null;
  category: TributeTemplate['category'];
  prompt_template: string;
  prompt_modifiers: TributeTemplate['promptModifiers'];
  preview_image_url: string | null;
  is_pet_compatible: boolean;
  is_human_compatible: boolean;
  sort_order: number;
}

function dbToTemplate(row: DbTemplate): TributeTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    promptTemplate: row.prompt_template,
    promptModifiers: row.prompt_modifiers ?? {},
    sampleImageUrl: row.preview_image_url,
    isPetCompatible: row.is_pet_compatible,
    isHumanCompatible: row.is_human_compatible,
    sortOrder: row.sort_order,
  };
}

export const templatesRouter = Router();

templatesRouter.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tribute_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw errors.internal('Failed to load templates', { error });
    const templates = (data as DbTemplate[]).map(dbToTemplate);
    ok(res, { templates });
  } catch (err) {
    next(err);
  }
});
