'use strict';
// یکتاسازهای سراسری با پیشوند نوع — بند ۲۹: همه شناسه‌ها یکتا باشند.
const crypto = require('crypto');
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // بدون کاراکترهای مبهم

function randId(len = 16) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const newId = (prefix) => `${prefix}_${randId(12)}`;

const ids = {
  user: () => newId('u'),
  session: () => newId('s'),
  match: () => newId('m'),
  matchPlayer: () => newId('mp'),
  matchResult: () => newId('mr'),
  room: () => newId('r'),
  purchase: () => newId('p'),
  adReward: () => newId('ad'),
  daily: () => newId('d'),
  ledger: () => newId('l'),
  inventory: () => newId('inv'),
  event: () => newId('e'),
  report: () => newId('rp'),
};

// کد اتاق ۶ رقمی (بدون ارقام مبهم 0/1 → خوانایی بهتر هنگام گفتار)
function roomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += String(2 + Math.floor(Math.random() * 8));
  return s;
}

// دسترسی از هر دو شکل پشتیبانی می‌کند
ids.randId = randId;
ids.roomCode = roomCode;

module.exports = { ids, randId, roomCode };
