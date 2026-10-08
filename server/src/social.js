'use strict';
// اجتماعی — بند ۱۹: معماری دوستان، بازیکنان اخیر، بلاک و ریپورت (بدون چت آزاد/صوت).
const { store } = require('./db');
const { ids } = require('./ids');

function recentPlayers(userId, limit = 12) {
  const seen = new Map();
  const rows = Object.values(store.col.matchPlayers)
    .filter((r) => !r.isBot)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  // برای هر مچِ کاربر، هم‌بازی‌ها را جمع کن
  const myMatches = new Set(rows.filter((r) => r.playerId === userId).map((r) => r.matchId));
  for (const r of rows) {
    if (!myMatches.has(r.matchId) || r.playerId === userId) continue;
    if (seen.has(r.playerId)) continue;
    const u = store.col.users[r.playerId];
    if (!u) continue;
    const rel = Object.values(store.col.friends).find((f) => f.fromId === userId && f.toId === r.playerId);
    seen.set(r.playerId, {
      id: u.id, username: u.username, avatar: u.avatar, trophies: u.trophies, level: u.level,
      following: rel ? rel.type === 'follow' : false,
      blocked: (store.col.users[userId]?.blocked || []).includes(u.id),
    });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

function setFollow(userId, targetId, follow) {
  if (userId === targetId || !store.col.users[targetId]) return { ok: false, code: 'bad_target' };
  const blocked = store.col.users[targetId]?.blocked || [];
  if (blocked.includes(userId)) return { ok: false, code: 'blocked' };
  const existing = Object.entries(store.col.friends).find(([, f]) => f.fromId === userId && f.toId === targetId);
  if (follow) {
    if (!existing) store.col.friends[ids.randId(10)] = { fromId: userId, toId: targetId, type: 'follow', ts: Date.now() };
    else existing[1].type = 'follow';
  } else if (existing) {
    delete store.col.friends[existing[0]];
  }
  store.scheduleSave();
  return { ok: true };
}

function setBlock(userId, targetId, block) {
  const u = store.col.users[userId];
  if (!u) return { ok: false, code: 'no_user' };
  if (block && !u.blocked.includes(targetId)) u.blocked.push(targetId);
  if (!block) u.blocked = u.blocked.filter((id) => id !== targetId);
  store.scheduleSave();
  return { ok: true };
}

function report(userId, targetId, reason) {
  store.col.reports[ids.report()] = { from: userId, target: targetId, reason: String(reason || '').slice(0, 200), ts: Date.now() };
  store.scheduleSave();
  return { ok: true };
}

module.exports = { recentPlayers, setFollow, setBlock, report };
