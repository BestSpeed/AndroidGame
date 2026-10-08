// API محلی آفلاین — همان سطح دسترسی api آنلاین تا صفحات بدون تغییر بمانند.
// فروشگاه/چالش روز/لیدربرد محلی کار می‌کنند؛ اتاق، خرید واقعی و ریپورت صادقانه «نیازمند اتصال» گزارش می‌شوند.
import { CONFIGS } from '../configs.generated.js';
import { t, getLang } from '../i18n.js';
import { ApiError } from '../errors.js';
import { getProfile, saveProfile, grant, spend, getInventory, addToInventory, checkAchievements, getDaily, saveDaily, xpNext } from './store.js';
import { localSocket } from './socket.js';

function publicProfile() {
  const u = getProfile();
  return { ...u, xpNext: xpNext(u.level) };
}
function dailyStatus() {
  const d = getDaily();
  return {
    dateKey: d.dateKey, type: 'reaction', target: d.target, bestScore: d.bestScore,
    attemptsLeft: Math.max(0, d.maxAttempts - d.attempts), completed: d.bestScore >= d.target,
    rewarded: d.rewarded, rewardCoins: d.rewardCoins, rewardXp: d.rewardXp,
  };
}

export const offlineApi = {
  async guestLogin() {
    return { token: 'offline', profile: publicProfile() };
  },
  async me() {
    return { ok: true, profile: publicProfile(), daily: dailyStatus() };
  },
  async updateMe(body = {}) {
    const u = getProfile();
    if (typeof body.username === 'string' && body.username.trim().length >= 2) u.username = body.username.trim().slice(0, 24);
    if (body.avatar) {
      if (typeof body.avatar.emoji === 'string') u.avatar.emoji = body.avatar.emoji.slice(0, 8);
      if (Number.isInteger(body.avatar.bg)) u.avatar.bg = Math.max(0, Math.min(11, body.avatar.bg));
    }
    if (body.settings) Object.assign(u.settings, body.settings);
    if (body.tutorialComplete === true && !u.tutorialComplete) {
      u.tutorialComplete = true;
      grant({ coins: CONFIGS.app.tutorial.rewardCoins, xp: CONFIGS.app.tutorial.rewardXp });
    }
    saveProfile(u);
    return { ok: true, profile: publicProfile() };
  },
  async config() {
    // هم‌شکل با پاسخ /api/config/client سرور
    return {
      ok: true, env: 'offline',
      config: {
        app: CONFIGS.app,
        games: CONFIGS.games,
        emotes: CONFIGS.emotes,
        economy: { coins: CONFIGS.economy.coins, ads: CONFIGS.economy.ads },
        match: {
          rounds: CONFIGS.match.rounds, target: CONFIGS.match.players.target,
          roundRotation: CONFIGS.match.roundRotation, elimination: CONFIGS.match.elimination,
          roundResultSec: CONFIGS.match.roundResultSec, rematchWindowSec: CONFIGS.match.rematchWindowSec,
        },
        daily: CONFIGS.daily,
        reconnect: CONFIGS.app.reconnect,
      },
    };
  },
  async shop() {
    return { ok: true, items: CONFIGS.shop.items, owned: getInventory() };
  },
  async buy(itemId) {
    const item = CONFIGS.shop.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError('item_not_found', t('err.generic'));
    if (item.currency === 'iap') throw new ApiError('offline_iap', t('offline.needOnline'));
    if (getInventory().includes(itemId)) throw new ApiError('already_owned', t('shop.owned'));
    const cost = item.currency === 'gems' ? { gems: item.price } : { coins: item.price };
    const res = spend(cost);
    if (!res.ok) throw new ApiError(res.code, res.code === 'not_enough_gems' ? t('shop.notEnough') : t('shop.notEnough'));
    addToInventory(itemId);
    if (item.type === 'pack' && item.amount) {
      grant(item.asset === 'gems' ? { gems: item.amount } : { coins: item.amount });
    }
    return { ok: true, profile: publicProfile() };
  },
  async equip(itemId) {
    const item = CONFIGS.shop.items.find((i) => i.id === itemId);
    if (!item || !getInventory().includes(itemId)) throw new ApiError('not_owned', t('err.generic'));
    const u = getProfile();
    if (item.type === 'avatar') u.avatar.emoji = item.asset;
    else if (item.type === 'frame') u.avatar.frame = item.asset;
    saveProfile(u);
    return { ok: true };
  },
  async iapStart() { throw new ApiError('offline_iap', t('offline.needOnline')); },
  async iapMockComplete() { throw new ApiError('offline_iap', t('offline.needOnline')); },
  async adComplete(nonce) {
    const coins = localSocket.consumeAdNonce(nonce);
    if (coins == null) throw new ApiError('bad_nonce', t('err.generic'));
    const extra = coins * (CONFIGS.economy.ads.doubleCoinsMultiplier - 1);
    grant({ coins: extra });
    return { ok: true, extraCoins: extra, profile: publicProfile() };
  },
  async leaderboard(type) {
    // آفلاین: فقط جدول محلی خود بازیکن — صادقانه و بدون داده ساختگی
    const me = publicProfile();
    const row = { id: me.id, username: me.username, avatar: me.avatar, trophies: me.trophies, level: me.level, rank: 1, me: true };
    if (type === 'weekly') return { ok: true, type, list: [{ ...row, weekly: me.trophies }], me: { weekly: me.trophies } };
    return { ok: true, type, list: [row] };
  },
  async recent() { return { ok: true, players: [] }; },
  async follow() { return { ok: false, code: 'offline' }; },
  async block() { return { ok: false, code: 'offline' }; },
  async report() { return { ok: false, code: 'offline' }; },
  async daily() { return { ok: true, daily: dailyStatus() }; },
  async dailyStart() {
    const d = getDaily();
    if (d.attempts >= d.maxAttempts) throw new ApiError('no_attempts', t('daily.noAttempts'));
    d.attempts += 1;
    saveDaily(d);
    localSocket.startDailyRun();
    return { ok: true };
  },
  async events() { return { ok: true, accepted: 0 }; },
};
