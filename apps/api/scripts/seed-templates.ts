// =============================================================================
// Seed the tribute_templates table with the launch templates from
// packages/shared/constants. Idempotent — uses upsert.
//
// Run with: npm run seed:templates
// =============================================================================
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { LAUNCH_TEMPLATES } from '@haloframe/shared';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Seeding ${LAUNCH_TEMPLATES.length} templates...`);
  for (const tpl of LAUNCH_TEMPLATES) {
    const { error } = await supabase.from('tribute_templates').upsert(
      {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        prompt_template: tpl.promptTemplate,
        prompt_modifiers: tpl.promptModifiers,
        preview_image_url: tpl.sampleImageUrl,
        is_pet_compatible: tpl.isPetCompatible,
        is_human_compatible: tpl.isHumanCompatible,
        sort_order: tpl.sortOrder,
        is_active: true,
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.error(`✗ ${tpl.id}:`, error.message);
      process.exitCode = 1;
    } else {
      console.log(`✓ ${tpl.id} — ${tpl.name}`);
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
