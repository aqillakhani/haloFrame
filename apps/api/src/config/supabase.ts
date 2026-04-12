import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

let cachedAdmin: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Lazy — only created on first access so the
 * server can boot in spike mode without Supabase credentials.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!cachedAdmin) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Supabase admin client requested but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured. ' +
          'This route is unavailable in spike mode.',
      );
    }
    cachedAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedAdmin;
}

/**
 * Backwards-compatible export. Use a Proxy so `supabaseAdmin.from(...)` still
 * works at the call sites without forcing every file to call `getSupabaseAdmin()`.
 */
export const supabaseAdmin: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop, receiver) {
      const real = getSupabaseAdmin();
      const value = Reflect.get(real, prop, receiver);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  },
);

export function getUserClient(jwt: string): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase user client requested but credentials missing.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
