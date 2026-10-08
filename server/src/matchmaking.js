'use strict';
// مچ‌میکینگ — بند ۱۷: مهارت تقریبی + زمان انتظار + پرشدن با ربات.
const { configs } = require('./config');
const { store } = require('./db');
const { fillWithBots } = require('./bots');
const { Match } = require('./match');
const { track } = require('./analytics');

const MM = configs.matchmaking;

class Matchmaking {
  constructor(hub) {
    this.hub = hub;
    this.queue = []; // {userId, skill, joinedAt}
    this.timer = setInterval(() => this.tick(), MM.queueTickMs);
  }

  join(user) {
    if (this.queue.some((q) => q.userId === user.id)) return false;
    this.queue.push({ userId: user.id, skill: user.trophies || 0, joinedAt: Date.now() });
    track(user.id, 'matchmaking_start', { mode: 'quick' });
    this.hub.sendToUser(user.id, 'queue.status', { pos: this.queue.length, est: MM.botFillAfterSec });
    return true;
  }

  leave(userId) {
    const i = this.queue.findIndex((q) => q.userId === userId);
    if (i >= 0) this.queue.splice(i, 1);
  }

  tick() {
    if (!this.queue.length) return;
    const now = Date.now();
    // مرتب‌سازی بر اساس مهارت برای گروه‌بندی بهتر
    this.queue.sort((a, b) => a.skill - b.skill);

    const formed = [];
    let rest = [];
    let i = 0;
    while (i < this.queue.length) {
      const group = [this.queue[i]];
      let j = i + 1;
      while (j < this.queue.length && group.length < MM.targetSize) {
        const range = MM.skillBaseRange + ((now - this.queue[i].joinedAt) / 1000) * MM.skillExpandPerSec;
        if (Math.abs(this.queue[j].skill - group[0].skill) <= range) group.push(this.queue[j]);
        j++;
      }
      const oldestWait = Math.max(...group.map((g) => now - g.joinedAt)) / 1000;
      // حتی یک بازیکن تنها هم پس از مهلت مقرر با ربات‌ها مچ می‌شود (بند ۱۷)
      if (group.length >= 1 && oldestWait >= MM.botFillAfterSec) formed.push(group);
      else rest = rest.concat(group);
      i = j;
    }
    this.queue = rest;

    for (const group of formed) {
      const humans = group.map((g) => store.col.users[g.userId]).filter(Boolean)
        .map((u) => ({ id: u.id, username: u.username, avatar: u.avatar, trophies: u.trophies, isBot: false }));
      if (!humans.length) continue;
      const roster = fillWithBots(humans, MM.targetSize);
      const match = new Match({ hub: this.hub, players: roster, mode: 'quick' });
      for (const h of humans) this.hub.assignMatch(h.id, match);
      match.start();
    }

    // اطلاع‌رسانی وضعیت صف
    this.queue.forEach((q, idx) => {
      this.hub.sendToUser(q.userId, 'queue.status', { pos: idx + 1, est: Math.max(0, Math.round(MM.botFillAfterSec - (Date.now() - q.joinedAt) / 1000)) });
    });
  }
}

module.exports = { Matchmaking };
