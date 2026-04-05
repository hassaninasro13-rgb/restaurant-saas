#!/usr/bin/env node
/**
 * Post-build guard for CI / Vercel: ensures inject-env produced both boot files.
 * Run via: npm run vercel-build (after npm run build).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = [
  path.join(root, 'pages', 'supabase-env.js'),
  path.join(root, 'js', 'supabase-env.js'),
];

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.error('verify-supabase-env: missing', path.relative(root, p));
    process.exit(1);
  }
  const text = fs.readFileSync(p, 'utf8');
  if (text.length < 40) {
    console.error('verify-supabase-env: file too small', path.relative(root, p));
    process.exit(1);
  }
}

if (process.env.VERCEL === '1') {
  const text = fs.readFileSync(paths[0], 'utf8');
  if (!text.includes('Object.freeze')) {
    console.error(
      'verify-supabase-env: on Vercel, pages/supabase-env.js must contain injected credentials (Object.freeze). Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
    process.exit(1);
  }
}

console.log('verify-supabase-env: ok (pages + js boot scripts present)');
