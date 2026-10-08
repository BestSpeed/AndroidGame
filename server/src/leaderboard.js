'use strict';
// لیدربرد — بند ۲۱: سراسری / هفتگی / دوستان. معماری برای لیدربرد منطقه‌ای آماده است (فیلتر منطقه بعداً).
const { store } = require('./db');

function entry(user, extra = {}) {
  return {
    id: user.id, username: user.username, avatar: user.avatar,
    trophies: user.trophies, level: user.level, ...extra,
  };
}

function globalBoard(limit = 50) {
  return Object.values(store.col.users)
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, limit)
    .map((u, i) => ({ ...entry(u), rank: i + 1 }));
}

function weeklyBoard(userId, limit = 50) {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const gained = {};
  for (const row of Object.values(store.col.matchResults)) {
    if (row.ts < weekAgo) continue;
    // جام کسب‌شده این هفته از لجر محاسبه می‌شود
  }
  for (const row of Object.values(store.col.ledger)) {
    if (row.ts < weekAgo || !row.trophies || row.trophies <= 0) continue;
    gained[row.userId] = (gained[row.userId] || 0) + row.trophies;
  }
  const list = Object.entries(gained)
    .map(([uid, g]) => {
      const u = store.col.users[uid];
      return u ? { ...entry(u, { weekly: g }) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.weekly - a.weekly)
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  const me = userId && gained[userId] ? { weekly: gained[userId] } : null;
  return { list, me };
}

function friendsBoard(userId, limit = 50) {
  const rels = Object.values(store.col.friends)
    .filter((f) => f.fromId === userId && f.type === 'follow')
    .map((f) => f.toId);
  const group = new Set([userId, ...rels]);
  return [...group]
    .map((id) => store.col.users[id])
    .filter(Boolean)
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, limit)
    .map((u, i) => ({ ...entry(u), rank: i + 1, me: u.id === userId }));
}

module.exports = { globalBoard, weeklyBoard, friendsBoard };
