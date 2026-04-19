// Builds a CSS string that exposes tokens.ts as :root custom properties.
// Mounted once by main.tsx.

import { color, space, radius, borderWidth, shadow, duration, easing, layout, zIndex } from './tokens';

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

function withUnit(vars: Record<string, string>, unit: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = `${v}${unit}`;
  return out;
}

export function buildRootCss(): string {
  const pxUnits = {
    ...withUnit(flatten(space, '--s'), 'px'),
    ...withUnit(flatten(radius, '--r'), 'px'),
    ...withUnit(flatten(borderWidth, '--bw'), 'px'),
    ...withUnit(flatten(layout, '--l'), 'px'),
  };
  const msUnits = withUnit(flatten(duration, '--d'), 'ms');
  // Radii like `pill: 9999` need no `px` to mean pixels, but adding px is harmless.
  // zIndex from layout would be wrongly px-suffixed above — but layout doesn't
  // include zIndex (that's its own object, not exported via cssVars here).
  const vars: Record<string, string> = {
    ...flatten(color, '--c'),
    ...pxUnits,
    ...flatten(shadow, '--sh'),
    ...msUnits,
    ...flatten(easing, '--e'),
    ...flatten(zIndex, '--z'),
  };
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function injectRootVars(): void {
  const id = 'haloframe-tokens';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = buildRootCss();
  document.head.appendChild(style);
}
