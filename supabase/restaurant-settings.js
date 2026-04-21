import { supabase } from './client.js';

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * @param {object} restaurantRow — from select with restaurant_settings(*)
 * @returns {object} restaurant with flat `.settings` object (defaults if missing)
 */
export function mergeRestaurantSettings(restaurantRow) {
  if (!restaurantRow) return restaurantRow;
  const { restaurant_settings: raw, ...rest } = restaurantRow;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return {
    ...rest,
    settings: {
      currency: row?.currency || 'DZD',
      language: row?.language || 'fr',
      theme_color: row?.theme_color || null,
      primary_color: row?.primary_color || '#D4521A',
      background_color: row?.background_color || '#ffffff',
      text_color: row?.text_color || '#1a1a1a',
      font_family: row?.font_family || 'Poppins',
      theme_name: row?.theme_name || 'Classic',
    },
  };
}

/**
 * Flattens `subscriptions(*, plans(*))` embed into `restaurant.subscription` with nested `plan`.
 * @param {object} restaurantRow
 */
export function mergeRestaurantSubscription(restaurantRow) {
  if (!restaurantRow) return restaurantRow;
  const raw = restaurantRow.subscriptions;
  const subRow = Array.isArray(raw) ? raw[0] : raw;
  let plan = null;
  if (subRow && typeof subRow === 'object') {
    const p = subRow.plans;
    plan = Array.isArray(p) ? p[0] : p;
  }
  const { subscriptions: _s, ...rest } = restaurantRow;
  return {
    ...rest,
    subscription: subRow ? { ...subRow, plan } : null,
  };
}

export async function upsertRestaurantSettings(restaurantId, patch) {
  const payload = {
    restaurant_id: restaurantId,
    updated_at: new Date().toISOString(),
  };
  if (patch.currency != null) payload.currency = String(patch.currency).trim().slice(0, 8).toUpperCase();
  if (patch.language != null) payload.language = String(patch.language).trim().slice(0, 12).toLowerCase();
  if (patch.theme_color !== undefined) {
    const c = String(patch.theme_color || '').trim();
    payload.theme_color = c === '' ? null : c.slice(0, 16);
  }
  if (patch.primary_color !== undefined) payload.primary_color = String(patch.primary_color || '').trim() || '#D4521A';
  if (patch.background_color !== undefined) payload.background_color = String(patch.background_color || '').trim() || '#ffffff';
  if (patch.text_color !== undefined) payload.text_color = String(patch.text_color || '').trim() || '#1a1a1a';
  if (patch.font_family !== undefined) payload.font_family = String(patch.font_family || '').trim() || 'Poppins';
  if (patch.theme_name !== undefined) payload.theme_name = String(patch.theme_name || '').trim() || 'Classic';
  return supabase.from('restaurant_settings').upsert(payload, { onConflict: 'restaurant_id' }).select().single();
}

export async function listOpeningHours(restaurantId) {
  return supabase
    .from('opening_hours')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('day_of_week', { ascending: true });
}

/**
 * @param {object} row — { day_of_week, open_time, close_time, is_closed }
 */
export async function upsertOpeningHour(restaurantId, row) {
  const d = Number(row.day_of_week);
  if (!Number.isInteger(d) || d < 0 || d > 6) {
    return { data: null, error: new Error('day_of_week invalide') };
  }
  const isClosed = !!row.is_closed;
  const payload = {
    restaurant_id: restaurantId,
    day_of_week: d,
    is_closed: isClosed,
    open_time: isClosed ? '12:00' : String(row.open_time || '09:00').slice(0, 8),
    close_time: isClosed ? '12:00' : String(row.close_time || '22:00').slice(0, 8),
  };
  return supabase.from('opening_hours').upsert(payload, { onConflict: 'restaurant_id,day_of_week' }).select().single();
}

/** Ensure defaults exist for all 7 days (best-effort). */
export async function ensureOpeningHoursTemplate(restaurantId) {
  for (const d of DAY_KEYS) {
    const { data } = await supabase
      .from('opening_hours')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('day_of_week', d)
      .maybeSingle();
    if (!data) {
      await supabase.from('opening_hours').insert({
        restaurant_id: restaurantId,
        day_of_week: d,
        is_closed: d === 0,
        open_time: '11:30',
        close_time: '22:30',
      });
    }
  }
}
