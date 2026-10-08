// کلاینت API — مدیریت خطای مهربان (بند ۴۷): هیچ خطای خامی به کاربر نشان داده نمی‌شود.
import { t } from './i18n.js';

let token = localStorage.getItem('bk_token') || null;
export function setToken(tk) { token = tk; if (tk) localStorage.setItem('bk_token', tk); else localStorage.removeItem('bk_token'); }
export function getToken() { return token; }

export class ApiError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
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

export const api = {
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
