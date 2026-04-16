// Builds a CSS string that exposes tokens.ts as :root custom properties.
// Mounted once by main.tsx.

import { color, space, radius, borderWidth, shadow, duration, easing, layout } from './tokens';

function flatten(obj: Record<string, unknown>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}-${k}`;
    if (Array.isArray(v)) {
      // Cubic-bezier tuple → CSS function.
      out[key] = `cubic-bezier(${(v as number[]).join(', ')})`;
    } else if (v && typeof v === 'object') {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

export function buildRootCss(): string {
  const vars: Record<string, string> = {
    ...flatten(color, '--c'),
    ...flatten(space, '--s'),
    ...flatten(radius, '--r'),
    ...flatten(borderWidth, '--bw'),
    ...flatten(shadow, '--sh'),
    ...flatten(duration, '--d'),
    ...flatten(easing, '--e'),
    ...flatten(layout, '--l'),
  };
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function injectRootVars(): void {
  const id = 'eternalframe-tokens';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = buildRootCss();
  document.head.appendChild(style);
}
