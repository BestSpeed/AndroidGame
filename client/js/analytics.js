// آنالیتیکس کلاینت — ارسال دسته‌ای (بند ۳۸)
import { api, getToken } from './api.js';

const queue = [];
let flushTimer = null;

export function ev(name, params = {}) {
  queue.push({ name, ts: Date.now(), params });
  if (!flushTimer) flushTimer = setTimeout(flush, 10000);
}

export async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!queue.length || !getToken()) return;
  const batch = queue.splice(0, 100);
  try { await api.events(batch); } catch { queue.unshift(...batch); if (queue.length > 300) queue.length = 300; }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

// گزارش کرش — بدون افشای اطلاعات حساس
window.addEventListener('error', (e) => {
  ev('crash', { message: String(e.message || '').slice(0, 160), screen: location.hash || '' });
  flush();
});
