import { supabase } from './client.js';
import { uploadProductImageToStorage } from './storage.js';

/**
 * Products are scoped by `restaurant_id` and linked to `category_id`.
 * Images go to Storage bucket `products` under `{restaurantId}/{timestamp}.{ext}`.
 */

export async function listProductsWithCategory(restaurantId) {
  return supabase
    .from('products')
    .select('*, categories(name)')
    .eq('restaurant_id', restaurantId)
    .order('position');
}

export async function listAvailableProductsForMenu(restaurantId) {
  return supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .order('position');
}

export async function getProductById(id) {
  return supabase.from('products').select('*').eq('id', id).maybeSingle();
}

export async function getProductForRestaurant(productId, restaurantId) {
  return supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
}

/** Insert: `restaurant_id` is forced; do not pass `restaurant_id` in fields to reassign. */
export async function insertProductForRestaurant(restaurantId, fields) {
  const { restaurant_id: _r, id: _i, ...rest } = fields;
  return supabase.from('products').insert({
    ...rest,
    restaurant_id: restaurantId,
  });
}

export async function insertProduct(payload) {
  return supabase.from('products').insert(payload);
}

export async function updateProductForRestaurant(productId, restaurantId, fields) {
  const { restaurant_id: _r, id: _i, ...rest } = fields;
  return supabase
    .from('products')
    .update(rest)
    .eq('id', productId)
    .eq('restaurant_id', restaurantId);
}

export async function updateProduct(id, payload) {
  return supabase.from('products').update(payload).eq('id', id);
}

export async function setProductAvailableForRestaurant(productId, restaurantId, isAvailable) {
  return supabase
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId)
    .eq('restaurant_id', restaurantId);
}

export async function setProductAvailable(id, isAvailable) {
  return supabase.from('products').update({ is_available: isAvailable }).eq('id', id);
}

export async function deleteProductForRestaurant(productId, restaurantId) {
  return supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('restaurant_id', restaurantId);
}

export async function deleteProduct(id) {
  return supabase.from('products').delete().eq('id', id);
}

export async function countAvailableProducts(restaurantId) {
  return supabase
    .from('products')
    .select('id', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true);
}

/**
 * Upload product image → bucket `products`, then save returned `publicUrl` in `products.image_url`.
 */
export async function uploadProductImage(restaurantId, file) {
  const { publicUrl, error } = await uploadProductImageToStorage(restaurantId, file);
  return { publicUrl, error };
}
