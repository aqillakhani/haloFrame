import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the api module before ReportContentSheet imports it.
const { mockReportContent } = vi.hoisted(() => ({
  mockReportContent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/api', () => ({
  reportContent: mockReportContent,
}));

import { ReportContentSheet } from './ReportContentSheet';

describe('ReportContentSheet', () => {
  beforeEach(() => {
    mockReportContent.mockClear();
    mockReportContent.mockResolvedValue(undefined);
  });

  it('renders all reason options', () => {
    render(<ReportContentSheet open tributeId="t1" onClose={vi.fn()} />);
    expect(screen.getByLabelText(/inappropriate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/misuse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/wrong person/i)).toBeInTheDocument();
  });

  it('submit button disabled until reason selected', () => {
    render(<ReportContentSheet open tributeId="t1" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/inappropriate/i));
    expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();
  });

  it('calls reportContent then onClose on submit', async () => {
    const onClose = vi.fn();
    render(<ReportContentSheet open tributeId="t1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/inappropriate/i));
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(mockReportContent).toHaveBeenCalledWith({
        tributeId: 't1',
        reason: 'inappropriate',
        note: undefined,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('does not render when open=false', () => {
    render(<ReportContentSheet open={false} tributeId="t1" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes a trimmed note when one is entered', async () => {
    const onClose = vi.fn();
    render(<ReportContentSheet open tributeId="t1" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/quality/i));
    fireEvent.change(screen.getByPlaceholderText(/anything else/i), {
      target: { value: '  blurry on the left  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() =>
      expect(mockReportContent).toHaveBeenCalledWith({
        tributeId: 't1',
        reason: 'quality',
        note: 'blurry on the left',
      }),
    );
  });
});
