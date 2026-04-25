import type { HTMLAttributes } from 'react';

/**
 * Always-visible "✨ AI-generated" pill. Used over composite images on the
 * Editor canvas and MyTributes lightbox per the Apple/Google guidance to
 * surface AI provenance to viewers (see APPSTORE_PLAYSTORE_RESEARCH §4.4).
 *
 * The label is exposed via aria-label so screen readers always announce
 * AI provenance, even when the visual span is overlaid on imagery.
 */
export interface AIBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md';
}

export function AIBadge({ size = 'sm', className, ...rest }: AIBadgeProps) {
  const cls = `ai-badge ai-badge-${size}${className ? ` ${className}` : ''}`;
  return (
    <span className={cls} aria-label="AI-generated content" {...rest}>
      <span aria-hidden>✨</span>
      <span className="ai-badge-text">AI-generated</span>
    </span>
  );
}
