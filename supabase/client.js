/** Pinned minor version avoids surprise breaking changes from esm.sh `@2` latest. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './runtime-config.js';
import { isSupabaseConfigured } from './config.js';

if (!isSupabaseConfigured()) {
  console.warn(
    '[OneTap] Supabase is not configured: pages/supabase-env.js did not define credentials (or it loaded after modules).\n' +
      'Ensure <script src="supabase-env.js"></script> is the first script in <head>, then run npm run build with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.\n' +
      'Vercel: Project → Settings → Environment Variables (Production + Preview) → Redeploy.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
