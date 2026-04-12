// =============================================================================
// EternalFrame API — response envelope helpers
// =============================================================================
import type { Response } from 'express';
import type { ApiResponse } from '@eternalframe/shared';

export function ok<T>(res: Response, data: T, status = 200): Response {
  const body: ApiResponse<T> = { ok: true, data };
  return res.status(status).json(body);
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiResponse<never> = {
    ok: false,
    error: { code, message, details },
  };
  return res.status(status).json(body);
}
