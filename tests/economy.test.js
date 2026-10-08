'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.DATA_DIR = '/tmp/bk-test-econ';

const economy = require('../server/src/economy');
const { store } = require('../server/src/db');
const { ids } = require('../server/src/ids');

function mkUser() {
  const id = ids.user();
  store.col.users[id] = { id, xp: 0, level: 1, coins: 100, gems: 5, trophies: 0, stats: { bestScores: {} } };
  return id;
}

test('xpForLevel یکنواخت صعودی است', () => {
  let prev = -1;
  for (let l = 1; l <= 50; l++) {
    const v = economy.xpForLevel(l);
    assert.ok(v > prev, `level ${l} xp باید صعودی باشد`);
    prev = v;
  }
});

test('levelFromXp معکوس درست دارد', () => {
  assert.strictEqual(economy.levelFromXp(0), 1);
  const need = economy.xpForLevel(3);
  assert.strictEqual(economy.levelFromXp(need), 3);
  assert.strictEqual(economy.levelFromXp(need - 1), 2);
});

test('XP هرگز کاهش نمی‌یابد و لجر ثبت می‌شود', () => {
  const id = mkUser();
  economy.grant(id, { xp: 150 }, 'test');
  economy.grant(id, { xp: -999 }, 'test-neg'); // نباید کم کند
  assert.strictEqual(store.col.users[id].xp, 150);
  assert.ok(Object.values(store.col.ledger).some((l) => l.userId === id && l.reason === 'test'));
});

test('خرج‌کردن بدون موجودی رد می‌شود', () => {
  const id = mkUser();
  const r = economy.spend(id, { coins: 9999, gems: 0 }, 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'not_enough_coins');
  assert.strictEqual(store.col.users[id].coins, 100); // تغییری نکرده
});

test('جام زیر صفر نمی‌رود', () => {
  const id = mkUser();
  economy.grant(id, { trophies: -50 }, 'test');
  assert.strictEqual(store.col.users[id].trophies, 0);
});

test('پاداش مچ: رتبه اول بیشترین سکه + پاداش برد دارد', () => {
  const first = economy.matchRewards(0, 8, 1000);
  const last = economy.matchRewards(7, 8, 10);
  assert.ok(first.coins > last.coins);
  assert.ok(first.trophies > 0 && last.trophies < 0);
  assert.ok(first.xp > economy.matchRewards(4, 8, 50).xp);
});
