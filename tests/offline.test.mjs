'use strict';
// تست سرتاسری موتور آفلاین — یک مچ کامل محلی (ربات‌ها) بدون سرور.
import { test } from 'node:test';
import assert from 'node:assert';

// شبیه‌سازی حداقلی مرورگر برای ماژول‌های کلاینت
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const { CONFIGS } = await import('../client/js/configs.generated.js');
// زمان‌های کوتاه برای تست (کانفیگ همان آبجکت مشترک است → تغییرات به موتور می‌رسد)
CONFIGS.games.ReactionGame.durationSec = 6;
CONFIGS.games.SnakeArena.maxDurationSec = 10;
CONFIGS.games.SnakeArena.suddenDeathAtSec = 6;
CONFIGS.games.StreetRace.maxDurationSec = 8;
CONFIGS.match.roundIntroSec = 1;
CONFIGS.match.roundResultSec = 1;
CONFIGS.match.rematchWindowSec = 3;

const { localSocket } = await import('../client/js/offline/socket.js');
const { getProfile } = await import('../client/js/offline/store.js');

test('مچ کامل آفلاین: صف → ۳ راند → پاداش محلی', { timeout: 120000 }, async () => {
  const seen = { found: null, roundEnds: [], end: null };
  localSocket.on('match.found', (m) => { seen.found = m; });
  localSocket.on('round.end', (m) => seen.roundEnds.push(m));
  localSocket.on('match.end', (m) => { seen.end = m; });
  localSocket.on('error', (m) => { throw new Error('خطای غیرمنتظره: ' + JSON.stringify(m)); });

  localSocket.connect();
  localSocket.send('queue.join');

  // ارسال ورودی متناسب با هر بازی تا پایان مچ
  const started = Date.now();
  const iv = setInterval(() => {
    localSocket.send('input', { data: { t: 'tap', ts: Date.now() } });
    localSocket.send('input', { data: { t: 'dir', d: ['up', 'right', 'down', 'left'][Math.floor(Date.now() / 800) % 4] } });
    localSocket.send('input', { data: { t: 'steer', x: Math.sin(Date.now() / 600) * 0.4, boost: false } });
  }, 300);

  while (!seen.end && Date.now() - started < 110000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  clearInterval(iv);

  assert.ok(seen.found, 'مچ تشکیل نشد');
  assert.strictEqual(seen.found.players.length, 8, 'مچ باید ۸ نفره باشد');
  assert.ok(seen.found.players.filter((p) => p.isBot).every((p) => p.username.includes('🤖')), 'ربات‌ها باید برچسب داشته باشند');
  assert.strictEqual(seen.roundEnds.length, 3, 'سه راند باید بازی شود');
  assert.ok(seen.end, 'مچ به پایان نرسید');

  const me = getProfile();
  const res = seen.end.results[me.id];
  assert.ok(res, 'نتیجه بازیکن ثبت نشده');
  assert.ok(res.rewards.coins > 0 && res.rewards.xp > 0, 'پاداش باید مثبت باشد');
  assert.ok(me.stats.matches >= 1, 'آمار مسابقه باید ثبت شود');
  assert.ok(me.coins >= res.rewards.coins, 'سکه‌ها باید اعطا شوند');
});

test('ریمچ آفلاین مچ جدید می‌سازد', { timeout: 60000 }, async () => {
  let found2 = null;
  localSocket.on('match.found', (m) => { found2 = m; });
  localSocket.send('rematch');
  const started = Date.now();
  while (!found2 && Date.now() - started < 15000) await new Promise((r) => setTimeout(r, 200));
  assert.ok(found2, 'ریمچ باید مچ جدید بسازد');
  // پاک‌سازی: نگذار مچ دوم در پس‌زمینه ادامه دهد
  localSocket.match?.destroy();
});
