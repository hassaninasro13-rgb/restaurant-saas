/**
 * Anonymous reads for the public menu (no auth).
 * URL: pages/index.html?slug=<restaurant-slug>
 */
import { getActiveRestaurantBySlug, getOpeningHoursForDay } from './restaurants.js';
import { listVisibleCategoriesForMenu } from './categories.js';
import { listAvailableProductsForMenu } from './products.js';
import { isSubscriptionActive } from './subscriptions.js';

/**
 * @returns {Promise<{ restaurant: object | null, categories: object[], products: object[], error: Error | null, menuBlockedReason?: string }>}
 */
export async function loadPublicMenuBySlug(slug) {
  const trimmed = String(slug || '').trim();
  if (!trimmed) {
    return { restaurant: null, categories: [], products: [], error: new Error('missing_slug') };
  }

  const { data: restaurant, error: rErr } = await getActiveRestaurantBySlug(trimmed);
  if (rErr || !restaurant) {
    return { restaurant: null, categories: [], products: [], error: rErr || new Error('not_found') };
  }

  if (!isSubscriptionActive(restaurant)) {
    return {
      restaurant: null,
      categories: [],
      products: [],
      error: null,
      menuBlockedReason: 'subscription_expired',
    };
  }

  const [catsRes, prodsRes] = await Promise.all([
    listVisibleCategoriesForMenu(restaurant.id),
    listAvailableProductsForMenu(restaurant.id),
  ]);

  return {
    restaurant,
    categories: catsRes.data || [],
    products: prodsRes.data || [],
    error: catsRes.error || prodsRes.error || null,
  };
}

export { getOpeningHoursForDay };
