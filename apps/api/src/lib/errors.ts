// =============================================================================
// EternalFrame API — typed error helpers
// =============================================================================
import { ERROR_CODES, type ErrorCode } from '@eternalframe/shared';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const errors = {
  unauthenticated: (message = 'Missing or invalid auth token') =>
    new ApiError(ERROR_CODES.UNAUTHENTICATED, message, 401),
  forbidden: (message = 'You do not have access to this resource') =>
    new ApiError(ERROR_CODES.FORBIDDEN, message, 403),
  invalidRequest: (message: string, details?: unknown) =>
    new ApiError(ERROR_CODES.INVALID_REQUEST, message, 400, details),
  tributeNotFound: () =>
    new ApiError(ERROR_CODES.TRIBUTE_NOT_FOUND, 'Tribute not found', 404),
  templateNotFound: () =>
    new ApiError(ERROR_CODES.TEMPLATE_NOT_FOUND, 'Template not found', 404),
  limitReached: (message = 'You have used all of your free creations.') =>
    new ApiError(ERROR_CODES.LIMIT_REACHED, message, 402),
  upgradeRequired: (message = 'A subscription upgrade is required.') =>
    new ApiError(ERROR_CODES.UPGRADE_REQUIRED, message, 402),
  fal: (message: string, details?: unknown) =>
    new ApiError(ERROR_CODES.FAL_ERROR, message, 502, details),
  storage: (message: string, details?: unknown) =>
    new ApiError(ERROR_CODES.STORAGE_ERROR, message, 502, details),
  internal: (message = 'Internal server error', details?: unknown) =>
    new ApiError(ERROR_CODES.INTERNAL_ERROR, message, 500, details),
};
