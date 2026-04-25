import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoisted mock for Supabase admin so importing the router doesn't drag in
// the real client (which validates env vars at load time).
const { mockInsert, mockUpdateEq, mockUpdate, mockFrom } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null });
  const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
  const mockFrom = vi.fn((tbl: string) => {
    if (tbl === 'reports') return { insert: mockInsert };
    if (tbl === 'tributes') return { update: mockUpdate };
    return {};
  });
  return { mockInsert, mockUpdateEq, mockUpdate, mockFrom };
});
vi.mock('../config/supabase.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));
// Sentry pull-through; we don't assert on captureMessage in tests.
vi.mock('@sentry/node', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { reportRouter } from './report.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  // Stub auth: inject a user without going through requireAuth so the tests
  // exercise the route handler in isolation.
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { id: string; jwt: string } }).user = {
      id: '00000000-0000-0000-0000-0000000000aa',
      jwt: 'stub',
    };
    next();
  });
  app.use('/api/report', reportRouter);
  return app;
}

describe('POST /api/report', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsert.mockResolvedValue({ data: { id: 'r1' }, error: null });
    mockUpdate.mockClear();
    mockUpdateEq.mockClear();
    mockUpdateEq.mockResolvedValue({ error: null });
    mockFrom.mockClear();
  });

  it('rejects body without tributeId', async () => {
    const res = await request(buildApp()).post('/api/report').send({ reason: 'misuse' });
    expect(res.status).toBe(400);
  });

  it('rejects body with unknown reason', async () => {
    const res = await request(buildApp()).post('/api/report').send({
      tributeId: '00000000-0000-0000-0000-000000000001',
      reason: 'this-is-not-valid',
    });
    expect(res.status).toBe(400);
  });

  it('inserts report and updates tribute on valid body', async () => {
    const res = await request(buildApp()).post('/api/report').send({
      tributeId: '00000000-0000-0000-0000-000000000001',
      reason: 'inappropriate',
      note: 'short note',
    });
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tribute_id: '00000000-0000-0000-0000-000000000001',
        user_id: '00000000-0000-0000-0000-0000000000aa',
        reason: 'inappropriate',
        note: 'short note',
      }),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ flagged_reason: 'inappropriate' }),
    );
  });

  it('returns 500 when supabase insert fails', async () => {
    mockInsert.mockResolvedValueOnce({ data: null, error: new Error('db down') });
    const res = await request(buildApp()).post('/api/report').send({
      tributeId: '00000000-0000-0000-0000-000000000001',
      reason: 'inappropriate',
    });
    expect(res.status).toBe(500);
  });
});
