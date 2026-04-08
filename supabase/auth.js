import { supabase } from './client.js';
import { getRestaurantIdForUser, clearPendingRestaurantName } from './restaurants.js';

const SK_USER = 'onetap_user_id';
const SK_RESTAURANT = 'onetap_restaurant_id';

export async function syncAuthContext(userId) {
  if (!userId) {
    clearAuthContext();
    return { restaurantId: null };
  }
  sessionStorage.setItem(SK_USER, userId);
  const { data } = await getRestaurantIdForUser(userId);
  if (data?.id) sessionStorage.setItem(SK_RESTAURANT, data.id);
  else sessionStorage.removeItem(SK_RESTAURANT);
  return { restaurantId: data?.id ?? null };
}

export function getStoredUserId() {
  return sessionStorage.getItem(SK_USER);
}

export function getStoredRestaurantId() {
  return sessionStorage.getItem(SK_RESTAURANT);
}

export function clearAuthContext() {
  sessionStorage.removeItem(SK_USER);
  sessionStorage.removeItem(SK_RESTAURANT);
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function requireAuth(redirectTo = 'login.html') {
  let { data: { session } } = await supabase.auth.getSession();

  // Give Supabase a brief moment to hydrate session after signup/login redirects.
  if (!session) {
    const startedAt = Date.now();
    while (!session && Date.now() - startedAt < 1800) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      ({ data: { session } } = await supabase.auth.getSession());
    }
  }

  if (!session) {
    clearAuthContext();
    window.location.href = redirectTo;
    return null;
  }
  await syncAuthContext(session.user.id);
  return session;
}

export async function signInWithPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, options = {}) {
  return supabase.auth.signUp({ email, password, ...options });
}

export async function signOut(redirectTo = 'login.html') {
  clearAuthContext();
  clearPendingRestaurantName();
  await supabase.auth.signOut();
  if (redirectTo) window.location.href = redirectTo;
}
