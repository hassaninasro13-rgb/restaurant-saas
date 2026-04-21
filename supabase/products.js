import { supabase } from './client.js';
import { uploadProductImageToStorage } from './storage.js';

/**
 * Products are scoped by `restaurant_id` and linked to `category_id`.
 * Images go to Storage bucket `products` under `{restaurantId}/{timestamp}.{ext}`.
 */

const PRODUCT_WRITE_KEYS = new Set([
  'category_id',
  'name',
  'description',
  'price',
  'compare_price',
  'image_url',
  'position',
  'sort_order',
  'is_available',
  'is_visible',
]);

/** Strip unknown keys and undefined values for safe PostgREST inserts/updates. */
export function sanitizeProductFields(fields) {
  const out = {};
  if (!fields || typeof fields !== 'object') return out;
  for (const k of PRODUCT_WRITE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(fields, k) && fields[k] !== undefined) {
      out[k] = fields[k];
    }
  }
  return out;
}

export async function listProductsWithCategory(restaurantId) {
  return supabase
    .from('products')
    .select('*, categories(name)')
    .eq('restaurant_id', restaurantId)
    .order('position', { ascending: true })
    .order('name', { ascending: true });
}

export async function listAvailableProductsForMenu(restaurantId) {
  return supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .eq('is_visible', true)
    .order('position', { ascending: true })
    .order('name', { ascending: true });
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
  const { restaurant_id: _r, id: _i, ...raw } = fields;
  const rest = sanitizeProductFields(raw);
  return supabase.from('products').insert({
    ...rest,
    restaurant_id: restaurantId,
    is_available: rest.is_available !== undefined ? rest.is_available : true,
    is_visible: rest.is_visible !== undefined ? rest.is_visible : true,
  });
}

export async function insertProduct(payload) {
  return supabase.from('products').insert(payload);
}

export async function updateProductForRestaurant(productId, restaurantId, fields) {
  const { restaurant_id: _r, id: _i, ...raw } = fields;
  const rest = sanitizeProductFields(raw);
  return supabase.from('products').update(rest).eq('id', productId).eq('restaurant_id', restaurantId);
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

export async function setProductVisibleForRestaurant(productId, restaurantId, isVisible) {
  return supabase
    .from('products')
    .update({ is_visible: isVisible })
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
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .eq('is_visible', true);
}

/** All catalog products (for plan limit checks). */
export async function countProductsForRestaurant(restaurantId) {
  return supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);
}

/**
 * Upload product image → bucket `products`, then save returned `publicUrl` in `products.image_url`.
 */
export async function uploadProductImage(restaurantId, file) {
  const { publicUrl, error } = await uploadProductImageToStorage(restaurantId, file);
  return { publicUrl, error };
}
