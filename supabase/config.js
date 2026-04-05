/**
 * Re-exports from runtime-config.js + configuration checks.
 * `client.js` imports URL/key from runtime-config.js directly; this module shares the same source for helpers.
 * @see ../README.md — deployment and environment variables
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './runtime-config.js';

export { SUPABASE_URL, SUPABASE_ANON_KEY };

/** False when placeholders or missing — auth requests will fail with "Failed to fetch". */
export function isSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (SUPABASE_URL.includes('YOUR_PROJECT_REF')) return false;
  if (SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') return false;
  if (SUPABASE_ANON_KEY.length < 32) return false;
  try {
    const u = new URL(SUPABASE_URL);
    return u.protocol === 'https:' && Boolean(u.hostname);
  } catch {
    return false;
  }
}
