/* ═══════════════════════════════════════════════════
   OneTap Menu — Shared JS
   UI utilities + re-exports from supabase/
═══════════════════════════════════════════════════ */

export { supabase } from '../supabase/client.js';
export {
  requireAuth,
  getSession,
  signInWithPassword,
  signUp,
  signOut,
  syncAuthContext,
  getStoredUserId,
  getStoredRestaurantId,
  clearAuthContext,
} from '../supabase/auth.js';
export { getRestaurantForUser as getRestaurant } from '../supabase/restaurants.js';
export { mergeRestaurantSettings } from '../supabase/restaurant-settings.js';
import { t, hydrateI18n, setI18nLanguage, getActiveLang, normalizeLang } from './i18n.js';
export { t, hydrateI18n, setI18nLanguage, getActiveLang, normalizeLang };

const DEFAULT_ACCENT = '#e85c2c';

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex) {
  const h = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function shadeHex(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const f = 1 + amount;
  return rgbToHex(rgb.r * f, rgb.g * f, rgb.b * f);
}

function mixWithWhite(hex, whitePortion) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const w = clamp(whitePortion, 0, 1);
  return rgbToHex(
    rgb.r + (255 - rgb.r) * w,
    rgb.g + (255 - rgb.g) * w,
    rgb.b + (255 - rgb.b) * w,
  );
}

function hexToAccentRgbString(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '232, 92, 44';
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

/**
 * Sets accent CSS variables on :root (buttons, links, focus rings, header tints).
 * Also sets --accent-rgb for rgba(var(--accent-rgb), a) in stylesheets.
 */
export function applyRestaurantTheme(themeColor) {
  const root = document.documentElement;
  const raw = String(themeColor || '').trim();
  const valid = /^#?[0-9a-fA-F]{6}$/.test(raw);
  const base = valid ? (raw.startsWith('#') ? raw : `#${raw}`) : DEFAULT_ACCENT;
  const dk = shadeHex(base, -0.22) || '#c24820';
  const lt = mixWithWhite(base, 0.9) || '#fdf0eb';
  root.style.setProperty('--accent', base);
  root.style.setProperty('--accent-dk', dk);
  root.style.setProperty('--accent-lt', lt);
  root.style.setProperty('--accent-rgb', hexToAccentRgbString(base));
}

/** Sets html lang + dir and active i18n dictionary. */
export function applyRestaurantHtmlLang(language) {
  setI18nLanguage(language);
}

export function getRestaurantCurrency(rest) {
  return rest?.settings?.currency || 'DZD';
}

/** Locale for number formatting; aligns with settings.language for future i18n. */
export function getRestaurantLocale(rest) {
  const lang = String(rest?.settings?.language || 'fr').toLowerCase().slice(0, 12);
  if (lang === 'en') return 'en-US';
  if (lang === 'ar') return 'ar-DZ';
  return 'fr-DZ';
}

export function applyRestaurantClientPrefs(rest) {
  const s = rest?.settings;
  applyRestaurantTheme(s?.theme_color);
  setI18nLanguage(s?.language);
}

/** Staff sidebar: optional logo next to brand (ids: #staff-sidebar-logo, #staff-sidebar-logo-img). */
export function renderStaffSidebarLogo(rest) {
  const wrap = document.getElementById('staff-sidebar-logo');
  const img = document.getElementById('staff-sidebar-logo-img');
  if (!wrap) return;
  const url = rest?.logo_url;
  if (url && img) {
    img.src = url;
    img.alt = rest?.name ? `${rest.name} — logo` : 'Logo';
    wrap.hidden = false;
  } else {
    wrap.hidden = true;
    if (img) img.removeAttribute('src');
  }
}

export function applyStaffShellBranding(rest) {
  applyRestaurantClientPrefs(rest);
  renderStaffSidebarLogo(rest);
}

/* ── TOAST ── */
let toastContainer = null;
function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
}

export function toast(message, type = 'default', duration = 3500) {
  ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all .25s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ── PAGE LOADER ── */
export function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) loader.classList.add('hidden');
}

/* ── FORMAT HELPERS ── */
export function fmtCurrency(amount, currency = 'DZD', locale = 'fr-DZ') {
  const n = Number(amount || 0);
  return `${n.toLocaleString(locale)} ${currency}`;
}

export function fmtDate(iso, locale = 'fr-DZ') {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** @deprecated use orderSourceTypeLabel(); kept for older imports */
export const ORDER_SOURCE_TYPE_LABELS = {
  table: 'Table',
  takeaway: 'À emporter',
  counter: 'Comptoir',
  delivery: 'Livraison',
  door: 'Porte',
};

export function orderSourceTypeLabel(type) {
  if (!type) return '';
  const key = `sourceType.${type}`;
  const out = t(key);
  return out === key ? String(type) : out;
}

/**
 * Staff-facing one line: "Livraison · delivery" (name is URL slug / display name).
 * Not HTML-escaped — use esc() in templates.
 */
export function formatOrderSourceForDisplay(o) {
  const name = o?.source_name ?? o?.table_name ?? o?.table_number;
  if (name == null || String(name).trim() === '') return '';
  const t = o?.source_type;
  const lab = t ? orderSourceTypeLabel(t) : '';
  return lab ? `${lab} · ${String(name)}` : String(name);
}

/** Kitchen workflow + legacy values still stored in older rows */
export const ORDER_WORKFLOW_STATUSES = ['new', 'preparing', 'ready', 'completed'];

export function isTerminalOrderStatus(status) {
  const s = String(status || '');
  return s === 'completed' || s === 'cancelled' || s === 'done' || s === 'delivered';
}

export function getStatusBadge(status) {
  const colorMap = {
    new: 'blue',
    preparing: 'amber',
    ready: 'green',
    completed: 'gray',
    cancelled: 'red',
    confirmed: 'purple',
    done: 'gray',
    delivered: 'gray',
  };
  const s = String(status || '');
  const color = colorMap[s] || 'gray';
  const key = `status.${s}`;
  let label = t(key);
  if (label === key) label = s || '—';
  return `<span class="badge badge-${color}">${label}</span>`;
}
