import { supabase } from './supabase';

export const CONSENT_LOCAL_KEY = 'haloframe.ai_consent_at';

export function hasConsented(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(CONSENT_LOCAL_KEY);
  if (!raw) return false;
  const ts = Date.parse(raw);
  return Number.isFinite(ts);
}

export interface RecordConsentOptions {
  syncToServer?: boolean;
}

export async function recordConsent(
  opts: RecordConsentOptions = { syncToServer: true },
): Promise<void> {
  const now = new Date().toISOString();
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONSENT_LOCAL_KEY, now);
  }

  if (!opts.syncToServer) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ ai_consent_at: now })
      .eq('id', user.id);
  } catch (err) {
    console.error('[consent] server sync failed (non-fatal)', err);
  }
}
