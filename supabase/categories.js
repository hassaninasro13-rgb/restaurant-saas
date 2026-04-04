import { supabase } from './client.js';

/**
 * All category rows are scoped by `restaurant_id`.
 * Use *ForRestaurant helpers for writes so updates/deletes cannot target another restaurant.
 */

export async function listCategoriesWithProductCounts(restaurantId) {
  return supabase
    .from('categories')
    .select('*, products(count)')
    .eq('restaurant_id', restaurantId)
    .order('position');
}

export async function listCategoriesForRestaurant(restaurantId) {
  return supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('position');
}

export async function listVisibleCategoriesForMenu(restaurantId) {
  return supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_visible', true)
    .order('position');
}

export async function getCategoryById(id) {
  return supabase.from('categories').select('*').eq('id', id).maybeSingle();
}

export async function getCategoryForRestaurant(categoryId, restaurantId) {
  return supabase
    .from('categories')
    .select('*')
    .eq('id', categoryId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
}

/** Insert with `restaurant_id` enforced (do not pass restaurant_id in fields). */
export async function insertCategoryForRestaurant(restaurantId, fields) {
  const { restaurant_id: _, ...rest } = fields;
  return supabase.from('categories').insert({
    ...rest,
    restaurant_id: restaurantId,
    is_visible: fields.is_visible !== undefined ? fields.is_visible : true,
  });
}

/** Legacy: full payload including restaurant_id (prefer insertCategoryForRestaurant). */
export async function insertCategory(payload) {
  return supabase.from('categories').insert(payload);
}

export async function updateCategoryForRestaurant(categoryId, restaurantId, fields) {
  const { restaurant_id: _, id: __, ...rest } = fields;
  return supabase
    .from('categories')
    .update(rest)
    .eq('id', categoryId)
    .eq('restaurant_id', restaurantId);
}

export async function updateCategory(id, payload) {
  return supabase.from('categories').update(payload).eq('id', id);
}

export async function setCategoryVisibleForRestaurant(categoryId, restaurantId, isVisible) {
  return supabase
    .from('categories')
    .update({ is_visible: isVisible })
    .eq('id', categoryId)
    .eq('restaurant_id', restaurantId);
}

export async function setCategoryVisible(id, isVisible) {
  return supabase.from('categories').update({ is_visible: isVisible }).eq('id', id);
}

export async function deleteCategoryForRestaurant(categoryId, restaurantId) {
  return supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('restaurant_id', restaurantId);
}

export async function deleteCategory(id) {
  return supabase.from('categories').delete().eq('id', id);
}

export async function countCategoriesForRestaurant(restaurantId) {
  return supabase
    .from('categories')
    .select('id', { count: 'exact' })
    .eq('restaurant_id', restaurantId);
}
