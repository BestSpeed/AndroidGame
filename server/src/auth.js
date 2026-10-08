'use strict';
// ورود مهمان + نشست‌ها — بدون نیاز به سرویس خارجی در MVP
const { store } = require('./db');
const { ids } = require('./ids');
const { configs } = require('./config');
const { track } = require('./analytics');

const ADJ = ['چابک', 'زرنگ', 'شجاع', 'خندان', 'تندرو', 'باهوش', 'جسور', 'سریع', 'برنده', 'پرقدرت'];
const NOUN = ['پلنگ', 'عقاب', 'گرگ', 'شیر', 'باز', 'یوز', 'روباه', 'خروس', 'مار', 'ققنوس'];

function randomUsername() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a} ${n} ${100 + Math.floor(Math.random() * 900)}`;
}

function sanitizeUsername(name) {
  return String(name || '').trim().slice(0, 24).replace(/[<>"'`]/g, '');
}

function createSession(userId) {
  const token = ids.session();
  store.col.sessions[token] = { token, userId, createdAt: Date.now() };
  store.scheduleSave();
  return token;
}

// ورود مهمان → ساخت کاربر جدید (بند: لاگین مهمان)
function guestLogin() {
  const user = {
    id: ids.user(),
    username: randomUsername(),
    avatar: { emoji: ['😎', '🦊', '🐯', '🐼', '🦁', '🐸', '🚲', '🛼'][Math.floor(Math.random() * 8)], bg: Math.floor(Math.random() * 8), frame: null },
    level: 1, xp: 0,
    coins: configs.economy.coins.starters,
    gems: configs.economy.gems.starters,
    trophies: 0,
    stats: { wins: 0, losses: 0, matches: 0, snakeWins: 0, bestScores: {} },
    equipped: { emotes: configs.emotes.emotes.slice(0, 8) },
    tutorialComplete: false,
    settings: { lang: configs.app.defaultLang, music: 0.7, sfx: 0.8 },
    blocked: [],
    createdAt: Date.now(), lastSeen: Date.now(),
  };
  store.col.users[user.id] = user;
  const token = createSession(user.id);
  track(user.id, 'login', { method: 'guest', new_user: true });
  return { token, user };
}

function userByToken(token) {
  if (!token || typeof token !== 'string') return null;
  const s = store.col.sessions[token];
  if (!s) return null;
  const u = store.col.users[s.userId];
  if (u) u.lastSeen = Date.now();
  return u || null;
}

module.exports = { guestLogin, userByToken, createSession, sanitizeUsername };
