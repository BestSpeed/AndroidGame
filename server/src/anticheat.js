'use strict';
// ضدتقلب مدولار — بند ۳۱. هر چک یک تابع مستقل است.
const { track } = require('./analytics');

// نرخ‌سنجی سطل توکن برای هر سوکت+نوع پیام
class RateLimiter {
  constructor(capacity = 12, refillPerSec = 8) {
    this.capacity = capacity; this.refillPerSec = refillPerSec;
    this.buckets = new Map();
  }
  allow(key) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: this.capacity, ts: now }; this.buckets.set(key, b); }
    const elapsed = (now - b.ts) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.ts = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

const inputLimiter = new RateLimiter(14, 10);
const msgLimiter = new RateLimiter(20, 12);

function flag(userId, matchId, rule, detail = {}) {
  track(userId, 'cheat_flag', { rule, matchId: matchId || '', ...detail });
  console.warn(`[anticheat] ${rule} user=${userId} match=${matchId || '-'} ${JSON.stringify(detail)}`);
}

// اعتبارسنجی ساختار ورودی — هر ورودی ناشناخته/بدشکل دور انداخته می‌شود
function validateInput(msg) {
  if (!msg || typeof msg !== 'object') return false;
  switch (msg.t) {
    case 'tap': return typeof msg.ts === 'number';
    case 'dir': return ['up', 'down', 'left', 'right'].includes(msg.d);
    case 'steer': return typeof msg.x === 'number' && msg.x >= -1 && msg.x <= 1 && typeof msg.boost === 'boolean';
    case 'release': return true;
    default: return false;
  }
}

// کران زمان واکنش انسانی — واکنش‌های مکرر زیر این حد = پرچم
function checkReaction(userId, matchId, reactionMs, history) {
  const MIN = 150; // زیر این مقدار عملاً انسانی نیست
  if (reactionMs >= MIN) return;
  history.push(Date.now());
  while (history.length && history[0] < Date.now() - 60000) history.shift();
  if (history.length >= 5) flag(userId, matchId, 'impossible_reaction_streak', { count: history.length });
}

// تشخیص حرکت ناممکن در ریس — خارج از بوست/میان‌بر
function checkImpossibleJump(userId, matchId, distDelta, maxLegalDelta) {
  if (distDelta > maxLegalDelta * 1.35) {
    flag(userId, matchId, 'impossible_movement', { distDelta: Math.round(distDelta), max: Math.round(maxLegalDelta) });
    return false;
  }
  return true;
}

module.exports = { inputLimiter, msgLimiter, flag, validateInput, checkReaction, checkImpossibleJump };
