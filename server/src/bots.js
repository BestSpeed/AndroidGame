'use strict';
// هویت و پارامتر ربات‌ها — بند ۱۷/۱۸. ربات هرگز به‌جای بازیکن واقعی جا زده نمی‌شود.
const { configs } = require('./config');

const B = configs.bots;
let seq = 0;

function spawnBot(difficulty) {
  seq += 1;
  const diff = difficulty || B.fillMix[seq % B.fillMix.length];
  const name = B.names[Math.floor(Math.random() * B.names.length)];
  const params = B.difficulties[diff];
  return {
    id: `bot_${seq}_${Math.floor(Math.random() * 1e6)}`,
    username: `${B.namePrefix} ${name}`,
    isBot: true,
    botDifficulty: diff,
    avatar: { emoji: B.avatars[Math.floor(Math.random() * B.avatars.length)], bg: 8 + Math.floor(Math.random() * 4), frame: null },
    params,
    trophies: 300 + Math.floor(Math.random() * 900),
  };
}

function fillWithBots(players, targetSize) {
  const out = [...players];
  while (out.length < targetSize) out.push(spawnBot());
  return out;
}

// پارامتر واکنش برای یک گام خاص
function reactionFor(bot) {
  const [lo, hi] = bot.params.reactionMs;
  return lo + Math.random() * (hi - lo);
}
function shouldErr(bot) { return Math.random() < bot.params.errorRate; }

module.exports = { spawnBot, fillWithBots, reactionFor, shouldErr };
