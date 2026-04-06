/**
 * Client cart persistence (localStorage) — shared by menu.html and index.html.
 *
 * Storage format (per restaurant slug):
 *   Key:   onetap_cart_v1_<slug>
 *   Value: JSON object mapping product_id (string) → quantity (number)
 *   Example: { "uuid-a": 2, "uuid-b": 1 }
 *
 * Only ids and quantities are stored; product rows are re-hydrated from the
 * loaded menu so name/price/image stay in sync with Supabase.
 */

export const CART_LS_PREFIX = 'onetap_cart_v1_';

export function cartStorageKey(slug) {
  return `${CART_LS_PREFIX}${String(slug || '').trim()}`;
}

/** @returns {Record<string, number>} */
export function loadCartQtyMap(slug) {
  if (!slug || !String(slug).trim()) return {};
  try {
    const raw = localStorage.getItem(cartStorageKey(slug));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    for (const [id, qty] of Object.entries(parsed)) {
      const n = Number(qty);
      if (!Number.isFinite(n) || n < 1) continue;
      out[id] = Math.min(Math.floor(n), 999);
    }
    return out;
  } catch {
    return {};
  }
}

/** @param {Record<string, number>} map */
export function saveCartQtyMap(slug, map) {
  if (!slug || !String(slug).trim()) return;
  try {
    const key = cartStorageKey(slug);
    const minimal = {};
    for (const [id, q] of Object.entries(map)) {
      const n = Number(q);
      if (!Number.isFinite(n) || n < 1) continue;
      minimal[id] = Math.min(Math.floor(n), 999);
    }
    if (Object.keys(minimal).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(minimal));
  } catch (_) {}
}

export function clearCartStorage(slug) {
  try {
    localStorage.removeItem(cartStorageKey(slug));
  } catch (_) {}
}

/**
 * @param {Record<string, number>} map
 * @param {object[]} products
 * @returns {Record<string, { product: object, qty: number }>}
 */
export function hydrateCartFromQtyMap(map, products) {
  const out = {};
  for (const [id, qty] of Object.entries(map)) {
    const p = products.find((x) => x.id === id);
    if (p) out[id] = { product: p, qty };
  }
  return out;
}

/** Load from localStorage and merge with current product list. */
export function hydrateCart(slug, products) {
  return hydrateCartFromQtyMap(loadCartQtyMap(slug), products);
}

/**
 * @param {string} slug
 * @param {Record<string, { product: object, qty: number }>} cart
 */
export function persistCart(slug, cart) {
  const minimal = {};
  for (const [id, v] of Object.entries(cart)) {
    if (v && typeof v.qty === 'number' && v.qty > 0) minimal[id] = Math.min(Math.floor(v.qty), 999);
  }
  saveCartQtyMap(slug, minimal);
}
