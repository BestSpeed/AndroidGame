'use strict';
// رویدادهای آنالیتیکس — بند ۳۸. حلقه محدود + شمارنده تجمیعی.
const { store } = require('./db');
const { ids } = require('./ids');

const MAX_EVENTS = 5000;
const VALID_EVENTS = new Set([
  'app_open', 'login', 'tutorial_start', 'tutorial_complete',
  'matchmaking_start', 'match_found', 'match_start', 'minigame_start', 'minigame_finish',
  'match_finish', 'win', 'loss', 'rematch_click', 'room_create', 'room_join',
  'friend_invite', 'ad_offer', 'ad_complete', 'shop_open', 'item_view',
  'iap_start', 'iap_success', 'iap_failed', 'daily_challenge_start', 'daily_challenge_finish',
  'disconnect', 'reconnect', 'crash', 'cheat_flag',
]);

function track(userId, name, params = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') clean[k] = v.slice(0, 200);
    else if (typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
  }
  const rec = { id: ids.event(), ts: Date.now(), userId: userId || null, name, params: clean };
  const ev = store.col.analytics.events;
  ev.push(rec);
  if (ev.length > MAX_EVENTS) ev.splice(0, ev.length - MAX_EVENTS);
  store.col.counters.events[name] = (store.col.counters.events[name] || 0) + 1;
  store.scheduleSave();
}

// رویدادهای دسته‌ای از کلاینت
function trackBatch(userId, events) {
  if (!Array.isArray(events)) return 0;
  let n = 0;
  for (const e of events.slice(0, 100)) {
    if (!e || typeof e.name !== 'string') continue;
    if (!VALID_EVENTS.has(e.name)) continue;
    track(userId, e.name, e.params || {});
    n++;
  }
  return n;
}

function summary() {
  return { counters: store.col.counters.events, storedEvents: store.col.analytics.events.length };
}

module.exports = { track, trackBatch, summary, VALID_EVENTS };
