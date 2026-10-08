// کلاینت API — دو مسیر: آنلاین (سرور) و آفلاین (موتور محلی). انتخاب خودکار در راه‌اندازی.
// مدیریت خطای مهربان (بند ۴۷): هیچ خطای خامی به کاربر نشان داده نمی‌شود.
import { t } from './i18n.js';
import { ApiError } from './errors.js';
import { offlineApi } from './offline/api.js';

export { ApiError };

let token = localStorage.getItem('bk_token') || null;
export function setToken(tk) { token = tk; if (tk) localStorage.setItem('bk_token', tk); else localStorage.removeItem('bk_token'); }
export function getToken() { return token; }

// ── انتخاب مسیر اتصال ──
let offline = localStorage.getItem('bk_force_offline') === '1';
export function isOffline() { return offline; }
export function setForceOffline(v) {
  if (v) localStorage.setItem('bk_force_offline', '1');
  else localStorage.removeItem('bk_force_offline');
}

export async function initTransport() {
  if (localStorage.getItem('bk_force_offline') === '1') { offline = true; return; }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('/api/config/client', { signal: ctrl.signal });
    clearTimeout(timer);
    offline = !res.ok;
  } catch {
    offline = true; // سرور در دسترس نیست → بازی آفلاین
  }
  if (offline) setToken(token || 'offline');
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('offline', t('err.offline'));
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || !data || data.ok === false) {
    const code = data?.code || 'generic';
    if (code === 'unauthorized') { setToken(null); throw new ApiError('unauthorized', t('err.unauthorized')); }
    throw new ApiError(code, data?.msg || t('err.generic'));
  }
  return data;
}

const onlineApi = {
  guestLogin: () => request('POST', '/auth/guest'),
  me: () => request('GET', '/me'),
  updateMe: (body) => request('PATCH', '/me', body),
  config: () => request('GET', '/config/client'),
  shop: () => request('GET', '/shop'),
  buy: (itemId) => request('POST', '/shop/buy', { itemId }),
  equip: (itemId) => request('POST', '/shop/equip', { itemId }),
  iapStart: (itemId) => request('POST', '/iap/start', { itemId }),
  iapMockComplete: (orderId) => request('POST', '/iap/mock-complete', { orderId }),
  adComplete: (nonce) => request('POST', '/ads/rewarded/complete', { nonce }),
  leaderboard: (type) => request('GET', `/leaderboard?type=${type}`),
  recent: () => request('GET', '/social/recent'),
  follow: (userId, follow) => request('POST', '/social/follow', { userId, follow }),
  block: (userId, block) => request('POST', '/social/block', { userId, block }),
  report: (userId, reason) => request('POST', '/social/report', { userId, reason }),
  daily: () => request('GET', '/daily'),
  dailyStart: () => request('POST', '/daily/start'),
  events: (events) => request('POST', '/events', { events }),
};

// نمای یکپارچه: هر فراخوانی در لحظه به مسیر فعال وصل می‌شود
export const api = {};
for (const key of Object.keys(onlineApi)) {
  api[key] = (...args) => (offline ? offlineApi[key](...args) : onlineApi[key](...args));
}
