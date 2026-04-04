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
export function fmtCurrency(amount, currency = 'DZD') {
  return `${Number(amount || 0).toLocaleString('fr-DZ')} ${currency}`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-DZ', {
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

export function getStatusBadge(status) {
  const map = {
    new:       ['Nouvelle', 'blue'],
    confirmed: ['Confirmée', 'purple'],
    preparing: ['En préparation', 'amber'],
    ready:     ['Prête', 'green'],
    done:      ['Terminée', 'green'],
    delivered: ['Livrée', 'green'],
    cancelled: ['Annulée', 'red'],
  };
  const [label, color] = map[status] || [status, 'gray'];
  return `<span class="badge badge-${color}">${label}</span>`;
}
