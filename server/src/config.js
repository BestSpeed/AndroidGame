'use strict';
// بارگذاری کانفیگ‌های Data-Driven + متغیرهای محیطی (بند ۳۶/۵۲)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONFIG_DIR = path.join(ROOT, 'configs');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf8'));
}

const env = {
  SERVER_ENV: process.env.SERVER_ENV || 'development', // development | staging | production
  PORT: parseInt(process.env.PORT || '8080', 10),
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'data'),
  API_BASE_URL: process.env.API_BASE_URL || '',
  ANALYTICS_KEY: process.env.ANALYTICS_KEY || '',
  IAP_ENV: process.env.IAP_ENV || 'mock',
};

const configs = {
  app: loadJson('app.json'),
  economy: loadJson('economy.json'),
  match: loadJson('match.json'),
  games: loadJson('games.json'),
  bots: loadJson('bots.json'),
  matchmaking: loadJson('matchmaking.json'),
  shop: loadJson('shop.json'),
  emotes: loadJson('emotes.json'),
  achievements: loadJson('achievements.json'),
  daily: loadJson('daily.json'),
};

// حالت تست سریع: زمان‌ها کوتاه می‌شوند تا تست‌های سرتاسری در چند ده ثانیه اجرا شوند
if (process.env.BK_TEST_FAST === '1') {
  configs.games.ReactionGame.durationSec = 8;
  configs.games.SnakeArena.maxDurationSec = 14;
  configs.games.SnakeArena.suddenDeathAtSec = 8;
  configs.games.StreetRace.maxDurationSec = 12;
  configs.games.StreetRace.tracks = configs.games.StreetRace.tracks.map((t) => ({ ...t, length: 900 }));
  configs.match.roundIntroSec = 1;
  configs.match.roundResultSec = 2;
  configs.match.rematchWindowSec = 5;
  configs.matchmaking.botFillAfterSec = 1;
  configs.matchmaking.queueTickMs = 300;
  configs.daily.reaction.durationSec = 8;
}

// کانفیگ عمومی که کلاینت اجازه دیدن دارد — بدون هیچ سکرتی (بند ۴۸)
function clientConfig() {
  return {
    app: configs.app,
    games: configs.games,
    emotes: configs.emotes,
    economy: {
      coins: configs.economy.coins,
      ads: configs.economy.ads,
    },
    match: {
      rounds: configs.match.rounds,
      target: configs.match.players.target,
      roundRotation: configs.match.roundRotation,
      elimination: configs.match.elimination,
      roundResultSec: configs.match.roundResultSec,
      rematchWindowSec: configs.match.rematchWindowSec,
    },
    daily: configs.daily,
    reconnect: configs.app.reconnect,
  };
}

module.exports = { env, configs, clientConfig, ROOT };
