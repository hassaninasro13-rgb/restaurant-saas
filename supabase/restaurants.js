import { supabase } from './client.js';
import { uploadLogoToStorage, uploadCoverToStorage } from './storage.js';

const LS_PENDING_RESTAURANT = 'onetap_pending_restaurant_name';

/** Survives tab close (email confirmation), cleared after restaurant is created or on logout */
export function setPendingRestaurantName(name) {
  if (name && String(name).trim()) localStorage.setItem(LS_PENDING_RESTAURANT, String(name).trim());
  else localStorage.removeItem(LS_PENDING_RESTAURANT);
}

export function getPendingRestaurantName() {
  return localStorage.getItem(LS_PENDING_RESTAURANT);
}

export function clearPendingRestaurantName() {
  localStorage.removeItem(LS_PENDING_RESTAURANT);
}

function slugFromRestaurantName(raw) {
  const s = String(raw || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'restaurant';
}

/**
 * Minimal restaurant row after signup (defaults match multi-step wizard).
 * Slug = slugified name + unique suffix.
 */
export async function createRestaurantForNewUser(userId, displayName) {
  const name = String(displayName || '').trim();
  if (!name) return { data: null, error: new Error('Le nom de l\'établissement est requis.') };
  const base = slugFromRestaurantName(name);
  const slug = `${base}-${Date.now().toString(36)}`;
  return createRestaurant({
    user_id: userId,
    name,
    slug,
    description: null,
    business_type: 'restaurant',
    phone: null,
    whatsapp: null,
    address: null,
    city: null,
    wilaya: null,
    delivery_enabled: true,
    pickup_enabled: true,
    qr_ordering_enabled: false,
    logo_url: null,
    cover_url: null,
    subscription_plan: 'free',
    subscription_expires_at: null,
  });
}

/** If a name was saved at signup (email confirmation), create the restaurant once. */
export async function tryCreateRestaurantFromPending(userId) {
  const pending = getPendingRestaurantName();
  if (!pending) return false;
  const { data, error } = await createRestaurantForNewUser(userId, pending);
  if (error || !data) return false;
  clearPendingRestaurantName();
  return true;
}

/** Full row for the authenticated owner's restaurant */
export async function getRestaurantForUser(userId) {
  return supabase.from('restaurants').select('*').eq('user_id', userId).maybeSingle();
}

/** Lightweight check after login (id only) */
export async function getRestaurantIdForUser(userId) {
  return supabase.from('restaurants').select('id').eq('user_id', userId).maybeSingle();
}

/** Public menu: active restaurant by slug */
export async function getActiveRestaurantBySlug(slug) {
  return supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
}

export async function getOpeningHoursForDay(restaurantId, dayOfWeek) {
  return supabase
    .from('opening_hours')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle();
}

export async function createRestaurant(payload) {
  return supabase.from('restaurants').insert(payload).select().single();
}

/** Update restaurant row (owner only). Use for logo_url / cover_url after upload. */
export async function updateRestaurantForOwner(restaurantId, userId, patch) {
  const {
    user_id: _u,
    id: _i,
    subscription_plan: _sp,
    subscription_expires_at: _se,
    is_active: _ia,
    manual_subscription_revenue: _mr,
    ...rest
  } = patch;
  return supabase
    .from('restaurants')
    .update(rest)
    .eq('id', restaurantId)
    .eq('user_id', userId)
    .select()
    .single();
}

/**
 * Upload logo → bucket `logos`, path `{userId}/logo.{ext}`. Store `publicUrl` in `restaurants.logo_url`.
 */
export async function uploadRestaurantLogo(userId, file) {
  return uploadLogoToStorage(userId, file);
}

/**
 * Upload cover / bannière → bucket `covers`. Store `publicUrl` in `restaurants.cover_url`.
 * Uses `userId` in path until restaurant exists (same as logo during onboarding).
 */
export async function uploadRestaurantCover(userId, file) {
  return uploadCoverToStorage(userId, file);
}
