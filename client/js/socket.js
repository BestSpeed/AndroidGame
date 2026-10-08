// سوکت بازی — دو مسیر: آنلاین (وب‌سوکت با اتصال مجدد) و آفلاین (موتور محلی با همان پروتکل).
import { getToken, isOffline } from './api.js';
import { t } from './i18n.js';
import { ev } from './analytics.js';
import { localSocket } from './offline/socket.js';

const listeners = new Map(); // type -> Set<fn>
let ws = null, closedByUs = false, attempts = 0, reconnectTimer = null;
let overlayEl = null;
const cfg = { baseDelayMs: 1000, maxDelayMs: 15000, factor: 2 };

export function on(type, fn) {
  if (isOffline()) return localSocket.on(type, fn);
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}

function emit(type, data) {
  for (const fn of listeners.get(type) || []) { try { fn(data); } catch (e) { console.error(e); } }
  for (const fn of listeners.get('*') || []) { try { fn(type, data); } catch (e) { console.error(e); } }
}

export function connect() {
  if (isOffline()) { localSocket.connect(); return; }
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  closedByUs = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(getToken() || '')}`);

  ws.onopen = () => {
    attempts = 0;
    hideOverlay();
    emit('open', {});
  };

  ws.onmessage = (m) => {
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    if (msg && msg.type) emit(msg.type, msg);
  };

  ws.onclose = () => {
    if (closedByUs) return;
    showOverlay();
    scheduleReconnect();
  };
  ws.onerror = () => {};
}

function scheduleReconnect() {
  if (reconnectTimer || closedByUs) return;
  attempts += 1;
  const delay = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(cfg.factor, attempts - 1));
  updateOverlay();
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
}

export function disconnect() {
  if (isOffline()) { localSocket.disconnect(); return; }
  closedByUs = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  hideOverlay();
  try { ws?.close(); } catch {}
}

export function send(type, payload = {}) {
  if (isOffline()) { localSocket.send(type, payload); return; }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

export function sendInput(data) { send('input', { data }); }

function showOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  overlayEl.className = 'conn-overlay';
  overlayEl.innerHTML = `<div style="font-size:44px">📡</div><div style="font-weight:800;font-size:18px">${t('conn.lost')}</div><div class="muted" id="conn-attempt"></div>`;
  document.getElementById('overlay-root').appendChild(overlayEl);
  ev('disconnect', {});
}
function updateOverlay() {
  const el = document.getElementById('conn-attempt');
  if (el) el.textContent = t('conn.try', { n: attempts });
}
function hideOverlay() {
  if (!overlayEl) return;
  overlayEl.remove(); overlayEl = null;
  emit('reconnected', {});
}
