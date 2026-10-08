// ذخیره‌سازی محلی حالت آفلاین — پروفایل، موجودی‌ها، انبار، چالش روز (روی دستگاه)
import { CONFIGS } from '../configs.generated.js';
import { levelFromXp } from './games.js';

const KEY_PROFILE = 'bk_offline_profile';
const KEY_INV = 'bk_offline_inventory';
const KEY_DAILY = 'bk_offline_daily';

const ADJ = ['چابک', 'زرنگ', 'شجاع', 'خندان', 'تندرو', 'باهوش', 'جسور', 'سریع', 'برنده', 'پرقدرت'];
const NOUN = ['پلنگ', 'عقاب', 'گرگ', 'شیر', 'باز', 'یوز', 'روباه', 'خروس', 'مار', 'ققنوس'];

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

export function dayKey() { return new Date().toISOString().slice(0, 10); }

export function getProfile() {
  let p = load(KEY_PROFILE, null);
  if (!p) {
    p = {
      id: 'u_local',
      username: `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]} ${100 + Math.floor(Math.random() * 900)}`,
      avatar: { emoji: ['😎', '🦊', '🐯', '🐼', '🦁', '🐸'][Math.floor(Math.random() * 6)], bg: Math.floor(Math.random() * 8), frame: null },
      level: 1, xp: 0,
      coins: CONFIGS.economy.coins.starters,
      gems: CONFIGS.economy.gems.starters,
      trophies: 0,
      stats: { wins: 0, losses: 0, matches: 0, snakeWins: 0, bestScores: {} },
      equipped: {},
      tutorialComplete: false,
      settings: { lang: localStorage.getItem('bk_lang') || 'fa', music: 0.7, sfx: 0.8 },
      createdAt: Date.now(),
    };
    save(KEY_PROFILE, p);
  }
  return p;
}
export function saveProfile(p) { save(KEY_PROFILE, p); }

export function xpNext(level) {
  const E = CONFIGS.economy;
  return Math.round(E.xp.levelBase * Math.pow(Math.max(1, level + 1), E.xp.levelExp));
}

// اعطای محلی — تنها دروازه تغییر موجودی در حالت آفلاین
export function grant({ xp = 0, coins = 0, gems = 0, trophies = 0 } = {}) {
  const p = getProfile();
  const before = p.level;
  if (xp > 0) p.xp += xp; // XP هرگز کم نمی‌شود
  p.level = levelFromXp(p.xp);
  p.coins = Math.max(0, p.coins + coins);
  p.gems = Math.max(0, p.gems + gems);
  p.trophies = Math.max(CONFIGS.economy.trophies.min, p.trophies + trophies);
  saveProfile(p);
  return { levelUp: p.level > before, level: p.level };
}

export function spend({ coins = 0, gems = 0 } = {}) {
  const p = getProfile();
  if (coins > 0 && p.coins < coins) return { ok: false, code: 'not_enough_coins' };
  if (gems > 0 && p.gems < gems) return { ok: false, code: 'not_enough_gems' };
  p.coins -= coins; p.gems -= gems;
  saveProfile(p);
  return { ok: true };
}

export function getInventory() { return load(KEY_INV, []); }
export function addToInventory(itemId) { const inv = getInventory(); if (!inv.includes(itemId)) inv.push(itemId); save(KEY_INV, inv); }

// اچیومنت‌های محلی (مشخصات از کانفیگ مشترک)
export function checkAchievements() {
  const p = getProfile();
  const key = 'bk_offline_ach';
  const done = load(key, {});
  const unlocked = [];
  for (const ach of CONFIGS.achievements.list) {
    if (done[ach.id]) continue;
    if ((p.stats[ach.stat] || 0) >= ach.goal) {
      done[ach.id] = Date.now();
      grant({ xp: ach.xp, coins: ach.coins });
      unlocked.push(ach.id);
    }
  }
  if (unlocked.length) save(key, done);
  return unlocked;
}

export function getDaily() {
  const d = CONFIGS.daily;
  const dayNum = Math.floor(Date.now() / (24 * 3600 * 1000));
  const target = d.reaction.targets[dayNum % d.reaction.targets.length];
  const rec = load(KEY_DAILY, {});
  if (rec.dateKey !== dayKey()) { save(KEY_DAILY, { dateKey: dayKey(), bestScore: 0, attempts: 0, rewarded: false }); return getDaily(); }
  return { ...rec, target, maxAttempts: d.reaction.maxAttempts, rewardCoins: d.reaction.rewardCoins, rewardXp: d.reaction.rewardXp, durationSec: d.reaction.durationSec };
}
export function saveDaily(rec) { const { target, maxAttempts, rewardCoins, rewardXp, durationSec, ...rest } = rec; save(KEY_DAILY, rest); }
