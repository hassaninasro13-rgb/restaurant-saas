# Agent / maintainer notes

Static Restaurant SaaS (HTML + ES modules + Supabase). No bundler.

## Critical paths

- **`scripts/inject-env.mjs`** — Writes **`pages/supabase-env.js`** and **`js/supabase-env.js`** (same content). Pages load **`src="supabase-env.js"`** so the boot file is always **`/pages/supabase-env.js`** next to HTML.
- **`scripts/verify-supabase-env.mjs`** — Run by **`npm run vercel-build`** after inject; on **`VERCEL=1`** requires **`Object.freeze`** in the file (real credentials).
- **`vercel.json`** — **`framework": null`** so Vercel does not auto-pick a framework and skip our build command.
- **`supabase/runtime-config.js`** — Reads `globalThis` after the boot script runs.

## Commands

- `npm run build` — Regenerate both `supabase-env.js` files.
- `npm run vercel-build` — Build + verify (Vercel default build pipeline).

## Vercel

Set **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** for **Production** and **Preview**. Cache headers apply to **`/pages/supabase-env.js`** and **`/js/supabase-env.js`**.

## Migrations

Apply SQL under **`supabase/migrations/`** in order; see **README.md** for `platform_admins` and RLS.
