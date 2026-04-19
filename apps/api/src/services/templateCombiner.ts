// =============================================================================
// Template prompt combiner
//
// Given one or more selected tribute templates, produce a single prompt that
// instructs Nano Banana 2 to apply ALL selected effects in one rendered image.
// This keeps cost constant regardless of how many styles a user stacks.
// =============================================================================
import type { EffectIntensity, TributeTemplate } from '@haloframe/shared';

export const NO_EFFECT_SENTINEL = 'NO_EFFECT';

/** Templates whose prompt mentions wings — these get a z-order override
 *  when the Reunite flow passes placement="front". Keep in sync with the
 *  shared template definitions in packages/shared/src/constants. */
const WINGS_TEMPLATE_IDS = new Set(['angel_wings', 'halo_and_wings']);

/**
 * Solo-variant prompt overrides. Some templates assume the photo contains
 * multiple people (the "selective color" / "selective effect" premise) and
 * produce incorrect output when the subject is the only person in the
 * frame. On a single-subject Enhance photo, NB2 reads "ONLY {subject}"
 * narrowly as the face region, leaving clothing/body untouched. When
 * there's no multi-subject context, swap in a prompt that treats the whole
 * image as the subject so the selective constraint becomes trivial (and
 * the model converts everything cleanly).
 */
const SOLO_PROMPT_OVERRIDES: Record<string, string> = {
  classic_memorial:
    'Convert this entire photo into an elegant high-contrast black-and-white monochrome memorial portrait. Every part of the image — the person\u2019s face, hair, skin, clothing, and the background — should be rendered in classic portrait black-and-white tones. Add a very subtle soft vignette around the edges. Preserve the composition, the person\u2019s pose, and their expression exactly as they are in the original photo. Do not introduce color anywhere.',
};

export interface CombineOptions {
  /** Resolved template objects (not just IDs). Order preserved in prompt. */
  templates: TributeTemplate[];
  /** Natural-language description of the selected subject. */
  subjectDescription: string;
  intensity: EffectIntensity;
  /**
   * True when the photo has ≥2 subjects and we know which one was selected.
   * Triggers the "apply ONLY to X" directive to prevent effect bleed onto
   * other people/pets in the frame.
   */
  haveSubjectContext: boolean;
  /**
   * Optional placement context from the Reunite flow. When `front`, wings
   * templates get an override: wings render IN FRONT of others (because the
   * subject is closest to the camera). For any other value the default
   * prompt wording — wings behind every other person — holds.
   */
  placement?: 'left' | 'right' | 'behind' | 'front';
}

/**
 * Combine one or more template prompts into a single Nano Banana 2 prompt.
 *
 * Returns `NO_EFFECT_SENTINEL` when only the no-effect template (`natural_blend`)
 * is selected, so the caller can skip the AI call entirely and return the
 * source image unchanged.
 */
export function combineTemplatePrompts(opts: CombineOptions): string {
  const { templates, subjectDescription, intensity, haveSubjectContext, placement } = opts;

  // Skip the no-effect template — it's a UI-only sentinel, not a real effect.
  const active = templates.filter((t) => t.promptTemplate !== NO_EFFECT_SENTINEL);

  if (active.length === 0) {
    return NO_EFFECT_SENTINEL;
  }

  const wingsFrontOverride = buildWingsFrontOverride(active, subjectDescription, placement);

  // Single-template fast path produces a tighter prompt than the multi-format.
  if (active.length === 1) {
    const body = buildSingleTemplatePrompt(
      active[0]!,
      subjectDescription,
      intensity,
      haveSubjectContext,
    );
    return wingsFrontOverride ? `${body}\n\n${wingsFrontOverride}` : body;
  }

  // Multi-template: produce a structured multi-effect prompt.
  const perEffect = active.map((t, idx) => {
    const soloOverride = !haveSubjectContext ? SOLO_PROMPT_OVERRIDES[t.id] : undefined;
    const baseTemplate = soloOverride ?? t.promptTemplate;
    const base = baseTemplate.replace(/\{subject_description\}/g, subjectDescription);
    const modifier = t.promptModifiers[intensity];
    const withModifier = modifier ? `${base} Style note: ${modifier}.` : base;
    return `EFFECT ${idx + 1} — ${t.name}:\n${withModifier}`;
  });

  const preamble =
    'Apply ALL of the following effects to this photo simultaneously. Each effect should be visible and work together harmoniously. Do not let one effect override or cancel out another. All effects should coexist in the same image.';

  const coda = haveSubjectContext
    ? `IMPORTANT: Apply ALL of the above effects together in a single cohesive result. Every effect must be visible and must complement the others. Apply the memorial effects ONLY to ${subjectDescription}. Do not add any memorial effects, glows, halos, wings, watercolor treatment, or overlays to any other people or pets in the photo. Preserve the original photo and all other people/pets exactly as they are.`
    : 'IMPORTANT: Apply ALL of the above effects together in a single cohesive result. Every effect must be visible and must complement the others. Preserve the original photo and everyone in it exactly as they are — only add the requested artistic effects.';

  const parts = [preamble, ...perEffect, coda];
  if (wingsFrontOverride) parts.push(wingsFrontOverride);
  return parts.join('\n\n');
}

function buildWingsFrontOverride(
  active: TributeTemplate[],
  subjectDescription: string,
  placement: CombineOptions['placement'],
): string | null {
  if (placement !== 'front') return null;
  if (!active.some((t) => WINGS_TEMPLATE_IDS.has(t.id))) return null;
  return `Z-ORDER OVERRIDE (wings in front): ${subjectDescription} is the FOREGROUND subject — closest to the camera. Override any "wings behind everyone" instruction from the effect descriptions above. The wings should extend FORWARD with the subject and render IN FRONT of any person, pet, or object standing behind ${subjectDescription} in the scene. Wings are attached to ${subjectDescription}'s back and must follow their depth in the image. The wings must still not cover ${subjectDescription}'s own face, and no other person's face should be wholly obscured — a small overlap of wingtip against another person's shoulder or side is acceptable when the subject is clearly in front.`;
}

function buildSingleTemplatePrompt(
  template: TributeTemplate,
  subjectDescription: string,
  intensity: EffectIntensity,
  haveSubjectContext: boolean,
): string {
  // Solo-variant override: selected-by-id templates that don't translate
  // well to single-subject photos get their prompt swapped before any
  // {subject_description} substitution or modifier append runs.
  const soloOverride = !haveSubjectContext ? SOLO_PROMPT_OVERRIDES[template.id] : undefined;
  const baseTemplate = soloOverride ?? template.promptTemplate;

  const base = baseTemplate.replace(/\{subject_description\}/g, subjectDescription);
  const modifier = template.promptModifiers[intensity];
  const withModifier = modifier ? `${base} ${modifier}.` : base;

  if (!haveSubjectContext) return withModifier;

  return `${withModifier} IMPORTANT: Apply the memorial effect ONLY to ${subjectDescription}. Do not add any memorial effects, glows, halos, wings, or overlays to any other people or pets in the photo. Keep every other person in the photo exactly as they appear in the original image, unchanged.`;
}
