// =============================================================================
// Template prompt combiner
//
// Given one or more selected tribute templates, produce a single prompt that
// instructs Nano Banana 2 to apply ALL selected effects in one rendered image.
// This keeps cost constant regardless of how many styles a user stacks.
// =============================================================================
import type { EffectIntensity, TributeTemplate } from '@eternalframe/shared';

export const NO_EFFECT_SENTINEL = 'NO_EFFECT';

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
}

/**
 * Combine one or more template prompts into a single Nano Banana 2 prompt.
 *
 * Returns `NO_EFFECT_SENTINEL` when only the no-effect template (`natural_blend`)
 * is selected, so the caller can skip the AI call entirely and return the
 * source image unchanged.
 */
export function combineTemplatePrompts(opts: CombineOptions): string {
  const { templates, subjectDescription, intensity, haveSubjectContext } = opts;

  // Skip the no-effect template — it's a UI-only sentinel, not a real effect.
  const active = templates.filter((t) => t.promptTemplate !== NO_EFFECT_SENTINEL);

  if (active.length === 0) {
    return NO_EFFECT_SENTINEL;
  }

  // Single-template fast path produces a tighter prompt than the multi-format.
  if (active.length === 1) {
    return buildSingleTemplatePrompt(
      active[0]!,
      subjectDescription,
      intensity,
      haveSubjectContext,
    );
  }

  // Multi-template: produce a structured multi-effect prompt.
  const perEffect = active.map((t, idx) => {
    const base = t.promptTemplate.replace(/\{subject_description\}/g, subjectDescription);
    const modifier = t.promptModifiers[intensity];
    const withModifier = modifier ? `${base} Style note: ${modifier}.` : base;
    return `EFFECT ${idx + 1} — ${t.name}:\n${withModifier}`;
  });

  const preamble =
    'Apply ALL of the following effects to this photo simultaneously. Each effect should be visible and work together harmoniously. Do not let one effect override or cancel out another. All effects should coexist in the same image.';

  const coda = haveSubjectContext
    ? `IMPORTANT: Apply ALL of the above effects together in a single cohesive result. Every effect must be visible and must complement the others. Apply the memorial effects ONLY to ${subjectDescription}. Do not add any memorial effects, glows, halos, wings, watercolor treatment, or overlays to any other people or pets in the photo. Preserve the original photo and all other people/pets exactly as they are.`
    : 'IMPORTANT: Apply ALL of the above effects together in a single cohesive result. Every effect must be visible and must complement the others. Preserve the original photo and everyone in it exactly as they are — only add the requested artistic effects.';

  return [preamble, ...perEffect, coda].join('\n\n');
}

function buildSingleTemplatePrompt(
  template: TributeTemplate,
  subjectDescription: string,
  intensity: EffectIntensity,
  haveSubjectContext: boolean,
): string {
  const base = template.promptTemplate.replace(
    /\{subject_description\}/g,
    subjectDescription,
  );
  const modifier = template.promptModifiers[intensity];
  const withModifier = modifier ? `${base} ${modifier}.` : base;

  if (!haveSubjectContext) return withModifier;

  return `${withModifier} IMPORTANT: Apply the memorial effect ONLY to ${subjectDescription}. Do not add any memorial effects, glows, halos, wings, or overlays to any other people or pets in the photo. Keep every other person in the photo exactly as they appear in the original image, unchanged.`;
}
