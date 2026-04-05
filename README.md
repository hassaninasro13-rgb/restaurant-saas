# OneTap Menu

Static HTML/JS app: public menu by restaurant slug (no login), Supabase backend, owner dashboard for menu and orders.

## Public menu (no authentication)

- URL pattern: **`/`** with **`?slug=your-restaurant-slug`**, or **`/pages/index.html?slug=...`**
- Root **`index.html`** redirects `?slug=` to the public menu page; without `slug` it sends visitors to the owner login.
- The menu uses the **anon** Supabase client and RLS policies — do not expose the **service role** key in the browser.

## Environment variables

| Variable | Where |
|----------|--------|
| `VITE_SUPABASE_URL` | HTTPS project URL (e.g. `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | **anon / public** key only (long JWT-like string) |

Aliases supported by **`scripts/inject-env.mjs`**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

**Why login shows "Failed to fetch"**

The browser loads credentials from **`supabase/runtime-config.js`**. If that file still contains placeholders, every request to Supabase fails at the network layer. Fix: inject real values at **build** time (Vercel env vars or local `npm run build`).

**Local development**

1. Copy **`.env.example`** to **`.env`** at the repo root and paste your URL and anon key from Supabase → Project Settings → API.
2. Run **`npm run build`** — this overwrites **`supabase/runtime-config.js`** (the script reads `.env` automatically; you do not need to `export` variables).
3. Serve the site over HTTP(S) (e.g. `npx serve .` from the repo root) and open **`/pages/login.html`**.

Alternatively, edit **`supabase/runtime-config.js`** directly for quick tests (do not commit real secrets to a public repo).

## Deploy on Vercel

1. Push this repository to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com) → **Add New Project** → import the repo.
3. **Framework preset:** Other (static). **`vercel.json`** sets **`buildCommand`** to **`npm run vercel-build`**, which runs **`npm run build`** and **must** write valid `supabase/runtime-config.js`.
4. **Environment variables** (Project → Settings → Environment Variables). Add for **Production** and **Preview** (Preview deployments fail the build if these are missing):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  
   Redeploy after adding or changing variables so a new build runs with the values.
5. Deploy. Site root serves **`index.html`**; static paths **`/pages/*`**, **`/css/*`**, **`/js/*`**, **`/supabase/*`** are served as files.

**Supabase Auth (production)**

In the Supabase dashboard → **Authentication** → **URL configuration**:

- Set **Site URL** to your production origin (e.g. `https://your-app.vercel.app`).
- Add **Redirect URLs** that include your login page, e.g. `https://your-app.vercel.app/pages/login.html` and `http://localhost:3000/pages/login.html` for local testing.

**Smoke test after deploy**

- Open `https://<your-domain>/index.html?slug=<a-real-slug>` — menu should load without login.
- Open `https://<your-domain>/pages/login.html` — signup/login should work (no "Failed to fetch").

## Database tables (checklist)

This app expects Supabase tables created by your base schema plus migrations in **`supabase/migrations/`**. There is **no** separate `subscriptions` table: subscription fields live on **`restaurants`** (`subscription_plan`, `subscription_expires_at`, **`manual_subscription_revenue`** after the manual-revenue migration).

| Table / concept | Role |
|-----------------|------|
| **`restaurants`** | Owners, slugs, menu visibility, subscription columns |
| **`orders`** (+ **`order_items`** if used) | Customer orders; RLS extended for platform admin reads in **`20260404210000_admin_is_active_orders_rls.sql`** |
| **`platform_admins`** | Admin emails (lowercase); used for admin UI and subscription guard triggers |
| Subscriptions | Columns on **`restaurants`**, not a standalone table |

Run all migrations in order in the Supabase SQL editor (or CLI).

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
