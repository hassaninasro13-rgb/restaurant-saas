import { supabase } from './client.js';

export async function notifyNewRestaurantSignup(restaurantId) {
  if (!restaurantId) return { data: null, error: new Error('restaurantId requis.') };
  return supabase.functions.invoke('notify-new-restaurant', {
    body: { restaurant_id: restaurantId },
  });
}

export async function notifyNewOrderCreated(orderId) {
  if (!orderId) return { data: null, error: new Error('orderId requis.') };
  return supabase.functions.invoke('notify-new-order', {
    body: { order_id: orderId },
  });
}

export async function notifyRestaurantUserInvited({ restaurantId, email, role }) {
  if (!restaurantId || !email) return { data: null, error: new Error('Payload invitation invalide.') };
  return supabase.functions.invoke('notify-user-invited', {
    body: { restaurant_id: restaurantId, email, role: role || 'staff' },
  });
}

export async function sendSubscriptionExpiryReminders(days = 3) {
  return supabase.functions.invoke('notify-subscription-expiry', {
    body: { days_before: days },
  });
}
