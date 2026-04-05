# Agent / maintainer notes

Static Restaurant SaaS (HTML + ES modules + Supabase). No bundler.

## Critical paths

- **`scripts/inject-env.mjs`** — Writes **`supabase/runtime-config.js`** from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (or root `.env`). On **Vercel** (`VERCEL=1`), missing/invalid vars **fail the build**.
- **`supabase/client.js`** — Browser Supabase client; imports URL/key from **`runtime-config.js`**.
- **`pages/login.html`** — Sign-in/up; platform admins → **`admin.html`** via **`checkIsPlatformAdmin()`** in `supabase/subscriptions.js`.
- **`pages/admin.html`** — Platform analytics + restaurant/subscription management.

## Commands

- `npm run build` — Inject env into `runtime-config.js` (required before local testing if using placeholders).
- `npm run preview` — Static server on port 3333 (run after `build` if you use `.env`).

## Vercel

Set the same two env vars for **Production** and **Preview**. `vercel.json` runs `vercel-build` → `build`.

## Migrations

Apply SQL under **`supabase/migrations/`** in order; see **README.md** for `platform_admins` and RLS.
