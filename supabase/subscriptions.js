import { supabase } from './client.js';

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'expired', 'canceled', 'pending'];

const PLAN_SLUG_LABELS = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

function normalizeStatus(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'trialing') return 'trial';
  if (v === 'cancelled') return 'canceled';
  if (v === 'past_due') return 'pending';
  if (SUBSCRIPTION_STATUSES.includes(v)) return v;
  return null;
}

function parseDateMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function getCurrentPlanSlug(restaurant) {
  return String(
    restaurant?.subscription?.plan?.slug
      || restaurant?.subscription_plan
      || 'free',
  ).toLowerCase();
}

export function getSubscriptionExpiry(restaurant) {
  return restaurant?.subscription?.end_date ?? restaurant?.subscription_expires_at ?? null;
}

export function getSubscriptionStatus(restaurant, now = new Date()) {
  if (!restaurant) return 'pending';
  const normalized = normalizeStatus(restaurant?.subscription?.status);
  const nowMs = now.getTime();
  const expMs = parseDateMs(getSubscriptionExpiry(restaurant));
  const isExpiredByDate = expMs != null && expMs <= nowMs;

  if (normalized === 'expired' || isExpiredByDate) return 'expired';
  if (normalized === 'trial') return 'trial';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'canceled') return expMs != null && expMs > nowMs ? 'canceled' : 'expired';
  if (normalized === 'active') return 'active';

  return getCurrentPlanSlug(restaurant) === 'free' ? 'trial' : 'active';
}

export function isSubscriptionAccessAllowed(restaurant, scope = 'app', now = new Date()) {
  const status = getSubscriptionStatus(restaurant, now);
  if (status === 'expired') return false;
  if (scope === 'public_menu') return status !== 'pending';
  return true;
}

export function getSubscriptionSnapshot(restaurant, now = new Date()) {
  const plan = getCurrentPlanSlug(restaurant);
  const status = getSubscriptionStatus(restaurant, now);
  const expiresAt = getSubscriptionExpiry(restaurant);
  return {
    plan,
    status,
    expiresAt,
    access: {
      app: isSubscriptionAccessAllowed(restaurant, 'app', now),
      publicMenu: isSubscriptionAccessAllowed(restaurant, 'public_menu', now),
    },
  };
}

/** Backward-compatible helper used by existing UI/guards. */
export function isSubscriptionActive(restaurant) {
  if (!restaurant) return false;
  const sub = restaurant.subscription;
  if (sub) {
    return isSubscriptionAccessAllowed(restaurant, 'public_menu');
  }
  return isSubscriptionAccessAllowed(restaurant, 'public_menu');
}

/** @param {string|object} restaurantOrSlug — restaurant row (with optional `subscription.plan`) or plan slug */
export function subscriptionLabel(restaurantOrSlug) {
  if (restaurantOrSlug && typeof restaurantOrSlug === 'object') {
    const name = restaurantOrSlug.subscription?.plan?.name;
    if (name) return name;
    const slug = String(restaurantOrSlug.subscription_plan || 'free').toLowerCase();
    return PLAN_SLUG_LABELS[slug] || 'Free';
  }
  const p = String(restaurantOrSlug || 'free').toLowerCase();
  return PLAN_SLUG_LABELS[p] || 'Free';
}

export function formatSubscriptionExpiry(iso) {
  if (iso == null || iso === '') return 'Sans date de fin';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-DZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** True if the signed-in user is listed in platform_admins (RLS returns a row only for a matching email). */
export async function checkIsPlatformAdmin() {
  const { data } = await supabase.from('platform_admins').select('email').limit(1).maybeSingle();
  return !!data?.email;
}

/** Admin UI: all restaurants with subscription + account flags. */
export async function listRestaurantsForAdmin() {
  return supabase
    .from('restaurants')
    .select(
      'id, name, slug, subscription_plan, subscription_expires_at, user_id, is_active, created_at, manual_subscription_revenue',
    )
    .order('name');
}

/**
 * Admin: update subscription fields, expiration, and/or is_active (establishment enabled for public menu).
 */
export async function adminUpdateRestaurant(restaurantId, fields) {
  const patch = {};
  const allowedPlans = new Set(['free', 'basic', 'pro', 'enterprise']);
  if (fields.subscription_plan && allowedPlans.has(fields.subscription_plan)) {
    patch.subscription_plan = fields.subscription_plan;
  }
  if (fields.subscription_expires_at !== undefined) {
    if (fields.subscription_expires_at === null || fields.subscription_expires_at === '') {
      patch.subscription_expires_at = null;
    } else {
      patch.subscription_expires_at = fields.subscription_expires_at;
    }
  }
  if (fields.is_active === true || fields.is_active === false) {
    patch.is_active = fields.is_active;
  }
  if (fields.manual_subscription_revenue !== undefined && fields.manual_subscription_revenue !== null) {
    const n = Number(fields.manual_subscription_revenue);
    if (!Number.isNaN(n) && n >= 0) {
      patch.manual_subscription_revenue = Math.round(n * 100) / 100;
    }
  }
  if (Object.keys(patch).length === 0) {
    return { data: null, error: new Error('Aucun champ à mettre à jour.') };
  }
  return supabase.from('restaurants').update(patch).eq('id', restaurantId).select().single();
}

function normalizeSlug(raw) {
  const out = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return out || null;
}

/** Admin: create a new restaurant row. */
export async function adminCreateRestaurant(payload) {
  const name = String(payload?.name || '').trim();
  if (!name) {
    return { data: null, error: new Error('Le nom du restaurant est requis.') };
  }
  const slug = normalizeSlug(payload?.slug || name);
  if (!slug) {
    return { data: null, error: new Error('Slug invalide.') };
  }
  const allowedPlans = new Set(['free', 'basic', 'pro', 'enterprise']);
  const plan = allowedPlans.has(payload?.subscription_plan) ? payload.subscription_plan : 'free';
  const insert = {
    name,
    slug,
    subscription_plan: plan,
    subscription_expires_at: payload?.subscription_expires_at || null,
    is_active: payload?.is_active === false ? false : true,
  };
  const ownerUserId = String(payload?.user_id || '').trim();
  if (ownerUserId) insert.user_id = ownerUserId;
  return supabase.from('restaurants').insert(insert).select().single();
}

/** @deprecated use adminUpdateRestaurant */
export async function updateRestaurantSubscriptionAdmin(restaurantId, { subscription_plan, subscription_expires_at }) {
  return adminUpdateRestaurant(restaurantId, { subscription_plan, subscription_expires_at });
}
