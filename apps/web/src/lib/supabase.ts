// =============================================================================
// HaloFrame web — Supabase client singleton
//
// The anon key is embedded at build time via VITE_SUPABASE_ANON_KEY. It's
// intentionally public — RLS policies on the server are the security boundary.
// The session created by this client is used for two things:
//   1. Authorization: Bearer <jwt> on every /api/* call (see lib/api.ts)
//   2. storage-bucket uploads scoped to the signed-in user's id
// =============================================================================
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly at module load rather than silently at first request —
  // an absent VITE_SUPABASE_* pair means the .env wasn't picked up and
  // nothing on the authenticated surface of the app will work.
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — auth and credit features will be disabled.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    // Persist the anonymous session in localStorage so a refresh doesn't
    // orphan the user's two lifetime credits.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
