# OneTap Menu

Static HTML/JS app: public menu by restaurant slug (no login), Supabase backend, owner dashboard for menu and orders.

## Public menu (no authentication)

- URL pattern: **`/`** with **`?slug=your-restaurant-slug`**, or **`/pages/index.html?slug=...`**
- Root **`index.html`** redirects `?slug=` to the public menu page; without `slug` it sends visitors to the owner login.
- The menu uses the **anon** Supabase client and RLS policies — do not expose the **service role** key in the browser.

## Environment variables

| Variable | Where |
|----------|--------|
| `VITE_SUPABASE_URL` | Project URL (e.g. `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | **anon / public** key only |

Aliases supported by the build script: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

**Local development**

1. Copy `.env.example` to `.env` and fill values (optional if you edit files by hand).
2. Either:
   - Run **`npm run build`** with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in the environment so **`scripts/inject-env.mjs`** overwrites `supabase/runtime-config.js`, or  
   - Edit **`supabase/runtime-config.js`** directly with your project URL and anon key (do not commit real secrets if the repo is public).

## Deploy on Vercel

1. Push this repository to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com) → **Add New Project** → import the repo.
3. **Framework preset:** Other (static). Vercel will run **`npm install`** (no dependencies required) and **`vercel-build`** → **`npm run build`**, which injects Supabase env into `supabase/runtime-config.js`.
4. **Environment variables** (Project → Settings → Environment Variables), for *Production* (and Preview if you want):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Site root serves **`index.html`**; static paths **`/pages/*`**, **`/css/*`**, **`/js/*`**, **`/supabase/*`** are served as files.

**Smoke test after deploy**

- Open `https://<your-domain>/index.html?slug=<a-real-slug>` — menu should load without login.
- Open `https://<your-domain>/pages/login.html` — owner login.

## Supabase setup

- Run SQL migrations under **`supabase/migrations/`** in the Supabase SQL editor (or CLI).
- Configure Storage buckets and RLS for `restaurants`, `categories`, `products`, `orders`, and public read/insert rules as required by your app.

## Subscriptions (Free / Pro)

Migration **`20260404200000_restaurant_subscriptions.sql`** adds:

- **`restaurants.subscription_plan`** — `free` or `pro` (default `free`).
- **`restaurants.subscription_expires_at`** — `timestamptz`, **`NULL` = no end date** (menu stays active). If set and in the past, the **public menu is hidden** (logic in `supabase/public-menu.js`; optional restrictive RLS snippet is commented in the migration).
- **`platform_admins`** — one row per admin **email** (store **lowercase**). Only these users can change subscription fields; owners cannot (DB trigger + `updateRestaurantForOwner` strips those keys).

**Register an admin** (SQL editor, once):

```sql
insert into public.platform_admins (email) values (lower('you@yourdomain.com'));
```

**Admin UI:** platform admins are redirected to **`/pages/admin.html`** after login (analytics + establishment management). Non-admins still go to the owner dashboard or create-restaurant flow. The page shows KPIs (restaurants, active/expired subscriptions, orders, order revenue for completed/delivered statuses, sum of **manual subscription revenue**), monthly order growth, new restaurants per month (uses **`restaurants.created_at`** — add or backfill that column if charts are empty), and a per-restaurant order table. You can edit **`manual_subscription_revenue`** (DZD) per establishment; apply migration **`20260404230000_manual_subscription_revenue.sql`** for that column and RLS. The old URL **`/pages/admin-subscriptions.html`** redirects to `admin.html`.

Apply migration **`20260404210000_admin_is_active_orders_rls.sql`** so non-owners cannot change `is_active`, and platform admins can read `orders` for counts.

**Optional DB hardening:** if you already have a permissive `anon` SELECT policy on `restaurants`, add the **restrictive** policy from the bottom of the migration file so expired rows are invisible at the database layer.

## Images (performance)

- Menu product images use **`loading="lazy"`** and **`decoding="async"`** where applicable.
- Dashboard previews use lazy-loaded images with explicit dimensions to reduce layout shift.
- For best results, upload **compressed** JPEG/WebP (reasonable max width, e.g. 1200px) via the dashboard — large originals slow the public menu.

## Project layout

```
index.html          # Entry: slug → public menu, else → login
pages/              # HTML pages (menu, dashboard, orders, …)
css/                # Styles
js/shared.js        # Shared UI helpers + auth re-exports
supabase/           # Client modules + runtime-config.js (credentials)
scripts/inject-env.mjs   # Build: write runtime-config from env
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Writes `supabase/runtime-config.js` when env vars are set |
| `npm run vercel-build` | Used by Vercel; same as `build` |
