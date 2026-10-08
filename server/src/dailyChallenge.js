'use strict';
// چالش روز — بند ۲۲: یک چالش واکنشی روزانه، اجرا کاملاً سمت سرور (بدون اعتماد به کلاینت).
const { configs } = require('./config');
const { store } = require('./db');
const { ids } = require('./ids');
const economy = require('./economy');
const { track } = require('./analytics');

function dayKey() { return new Date().toISOString().slice(0, 10); }

function todayInfo() {
  const d = configs.daily;
  const dayNum = Math.floor(Date.now() / (24 * 3600 * 1000));
  const target = d.reaction.targets[dayNum % d.reaction.targets.length];
  return { dateKey: dayKey(), type: 'reaction', target, ...d.reaction };
}

function getOrCreate(userId) {
  const key = `${dayKey()}:${userId}`;
  return store.col.dailyChallenges[key] || (store.col.dailyChallenges[key] = {
    id: ids.daily(), userId, dateKey: dayKey(), type: 'reaction',
    bestScore: 0, attempts: 0, rewarded: false, ts: Date.now(),
  });
}

function status(userId) {
  const info = todayInfo();
  const rec = getOrCreate(userId);
  store.scheduleSave();
  return {
    dateKey: info.dateKey, type: info.type, target: info.target,
    bestScore: rec.bestScore, attemptsLeft: Math.max(0, info.maxAttempts - rec.attempts),
    completed: rec.bestScore >= info.target, rewarded: rec.rewarded,
    rewardCoins: info.rewardCoins, rewardXp: info.rewardXp,
  };
}

// شروع اجرا: یک مچ تک‌نفره (با ربات) روی بازی واکنش — سرور همه چیز را می‌سنجد
function startRun(userId, hub) {
  const rec = getOrCreate(userId);
  const info = todayInfo();
  if (rec.attempts >= info.maxAttempts) return { ok: false, code: 'no_attempts' };
  rec.attempts += 1;
  store.scheduleSave();
  track(userId, 'daily_challenge_start', { type: info.type, target: info.target, attempt: rec.attempts });
  return { ok: true, runId: rec.id };
}

// پایان اجرا — از سوی ارکستریتور مچ فراخوانی می‌شود
function finished(match) {
  const human = match.humans()[0];
  if (!human) return;
  const userId = human.id;
  const rec = getOrCreate(userId);
  const info = todayInfo();
  const score = human.total;
  rec.bestScore = Math.max(rec.bestScore, score);
  rec.ts = Date.now();
  let rewardedNow = false;
  if (!rec.rewarded && rec.bestScore >= info.target) {
    economy.grant(userId, { coins: info.rewardCoins, xp: info.rewardXp }, `daily:${info.dateKey}`);
    rec.rewarded = true;
    rewardedNow = true;
  }
  store.scheduleSave();
  track(userId, 'daily_challenge_finish', { score, target: info.target, best: rec.bestScore, rewarded: rewardedNow });
}

module.exports = { status, startRun, finished, todayInfo };
