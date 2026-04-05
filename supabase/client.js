/** Pinned minor version avoids surprise breaking changes from esm.sh `@2` latest. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './runtime-config.js';
import { isSupabaseConfigured } from './config.js';

if (!isSupabaseConfigured()) {
  console.warn(
    '[OneTap] Supabase is not configured: supabase/runtime-config.js still has placeholders or invalid values.\n' +
      'Authentication and API calls will fail until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are injected at build time.\n' +
      'Vercel: Project → Settings → Environment Variables (set for Production and Preview), then redeploy.\n' +
      'Local: add a root .env (see .env.example) and run npm run build.',
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
