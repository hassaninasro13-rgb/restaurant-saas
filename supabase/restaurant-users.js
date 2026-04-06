import { supabase } from './client.js';

export const RESTAURANT_ROLES = ['owner', 'admin', 'staff', 'kitchen'];

export function isRestaurantRoleAllowed(role, allowedRoles) {
  return allowedRoles.includes(String(role || '').toLowerCase());
}

export function getRoleHomePath(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'kitchen') return 'kitchen.html';
  if (r === 'staff') return 'orders.html';
  return 'dashboard.html';
}

export async function syncRestaurantUserLink(user) {
  if (!user?.id) return;
  await supabase.rpc('sync_restaurant_user_on_login', {
    p_user_id: user.id,
    p_email: user.email || '',
  });
}

export async function getMyRestaurantAccess(user) {
  if (!user?.id) return { data: null, error: new Error('Session invalide.') };
  await syncRestaurantUserLink(user);
  const direct = await supabase
    .from('restaurant_users')
    .select('id, restaurant_id, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (direct.data) return { data: direct.data, error: null };

  // Backward compatibility: owner row may exist without restaurant_users link.
  const fallback = await supabase
    .from('restaurants')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (fallback.data?.id) {
    return {
      data: { id: null, restaurant_id: fallback.data.id, role: 'owner', is_active: true },
      error: null,
    };
  }
  return { data: null, error: direct.error || fallback.error || null };
}

export async function listRestaurantUsers(restaurantId) {
  return supabase
    .from('restaurant_users')
    .select('id, restaurant_id, user_id, email, role, is_active, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true });
}

export async function createRestaurantUser(restaurantId, { email, role }) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return { data: null, error: new Error('Email invalide.') };
  const r = RESTAURANT_ROLES.includes(role) ? role : 'staff';
  return supabase
    .from('restaurant_users')
    .insert({ restaurant_id: restaurantId, email: e, role: r, is_active: true })
    .select()
    .single();
}

export async function updateRestaurantUser(restaurantUserId, patch) {
  const body = {};
  if (patch?.role && RESTAURANT_ROLES.includes(patch.role)) body.role = patch.role;
  if (patch?.is_active === true || patch?.is_active === false) body.is_active = patch.is_active;
  if (Object.keys(body).length === 0) return { data: null, error: new Error('Aucun champ à mettre à jour.') };
  return supabase.from('restaurant_users').update(body).eq('id', restaurantUserId).select().single();
}

export async function deleteRestaurantUser(restaurantUserId) {
  return supabase.from('restaurant_users').delete().eq('id', restaurantUserId);
}
