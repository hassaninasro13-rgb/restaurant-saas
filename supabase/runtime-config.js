/**
 * Template only — replaced on every `npm run build` by scripts/inject-env.mjs when
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (or present in root `.env`).
 *
 * Vercel: the deploy build must inject real values here; the build fails if env is missing.
 * Never ship this file with placeholders to production: run the build step before deploy.
 */
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
