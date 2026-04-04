import { supabase } from './client.js';

/** Menu is served when there is no end date, or the end date is in the future. */
export function isSubscriptionActive(restaurant) {
  if (!restaurant) return false;
  const exp = restaurant.subscription_expires_at;
  if (exp == null || exp === '') return true;
  const t = new Date(exp).getTime();
  if (Number.isNaN(t)) return true;
  return t > Date.now();
}

export function subscriptionLabel(plan) {
  const p = String(plan || 'free').toLowerCase();
  if (p === 'pro') return 'Pro';
  return 'Free';
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
  if (fields.subscription_plan === 'free' || fields.subscription_plan === 'pro') {
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

/** @deprecated use adminUpdateRestaurant */
export async function updateRestaurantSubscriptionAdmin(restaurantId, { subscription_plan, subscription_expires_at }) {
  return adminUpdateRestaurant(restaurantId, { subscription_plan, subscription_expires_at });
}
