// =============================================================================
// HaloFrame API — auth middleware
//
// Validates the Supabase JWT in the Authorization header. On success,
// attaches { id, jwt } to req.user. Routes downstream can use this to load
// the profile or build a per-request scoped Supabase client.
// =============================================================================
import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { errors } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; jwt: string; email?: string | null };
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw errors.unauthenticated();
    }
    const jwt = header.slice('Bearer '.length).trim();
    if (!jwt) throw errors.unauthenticated();

    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    if (error || !data.user) {
      throw errors.unauthenticated();
    }

    req.user = { id: data.user.id, jwt, email: data.user.email ?? null };
    next();
  } catch (err) {
    next(err);
  }
}
