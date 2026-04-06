import { supabase } from './client.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORDER_SOURCE_TYPES = ['table', 'takeaway', 'counter', 'delivery', 'door'];

/**
 * Public menu: resolve ?source=… or legacy ?table=… (UUID or exact name).
 * @returns {Promise<{ data: { id: string, name: string, type: string } | null, error: Error | null }>}
 */
export async function resolveOrderSourceForPublicOrder(restaurantId, param) {
  const raw = String(param ?? '').trim();
  if (!raw || !restaurantId) return { data: null, error: null };

  if (UUID_RE.test(raw)) {
    return supabase
      .from('order_sources')
      .select('id, name, type')
      .eq('restaurant_id', restaurantId)
      .eq('id', raw)
      .maybeSingle();
  }

  return supabase
    .from('order_sources')
    .select('id, name, type')
    .eq('restaurant_id', restaurantId)
    .eq('name', raw)
    .maybeSingle();
}

export async function listOrderSources(restaurantId) {
  return supabase
    .from('order_sources')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('type', { ascending: true })
    .order('name', { ascending: true });
}

export async function insertOrderSource(restaurantId, name, type) {
  const n = String(name || '').trim();
  const t = ORDER_SOURCE_TYPES.includes(type) ? type : 'table';
  if (!n) return { data: null, error: new Error('Le nom de la source est requis.') };
  return supabase
    .from('order_sources')
    .insert({ restaurant_id: restaurantId, name: n, type: t })
    .select()
    .single();
}

export async function deleteOrderSource(restaurantId, id) {
  return supabase.from('order_sources').delete().eq('id', id).eq('restaurant_id', restaurantId);
}
