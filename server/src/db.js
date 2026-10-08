'use strict';
// ذخیره‌سازی فایل‌محور با اسکیمای ثابت — معادل ۱به۱ جداول دیتابیس (معماری §۳)
// نوشتن اتمیک + دیبانس؛ در حافظه نگه داشته می‌شود تا پاسخ‌ها سریع بماند.
const fs = require('fs');
const path = require('path');
const { env } = require('./config');

const COLLECTIONS = [
  'users', 'sessions', 'ledger', 'inventory', 'matches', 'matchPlayers',
  'matchResults', 'rooms', 'friends', 'purchases', 'adRewards', 'achievements',
  'dailyChallenges', 'gameConfigs', 'reports', 'analytics', 'counters',
];

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.data = {};
    for (const c of COLLECTIONS) this.data[c] = {};
    this.data.analytics.events = [];
    this.data.counters.events = {};
    this._load();
    this._saveTimer = null;
    this._dirty = false;
  }

  file(name) { return path.join(this.dir, `${name}.json`); }

  _load() {
    for (const c of COLLECTIONS) {
      try {
        if (fs.existsSync(this.file(c))) {
          const parsed = JSON.parse(fs.readFileSync(this.file(c), 'utf8'));
          this.data[c] = Array.isArray(this.data[c]) && c === 'analytics' ? parsed : parsed;
          if (c === 'analytics') this.data.analytics = parsed;
        }
      } catch (e) {
        console.error(`[db] خطا در خواندن ${c}: ${e.message} — از داده خالی شروع می‌شود`);
      }
    }
  }

  scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (!this._dirty) return;
      this._dirty = false;
      for (const c of COLLECTIONS) {
        const tmp = this.file(c) + '.tmp';
        try {
          fs.writeFileSync(tmp, JSON.stringify(this.data[c]));
          fs.renameSync(tmp, this.file(c));
        } catch (e) { console.error(`[db] خطا در ذخیره ${c}: ${e.message}`); }
      }
    }, 500);
  }

  get col() { return this.data; }
}

const store = new Store(env.DATA_DIR);
process.on('SIGINT', () => { try { store.scheduleSave(); } catch {} setTimeout(() => process.exit(0), 300); });

module.exports = { store };
