import { supabase } from './client.js';
import { isSubscriptionActive } from './subscriptions.js';

/** Count order toward revenue (completed / delivered). */
const REVENUE_STATUSES = new Set(['done', 'delivered']);

/**
 * Paginated fetch of all orders (platform admin RLS).
 * @returns {Promise<{ orders: object[], error: Error | null }>}
 */
export async function fetchAllOrdersForPlatformAdmin() {
  const all = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, restaurant_id, created_at, total_amount, status')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { orders: [], error };
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { orders: all, error: null };
}

/**
 * Aggregate KPIs, monthly series, and per-restaurant order counts.
 * @param {object[]} restaurants — from listRestaurantsForAdmin (incl. created_at, manual_subscription_revenue)
 * @param {object[]} orders — from fetchAllOrdersForPlatformAdmin
 */
export function computePlatformAnalytics(restaurants, orders) {
  const now = new Date();
  const totalRestaurants = restaurants.length;

  let activeSubscriptions = 0;
  let expiredSubscriptions = 0;
  for (const r of restaurants) {
    if (r.is_active === false) continue;
    if (isSubscriptionActive(r)) activeSubscriptions += 1;
    else expiredSubscriptions += 1;
  }

  const orderCountsByRestaurant = {};
  let totalOrders = 0;
  let orderRevenue = 0;
  const monthlyOrderCount = {};

  for (const o of orders) {
    totalOrders += 1;
    const rid = o.restaurant_id;
    if (rid) orderCountsByRestaurant[rid] = (orderCountsByRestaurant[rid] || 0) + 1;
    const st = String(o.status || '').toLowerCase();
    if (REVENUE_STATUSES.has(st)) {
      orderRevenue += Number(o.total_amount) || 0;
    }
    if (o.created_at) {
      const d = new Date(o.created_at);
      if (!Number.isNaN(d.getTime())) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyOrderCount[key] = (monthlyOrderCount[key] || 0) + 1;
      }
    }
  }

  const monthlyNewRestaurants = {};
  for (const r of restaurants) {
    if (!r.created_at) continue;
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyNewRestaurants[key] = (monthlyNewRestaurants[key] || 0) + 1;
  }

  let manualSubscriptionRevenueTotal = 0;
  for (const r of restaurants) {
    manualSubscriptionRevenueTotal += Number(r.manual_subscription_revenue) || 0;
  }

  const months6 = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months6.push({
      key,
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      count: monthlyOrderCount[key] || 0,
    });
  }

  const cur = months6[months6.length - 1]?.count ?? 0;
  const prev = months6[months6.length - 2]?.count ?? 0;
  const growthPct = prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

  const months12New = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months12New.push({
      key,
      label: d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      count: monthlyNewRestaurants[key] || 0,
    });
  }

  const maxBarOrders = Math.max(1, ...months6.map((m) => m.count));
  const maxBarNew = Math.max(1, ...months12New.map((m) => m.count));

  const ordersPerRestaurant = restaurants
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      count: orderCountsByRestaurant[r.id] || 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRestaurants,
    activeSubscriptions,
    expiredSubscriptions,
    totalOrders,
    orderRevenue,
    manualSubscriptionRevenueTotal,
    months6OrderGrowth: { months: months6, growthPct, currentMonth: cur, previousMonth: prev, maxBar: maxBarOrders },
    months12NewRestaurants: { months: months12New, maxBar: maxBarNew },
    ordersPerRestaurant,
    orderCountsByRestaurant,
  };
}
