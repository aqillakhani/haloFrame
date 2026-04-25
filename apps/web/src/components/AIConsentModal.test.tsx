import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AIConsentModal } from './AIConsentModal';

describe('AIConsentModal', () => {
  it('renders the AI partner disclosure', () => {
    render(<AIConsentModal open onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/fal\.ai/i)).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent(/your photos/i);
  });

  it('does not render when open=false', () => {
    render(<AIConsentModal open={false} onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onAccept when "I understand" tapped', () => {
    const onAccept = vi.fn();
    render(<AIConsentModal open onAccept={onAccept} onDecline={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /understand/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when "Not now" tapped', () => {
    const onDecline = vi.fn();
    render(<AIConsentModal open onAccept={vi.fn()} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('links to the privacy policy', () => {
    render(<AIConsentModal open onAccept={vi.fn()} onDecline={vi.fn()} />);
    const link = screen.getByRole('link', { name: /privacy/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/privacy'));
  });
});
