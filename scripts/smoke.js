'use strict';
// تست سرتاسری (بند ۴۳): لاگین → صف → مچ ۸ نفره → هر ۳ مینی‌گیم → پاداش → اتاق خصوصی
// سرور باید در حال اجرا باشد:  PORT=8200 DATA_DIR=/tmp/bk-smoke node server/src/index.js
const WebSocket = require('ws');

const BASE = process.env.SMOKE_BASE || 'http://localhost:8200';
const results = [];
let passed = 0, failed = 0;

function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail}`); }
}

async function api(method, path, token, body) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function connectWS(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + `/ws?token=${token}`);
    const handlers = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      for (const fn of handlers.get(msg.type) || []) fn(msg);
      for (const fn of handlers.get('*') || []) fn(msg);
    });
    ws.on('open', () => resolve({ ws, on: (t, fn) => { if (!handlers.has(t)) handlers.set(t, []); handlers.get(t).push(fn); }, send: (o) => ws.send(JSON.stringify(o)) }));
    ws.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playFullMatch(token) {
  const c = await connectWS(token);
  const seen = { found: false, rounds: 0, end: null, roundEnds: [] };

  c.on('match.found', (m) => { seen.found = true; seen.players = m.players; seen.roundsTotal = m.rounds.length; seen.rounds = m.rounds; });
  c.on('round.start', (m) => { seen.currentGame = m.gameId; seen.roundsStarted = (seen.roundsStarted || 0) + 1; });
  c.on('round.end', (m) => seen.roundEnds.push(m));
  c.on('match.end', (m) => { seen.end = m; });

  // ورود به صف
  c.send({ type: 'queue.join' });

  // منتظر تشکیل مچ (پرشدن با ربات حداکثر ~۶ ثانیه)
  for (let i = 0; i < 120 && !seen.found; i++) await sleep(200);
  check('مچ تشکیل شد', seen.found);
  if (!seen.found) { c.ws.close(); return null; }
  check('مچ ۸ بازیکن دارد', seen.players.length === 8, `got ${seen.players.length}`);
  check('ربات‌ها برچسب دارند', seen.players.filter((p) => p.isBot).every((p) => p.username.includes('🤖')));
  check('۳ راند تعریف شد', seen.roundsTotal === 3);

  // ارسال ورودی متناسب با هر مینی‌گیم تا پایان مچ
  const t0 = Date.now();
  while (!seen.end && Date.now() - t0 < 260000) {
    const g = seen.currentGame;
    if (g === 'ReactionGame') c.send({ type: 'input', data: { t: 'tap', ts: Date.now() } });
    else if (g === 'SnakeArena') c.send({ type: 'input', data: { t: 'dir', d: ['up', 'right', 'down', 'left'][Math.floor(Date.now() / 700) % 4] } });
    else if (g === 'StreetRace') c.send({ type: 'input', data: { t: 'steer', x: Math.sin(Date.now() / 500) * 0.5, boost: Math.random() > 0.5 } });
    c.send({ type: 'emote', emote: '😎' });
    await sleep(350);
  }
  check('مچ به پایان رسید (match.end)', !!seen.end);
  check('۳ راوند بازی شد', seen.roundEnds.length === 3, `got ${seen.roundEnds.length}`);
  if (seen.end) {
    const myId = seen.players.find((p) => !p.isBot).id;
    const res = seen.end.results[myId];
    check('نتیجه و پاداش من ثبت شد', !!res && res.rewards.coins > 0 && res.rewards.xp > 0);
    check('پیشنهاد تبلیغ با توکن یک‌بارمصرف دارد', !!(res && res.adOffer && res.adOffer.nonce));
  }
  c.ws.close();
  return seen;
}

async function main() {
  console.log('🚬 تست سرتاسری بازی‌خونه —', BASE);

  // ۱) لاگین مهمان
  const g1 = await api('POST', '/auth/guest');
  check('لاگین مهمان کاربر اول', g1.ok && g1.token);
  const g2 = await api('POST', '/auth/guest');
  check('لاگین مهمان کاربر دوم', g2.ok && g2.token);
  const me1 = await api('GET', '/me', g1.token);
  check('پروفایل با سکه اولیه', me1.ok && me1.profile.coins >= 300);

  // ۲) اجرای یک مچ کامل
  console.log('\n— مچ کامل (صف سریع + ربات‌ها) —');
  const seen = await playFullMatch(g1.token);

  // ۳) بررسی اعطای پاداش در پروفایل
  if (seen && seen.end) {
    const me1b = await api('GET', '/me', g1.token);
    check('سکه‌ها بعد از مچ زیاد شدند', me1b.profile.coins > me1.profile.coins || me1b.profile.xp > 0);
    check('آمار مسابقه ثبت شد', me1b.profile.stats.matches === 1);
  }

  // ۴) اتاق خصوصی: ساخت با کاربر اول، پیوستن با کاربر دوم
  console.log('\n— اتاق خصوصی —');
  const c1 = await connectWS(g1.token);
  let roomState = null;
  c1.on('room.state', (m) => { roomState = m; });
  c1.send({ type: 'room.create', fillBots: true });
  await sleep(400);
  check('اتاق ساخته شد و کد ۶ رقمی دارد', !!roomState && /^[2-9]{6}$/.test(roomState.code));

  const c2 = await connectWS(g2.token);
  let roomState2 = null, found2 = false;
  c2.on('room.state', (m) => { roomState2 = m; });
  c2.on('match.found', () => { found2 = true; });
  c2.send({ type: 'room.join', code: roomState.code });
  await sleep(400);
  check('کاربر دوم به اتاق پیوست', !!roomState2 && roomState2.players.length === 2);

  c2.send({ type: 'room.ready', ready: true });
  await sleep(300);
  c1.send({ type: 'room.start' });
  for (let i = 0; i < 30 && !found2; i++) await sleep(200);
  check('مچ اتاق برای هر دو شروع شد', found2);
  c1.ws.close(); c2.ws.close();

  // ۵) فروشگاه و چالش روز و لیدربرد
  console.log('\n— خدمات —');
  const shop = await api('GET', '/shop', g1.token);
  check('فروشگاه آیتم دارد', shop.ok && shop.items.length >= 5);
  const buy = await api('POST', '/shop/buy', g1.token, { itemId: shop.items.find((i) => i.currency === 'coins').id });
  check('خرید با سکه کار می‌کند', buy.ok === true);
  const daily = await api('GET', '/daily', g1.token);
  check('چالش روز هدف و تلاش دارد', daily.ok && daily.daily.target > 0);
  const lb = await api('GET', '/leaderboard?type=global', g1.token);
  check('لیدربرد پاسخ می‌دهد', lb.ok);

  console.log(`\n${'='.repeat(40)}\nنتیجه: ${passed} قبول / ${failed} رد`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('خطای اسموک:', e); process.exit(1); });
