'use strict';
// تبلیغات — بند ۱۵: تشویقی اختیاری، بین‌صفحه‌ای فقط در نقطه امن، فرکانس از کانفیگ.
// ارائه‌دهنده فعلی: شبیه‌ساز داخلی کلاینت. اتصال SDK واقعی (AdMob و…) در لایه بومی — ببینید TODO.
const { configs } = require('./config');
const { store } = require('./db');
const { ids } = require('./ids');
const economy = require('./economy');
const { track } = require('./analytics');

const A = configs.economy.ads;
const nonces = new Map(); // nonce -> {userId, matchId, coins, used}

function registerNonce(userId, nonce, matchId, coins) {
  nonces.set(nonce, { userId, matchId, coins, used: false, ts: Date.now() });
}

function dayKey() { return new Date().toISOString().slice(0, 10); }

function canWatch(userId) {
  const today = Object.values(store.col.adRewards).filter(
    (r) => r.userId === userId && new Date(r.ts).toISOString().slice(0, 10) === dayKey()
  );
  if (today.length >= A.dailyCap) return { ok: false, code: 'daily_cap' };
  const last = today.sort((a, b) => b.ts - a.ts)[0];
  if (last && Date.now() - last.ts < A.rewardedCooldownSec * 1000) return { ok: false, code: 'cooldown' };
  return { ok: true };
}

// کلاینت فقط «تماشا تمام شد» می‌گوید؛ اعطای پاداش با توکن یک‌بارمصرف و سمت سرور است.
function completeRewarded(userId, nonce) {
  const n = nonces.get(nonce);
  if (!n || n.userId !== userId || n.used) return { ok: false, code: 'bad_nonce' };
  const gate = canWatch(userId);
  if (!gate.ok) return gate;
  n.used = true;
  const extra = n.coins * (A.doubleCoinsMultiplier - 1);
  economy.grant(userId, { coins: extra }, `ad:double:${n.matchId}`);
  store.col.adRewards[ids.adReward()] = { userId, context: 'double_coins', matchId: n.matchId, coins: extra, ts: Date.now() };
  store.scheduleSave();
  track(userId, 'ad_complete', { context: 'double_coins', coins: extra });
  return { ok: true, extraCoins: extra };
}

module.exports = { registerNonce, completeRewarded, canWatch };
