import { supabase } from './client.js';

export async function countOrdersForRestaurant(restaurantId) {
  return supabase
    .from('orders')
    .select('id', { count: 'exact' })
    .eq('restaurant_id', restaurantId);
}

/** Admin: exact order counts per restaurant id (parallel head requests). */
export async function countOrdersForRestaurantsMap(restaurantIds) {
  const unique = [...new Set(restaurantIds)].filter(Boolean);
  const map = {};
  await Promise.all(
    unique.map(async (id) => {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', id);
      map[id] = error ? 0 : count ?? 0;
    }),
  );
  return map;
}

export async function countOrdersSince(restaurantId, isoDate) {
  return supabase
    .from('orders')
    .select('id', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', isoDate);
}

/** Orders created since the first day of the current month (UTC-aligned). */
export async function countOrdersThisMonth(restaurantId) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .gte('created_at', d.toISOString());
}

export async function countOrdersByStatus(restaurantId, status) {
  return supabase
    .from('orders')
    .select('id', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .eq('status', status);
}

/** Revenue / “done” KPIs: canonical `completed` plus legacy statuses. */
export async function sumDoneOrdersTotalSince(restaurantId, isoDate) {
  return supabase
    .from('orders')
    .select('total_amount')
    .eq('restaurant_id', restaurantId)
    .in('status', ['completed', 'done', 'delivered'])
    .gte('created_at', isoDate);
}

export async function listRecentOrders(restaurantId, limit = 8) {
  return supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function listOrdersWithItems(restaurantId, limit = 200) {
  return supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function updateOrderStatus(orderId, status) {
  return supabase.from('orders').update({ status }).eq('id', orderId);
}

export async function insertOrder(orderRow) {
  return supabase.from('orders').insert(orderRow).select().single();
}

export async function insertOrderItems(rows) {
  return supabase.from('order_items').insert(rows);
}

/**
 * Creates parent order then line items. Returns `{ data: order, error }`.
 * If items insert fails, the order row still exists (same as manual two-step).
 */
export async function createOrderWithItems(orderRow, itemRows) {
  const { data: order, error: orderError } = await insertOrder(orderRow);
  if (orderError || !order) return { data: null, error: orderError };
  const rowsWithOrder = itemRows.map((r) => ({ ...r, order_id: order.id }));
  const { error: itemsError } = await insertOrderItems(rowsWithOrder);
  if (itemsError) return { data: order, error: itemsError };
  return { data: order, error: null };
}
