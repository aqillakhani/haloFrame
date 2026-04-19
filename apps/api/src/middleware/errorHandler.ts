// =============================================================================
// HaloFrame API — error handling middleware
// =============================================================================
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { fail } from '../lib/response.js';
import { logger } from '../config/logger.js';
import { ERROR_CODES } from '@haloframe/shared';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, 'api error');
    }
    fail(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    fail(res, 400, ERROR_CODES.INVALID_REQUEST, 'Invalid request', err.flatten());
    return;
  }

  logger.error({ err, path: req.path }, 'unhandled error');
  fail(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Internal server error');
};
