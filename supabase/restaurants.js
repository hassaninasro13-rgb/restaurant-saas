import { supabase } from './client.js';
import { uploadLogoToStorage, uploadCoverToStorage } from './storage.js';
import { mergeRestaurantSettings, mergeRestaurantSubscription } from './restaurant-settings.js';

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
  const created = await createRestaurant({
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
  let demoCreated = false;
  let demoError = null;
  if (created.data?.id) {
    const demoRes = await ensureDemoSetupForRestaurant(created.data.id);
    demoCreated = !!demoRes?.created;
    demoError = demoRes?.error || null;
  }
  return { ...created, demoCreated, demoError };
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
  const res = await supabase
    .from('restaurants')
    .select('*, restaurant_settings(*), subscriptions(*, plans(*))')
    .eq('user_id', userId)
    .maybeSingle();
  if (res.data) {
    res.data = mergeRestaurantSubscription(mergeRestaurantSettings(res.data));
  }
  return res;
}

/** Full row by restaurant id (for staff/admin role-based access). */
export async function getRestaurantById(restaurantId) {
  const res = await supabase
    .from('restaurants')
    .select('*, restaurant_settings(*), subscriptions(*, plans(*))')
    .eq('id', restaurantId)
    .maybeSingle();
  if (res.data) {
    res.data = mergeRestaurantSubscription(mergeRestaurantSettings(res.data));
  }
  return res;
}

/** Lightweight check after login (id only) */
export async function getRestaurantIdForUser(userId) {
  return supabase.from('restaurants').select('id').eq('user_id', userId).maybeSingle();
}

/** Public menu: active restaurant by slug */
export async function getActiveRestaurantBySlug(slug) {
  const res = await supabase
    .from('restaurants')
    .select('*, restaurant_settings(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (res.data) res.data = mergeRestaurantSettings(res.data);
  return res;
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

/**
 * One-time demo bootstrap for a new restaurant.
 * Creates starter categories, products, and order sources when restaurant data is empty.
 */
export async function ensureDemoSetupForRestaurant(restaurantId) {
  if (!restaurantId) return { created: false, error: new Error('restaurantId requis.') };
  const [catsCountRes, prodsCountRes, srcCountRes] = await Promise.all([
    supabase.from('categories').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
    supabase.from('order_sources').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
  ]);
  const hasAnyData = (catsCountRes.count || 0) > 0 || (prodsCountRes.count || 0) > 0 || (srcCountRes.count || 0) > 0;
  if (hasAnyData) return { created: false, error: null };

  const { data: insertedCats, error: catErr } = await supabase
    .from('categories')
    .insert([
      { restaurant_id: restaurantId, name: 'Drinks', position: 1, is_visible: true },
      { restaurant_id: restaurantId, name: 'Main dishes', position: 2, is_visible: true },
    ])
    .select('id, name');
  if (catErr) return { created: false, error: catErr };

  const drinksId = insertedCats?.find((c) => c.name === 'Drinks')?.id;
  const mainsId = insertedCats?.find((c) => c.name === 'Main dishes')?.id;
  if (!drinksId || !mainsId) return { created: false, error: new Error('Categories demo manquantes.') };

  const { error: prodErr } = await supabase.from('products').insert([
    {
      restaurant_id: restaurantId,
      category_id: drinksId,
      name: 'Fresh Lemonade',
      description: 'House lemonade with mint.',
      price: 250,
      position: 1,
      is_available: true,
      is_visible: true,
    },
    {
      restaurant_id: restaurantId,
      category_id: drinksId,
      name: 'Iced Tea',
      description: 'Cold black tea with lemon.',
      price: 220,
      position: 2,
      is_available: true,
      is_visible: true,
    },
    {
      restaurant_id: restaurantId,
      category_id: mainsId,
      name: 'Grilled Chicken Plate',
      description: 'Served with fries and salad.',
      price: 1200,
      position: 1,
      is_available: true,
      is_visible: true,
    },
    {
      restaurant_id: restaurantId,
      category_id: mainsId,
      name: 'Veggie Pasta',
      description: 'Pasta with tomato and seasonal vegetables.',
      price: 980,
      position: 2,
      is_available: true,
      is_visible: true,
    },
  ]);
  if (prodErr) return { created: false, error: prodErr };

  const { error: srcErr } = await supabase.from('order_sources').insert([
    { restaurant_id: restaurantId, name: 'Table 1', type: 'table' },
    { restaurant_id: restaurantId, name: 'Takeaway', type: 'takeaway' },
    { restaurant_id: restaurantId, name: 'Delivery', type: 'delivery' },
  ]);
  if (srcErr) return { created: false, error: srcErr };

  return { created: true, error: null };
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

/** Update restaurant row through RLS manager role checks (owner/admin). */
export async function updateRestaurantForManager(restaurantId, patch) {
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
