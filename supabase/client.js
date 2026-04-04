import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const missing =
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_URL.includes('YOUR_PROJECT_REF') ||
  SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY';

if (missing) {
  console.warn(
    '[OneTap] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README), then run npm run build or edit supabase/runtime-config.js.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
