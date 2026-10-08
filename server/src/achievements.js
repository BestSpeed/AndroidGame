'use strict';
// اچیومنت‌های پایه — منبع XP/سکه طبق بند ۱۱. تعاریف در کانفیگ.
const { configs } = require('./config');
const { store } = require('./db');
const economy = require('./economy');

function check(userId) {
  const user = store.col.users[userId];
  if (!user) return [];
  const prog = store.col.achievements[userId] || (store.col.achievements[userId] = {});
  const unlocked = [];
  for (const ach of configs.achievements.list) {
    if (prog[ach.id]) continue;
    const value = user.stats[ach.stat] || 0;
    if (value >= ach.goal) {
      prog[ach.id] = { unlockedAt: Date.now(), value };
      economy.grant(userId, { xp: ach.xp, coins: ach.coins }, `achievement:${ach.id}`);
      unlocked.push(ach.id);
    }
  }
  if (unlocked.length) store.scheduleSave();
  return unlocked;
}

module.exports = { check };
