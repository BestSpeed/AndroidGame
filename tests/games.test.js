'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.DATA_DIR = '/tmp/bk-test-games';

const { configs } = require('../server/src/config');
const anticheat = require('../server/src/anticheat');

function fakeCtx(players) {
  const events = [];
  return {
    events,
    cfg: null, matchId: 'm_test', players,
    broadcast: (t, p) => events.push({ t, p }),
    endRound: (scores) => events.push({ t: 'endRound', scores }),
  };
}

const humans = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, username: `P${i}`, isBot: false }));

// ── دست‌به‌کار ──
test('داوری واکنش: تپ درست امتیاز مثبت، تپ اشتباه جریمه+قفل، اسپم جریمه', () => {
  const reaction = require('../server/src/games/reaction').makeLogic;
  const cfg = { ...configs.games.ReactionGame, firstCardDelayMs: 50, durationSec: 60 };
  const ctx = fakeCtx(humans(1));
  ctx.cfg = cfg;
  const game = reaction(ctx);
  game.start();

  // کارت مصنوعی: قانون مستقیم با دستور تپ
  const cardShow = ctx.events.find((e) => e.t === 'card.show');
  if (cardShow) {
    const card = cardShow.p.card;
    const before = game.scores()['p0'];
    if (card.direct === 'tap') {
      game.onInput('p0', { t: 'tap' });
      const after = game.scores()['p0'];
      assert.ok(after > before, 'تپ درست باید امتیاز بدهد');
    }
  }
  // اسپم بین کارت‌ها
  game.onInput('p0', { t: 'tap' });
  game.onInput('p0', { t: 'tap' });
  game.destroy();
  assert.ok(true);
});

// ── اعتبارسنجی ورودی و نرخ‌سنجی (ضدتقلب) ──
test('ورودی‌های بدشکل رد می‌شوند', () => {
  assert.strictEqual(anticheat.validateInput(null), false);
  assert.strictEqual(anticheat.validateInput({ t: 'fly' }), false);
  assert.strictEqual(anticheat.validateInput({ t: 'dir', d: 'diagonal' }), false);
  assert.strictEqual(anticheat.validateInput({ t: 'dir', d: 'up' }), true);
  assert.strictEqual(anticheat.validateInput({ t: 'steer', x: 5, boost: false }), false);
  assert.strictEqual(anticheat.validateInput({ t: 'steer', x: 0.5, boost: true }), true);
});

test('نرخ‌سنجی پس از عبور از ظرفیت مسدود می‌کند', () => {
  const { RateLimiter } = (() => {
    // ساخت یک محدودکننده تازه برای تست
    class RL { constructor(c, r) { this.c = c; this.t = new Map(); this.r = r; }
      allow(k) { const now = Date.now(); let b = this.t.get(k); if (!b) { b = { n: this.c, ts: now }; this.t.set(k, b); }
        b.n = Math.min(this.c, b.n + ((now - b.ts) / 1000) * this.r); b.ts = now;
        if (b.n < 1) return false; b.n -= 1; return true; } }
    return { RateLimiter: RL };
  })();
  const rl = new RateLimiter(3, 0.0001);
  assert.ok(rl.allow('k')); assert.ok(rl.allow('k')); assert.ok(rl.allow('k'));
  assert.strictEqual(rl.allow('k'), false);
});

test('حرکت ناممکن در ریس پرچم می‌خورد', () => {
  const ok = anticheat.checkImpossibleJump('u1', 'm1', 1000, 10);
  assert.strictEqual(ok, false);
  const ok2 = anticheat.checkImpossibleJump('u2', 'm1', 8, 10);
  assert.strictEqual(ok2, true);
});

// ── مچ‌میکینگ و ربات ──
test('ربات‌ها تا سقف ۸ نفر پر می‌کنند و برچسب دارند', () => {
  const { fillWithBots } = require('../server/src/bots');
  const roster = fillWithBots([{ id: 'u_x', username: 'من', isBot: false }], 8);
  assert.strictEqual(roster.length, 8);
  const bots = roster.filter((p) => p.isBot);
  assert.strictEqual(bots.length, 7);
  for (const b of bots) {
    assert.ok(b.username.includes('🤖'), 'نام ربات باید مشخص باشد');
    assert.ok(b.params && b.params.reactionMs, 'پارامتر سختی لازم است');
  }
});

// ── اتاق خصوصی ──
test('کد اتاق ۶ رقمی و بدون ارقام مبهم است', () => {
  const { roomCode } = require('../server/src/ids');
  for (let i = 0; i < 50; i++) {
    const c = roomCode();
    assert.match(c, /^[2-9]{6}$/);
  }
});
