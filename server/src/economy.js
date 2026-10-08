'use strict';
// اقتصاد: سکه/جم/جام/XP — بند ۱۱ تا ۱۵. همه اعداد از کانفیگ؛ هیچ هاردکدی نیست.
const { configs } = require('./config');
const { store } = require('./db');
const { ids } = require('./ids');

const E = configs.economy;

function xpForLevel(level) {
  return Math.round(E.xp.levelBase * Math.pow(Math.max(1, level), E.xp.levelExp));
}
function levelFromXp(xp) {
  let level = 1;
  while (level < E.xp.maxLevel && xp >= xpForLevel(level + 1)) level++;
  return level;
}

function getUser(userId) { return store.col.users[userId]; }

function ledger(userId, grant, reason) {
  store.col.ledger[ids.ledger()] = { userId, ...grant, reason, ts: Date.now() };
}

// اعطای اتمیک — تنها دروازه تغییر موجودی‌ها.
function grant(userId, { xp = 0, coins = 0, gems = 0, trophies = 0 }, reason) {
  const u = getUser(userId);
  if (!u) return null;
  if (xp > 0) u.xp += xp; // XP هرگز کم نمی‌شود (بند ۱۱)
  const before = u.level;
  u.level = levelFromXp(u.xp);
  u.coins = Math.max(0, u.coins + coins);
  u.gems = Math.max(0, u.gems + gems);
  u.trophies = Math.max(E.trophies.min, u.trophies + trophies);
  ledger(userId, { xp, coins, gems, trophies }, reason);
  store.scheduleSave();
  return { levelUp: u.level > before, level: u.level };
}

// خرج‌کردن — تراکنشی: یا کامل کسر می‌شود یا رد.
function spend(userId, cost, reason) {
  const u = getUser(userId);
  if (!u) return { ok: false, code: 'no_user' };
  if (cost.coins > 0 && u.coins < cost.coins) return { ok: false, code: 'not_enough_coins' };
  if (cost.gems > 0 && u.gems < cost.gems) return { ok: false, code: 'not_enough_gems' };
  u.coins -= cost.coins; u.gems -= cost.gems;
  ledger(userId, { coins: -cost.coins, gems: -cost.gems }, reason);
  store.scheduleSave();
  return { ok: true };
}

// پاداش پایان مچ — رتبه ۰-مبنا
function matchRewards(rank, playerCount, positionScore) {
  const coinsTable = E.coins.matchByRank;
  const trophyTable = E.trophies.byRank;
  const r = Math.min(rank, coinsTable.length - 1);
  const coins = coinsTable[r] + (rank === 0 ? E.coins.winBonus : 0);
  const trophies = trophyTable[Math.min(rank, trophyTable.length - 1)];
  let xp = E.xp.sources.matchComplete;
  if (rank === 0) xp += E.xp.sources.win;
  else if (rank < Math.ceil(playerCount / 2)) xp += E.xp.sources.topHalf;
  return { coins, trophies, xp, rank, positionScore };
}

module.exports = { grant, spend, matchRewards, xpForLevel, levelFromXp };
