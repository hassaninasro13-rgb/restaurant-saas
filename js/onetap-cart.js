/**
 * Client cart persistence (localStorage) — shared by menu pages.
 *
 * v1 (legacy): onetap_cart_v1_<slug> → { productId: qty }
 * v2: onetap_cart_v2_<slug> → { v: 2, lines: [...] } with customization per line
 */

export const CART_LS_PREFIX = 'onetap_cart_v1_';

const cartV2Key = (slug) => `onetap_cart_v2_${String(slug || '').trim()}`;

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
    localStorage.removeItem(cartV2Key(slug));
  } catch (_) {}
}

function loadCartV2Raw(slug) {
  if (!slug || !String(slug).trim()) return null;
  try {
    const raw = localStorage.getItem(cartV2Key(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 2 || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCartV2Raw(slug, payload) {
  if (!slug || !String(slug).trim()) return;
  try {
    if (!payload?.lines?.length) localStorage.removeItem(cartV2Key(slug));
    else localStorage.setItem(cartV2Key(slug), JSON.stringify(payload));
  } catch (_) {}
}

/**
 * @param {Record<string, number>} map
 * @param {object[]} products
 * @returns {Record<string, { product: object, qty: number, customization: object }>}
 */
function hydrateFromQtyMap(map, products) {
  const out = {};
  for (const [id, qty] of Object.entries(map)) {
    const p = products.find((x) => x.id === id);
    if (!p) continue;
    const lineId = `legacy_${id}`;
    out[lineId] = {
      product: p,
      qty: Math.min(Math.floor(qty), 999),
      customization: {
        product_id: p.id,
        name: p.name,
        base_price: p.price,
        removed_ingredients: [],
        supplements: [],
        total_price: p.price,
      },
    };
  }
  return out;
}

/**
 * @param {object[]} products
 * @returns {Record<string, { product: object, qty: number, customization: object }>}
 */
export function hydrateCartFromQtyMap(map, products) {
  return hydrateFromQtyMap(map, products);
}

/**
 * @param {string} slug
 * @param {object[]} products
 * @returns {Record<string, { product: object, qty: number, customization: object }>}
 */
export function hydrateCart(slug, products) {
  const v2 = loadCartV2Raw(slug);
  if (v2?.lines?.length) {
    const out = {};
    for (const ln of v2.lines) {
      const p = products.find((x) => x.id === ln.product_id);
      if (!p) continue;
      const lineId = ln.id || `ln_${ln.product_id}_${Math.random().toString(36).slice(2)}`;
      const supplements = (ln.supplements || []).map((s) => ({
        name: s.n ?? s.name,
        price: Number(s.p ?? s.price ?? 0),
        qty: Math.max(0, Math.floor(s.q ?? s.qty ?? 1)),
      }));
      out[lineId] = {
        product: p,
        qty: Math.min(Math.max(1, Math.floor(ln.qty || 1)), 999),
        customization: {
          product_id: ln.product_id,
          name: ln.name || p.name,
          base_price: Number(ln.base_price ?? p.price),
          removed_ingredients: Array.isArray(ln.removed) ? ln.removed : [],
          supplements,
          total_price: Number(ln.unit_price ?? p.price),
        },
      };
    }
    if (Object.keys(out).length) return out;
  }
  return hydrateFromQtyMap(loadCartQtyMap(slug), products);
}

/**
 * @param {string} slug
 * @param {Record<string, { product: object, qty: number, customization?: object }>} cart
 */
export function persistCart(slug, cart) {
  if (!slug || !String(slug).trim()) return;
  const entries = Object.entries(cart || {}).filter(([, v]) => v && typeof v.qty === 'number' && v.qty > 0);
  if (entries.length === 0) {
    clearCartStorage(slug);
    return;
  }
  const lines = entries.map(([id, v]) => {
    const p = v.product;
    const c = v.customization;
    return {
      id,
      product_id: p.id,
      qty: Math.min(Math.floor(v.qty), 999),
      name: c?.name ?? p.name,
      base_price: c?.base_price ?? p.price,
      removed: c?.removed_ingredients ?? [],
      supplements: (c?.supplements || []).map((s) => ({
        n: s.name,
        p: s.price,
        q: s.qty ?? 1,
      })),
      unit_price: c?.total_price ?? p.price,
    };
  });
  saveCartV2Raw(slug, { v: 2, lines });
  try {
    localStorage.removeItem(cartStorageKey(slug));
  } catch (_) {}
}
