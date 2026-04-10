import { supabase } from './client.js';

export function listIngredients(restaurantId) {
  return supabase
    .from('ingredients')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name', { ascending: true });
}

export function insertIngredient(row) {
  return supabase.from('ingredients').insert(row).select().single();
}

export function updateIngredient(id, patch) {
  return supabase.from('ingredients').update(patch).eq('id', id).select().single();
}
