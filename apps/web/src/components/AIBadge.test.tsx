import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIBadge } from './AIBadge';

describe('AIBadge', () => {
  it('renders the AI label', () => {
    render(<AIBadge />);
    expect(screen.getByText(/AI-generated/i)).toBeInTheDocument();
  });

  it('uses the sparkle prefix', () => {
    render(<AIBadge />);
    expect(screen.getByText(/✨/)).toBeInTheDocument();
  });

  it('accepts size="sm" / size="md"', () => {
    const { rerender } = render(<AIBadge size="sm" data-testid="badge" />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
    rerender(<AIBadge size="md" data-testid="badge" />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('exposes an aria-label so screen readers announce the AI provenance', () => {
    render(<AIBadge />);
    const el = screen.getByLabelText(/ai/i);
    expect(el).toBeInTheDocument();
  });
});
