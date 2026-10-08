'use strict';
// لایه وب‌سوکت: نشست‌ها، صف، اتاق، ورودی گیم‌پلی، ایموت، ریمچ.
const { WebSocketServer } = require('ws');
const url = require('url');
const auth = require('./auth');
const { configs } = require('./config');
const { store } = require('./db');
const anticheat = require('./anticheat');
const { Match } = require('./match');
const { fillWithBots } = require('./bots');
const ads = require('./ads');
const daily = require('./dailyChallenge');
const { track } = require('./analytics');

class Hub {
  constructor() {
    this.sockets = new Map();  // userId -> ws
    this.matches = new Map();  // userId -> Match
    this.matchmaking = null;   // بعد از ساخت تزریق می‌شود
    this.rooms = null;
  }

  sendToUser(userId, type, payload) {
    const ws = this.sockets.get(userId);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...(payload || {}) }));
  }

  assignMatch(userId, match) {
    this.matches.set(userId, match);
    const ws = this.sockets.get(userId);
    if (ws) ws._matchId = match.id;
  }

  clearMatch(userId, match) {
    if (!match || this.matches.get(userId) === match) this.matches.delete(userId);
  }

  registerAdNonce(userId, nonce, matchId, coins) { ads.registerNonce(userId, nonce, matchId, coins); }

  startRematch(oldMatch) {
    const humans = [...oldMatch.rematchers]
      .map((id) => store.col.users[id])
      .filter(Boolean)
      .map((u) => ({ id: u.id, username: u.username, avatar: u.avatar, trophies: u.trophies, isBot: false }));
    if (!humans.length) return;
    const roster = fillWithBots(humans, configs.matchmaking.targetSize);
    const next = new Match({ hub: this, players: roster, mode: 'rematch' });
    for (const h of humans) this.assignMatch(h.id, next);
    next.start();
    oldMatch.destroy();
  }

  startDailyRun(user) {
    const active = this.matches.get(user.id);
    if (active && !active.over) return; // اگر در مچ است، اجرای چالش را شروع نکن
    const info = daily.todayInfo();
    const human = { id: user.id, username: user.username, avatar: user.avatar, trophies: user.trophies, isBot: false };
    const roster = fillWithBots([human], 4);
    const match = new Match({
      hub: this, players: roster, mode: 'solo',
      options: { forceGame: 'ReactionGame', daily: { dateKey: info.dateKey, target: info.target } },
    });
    this.assignMatch(user.id, match);
    match.start();
  }

  dailyFinished(match) { daily.finished(match); }
}

const EMOTE_SET = new Set([...configs.emotes.emotes, ...configs.emotes.phrases]);

function attach(server, hub) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const q = url.parse(req.url, true).query;
    const user = auth.userByToken(q.token);
    if (!user) { ws.close(4001, 'unauthorized'); return; }

    // یک کاربر = یک اتصال فعال؛ اتصال قبلی بسته می‌شود
    const prev = hub.sockets.get(user.id);
    if (prev && prev !== ws) { try { prev.close(4002, 'replaced'); } catch {} }
    hub.sockets.set(user.id, ws);
    ws._userId = user.id;

    ws.send(JSON.stringify({ type: 'welcome', serverTime: Date.now(), me: user.id }));

    // اگر وسط مچ بوده، وضعیت را برمی‌گرداند (اتصال مجدد)
    const match = hub.matches.get(user.id);
    if (match && !match.over) match.onUserReconnect(user.id);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      if (!anticheat.msgLimiter.allow(user.id + ':' + msg.type)) return; // نرخ‌سنجی (بند ۳۱)
      try {
        handle(hub, ws, user, msg);
      } catch (e) {
        // هیچ پیامی نباید کل سرور را بیندازد (بند ۱۵/پایداری)
        console.error('[ws] خطا در پردازش پیام:', e);
      }
    });

    ws.on('close', () => {
      if (hub.sockets.get(user.id) === ws) hub.sockets.delete(user.id);
      if (hub.matchmaking) hub.matchmaking.leave(user.id);
      const m = hub.matches.get(user.id);
      if (m && !m.over) m.onUserDisconnect(user.id);
    });
  });
}

function handle(hub, ws, user, msg) {
  const match = hub.matches.get(user.id);
  switch (msg.type) {
    case 'queue.join':
      if (match && !match.over && match.phase !== 'final') return;
      if (hub.rooms.findRoomOf(user.id)) return;
      hub.matchmaking.join(user);
      break;

    case 'queue.leave':
      hub.matchmaking.leave(user.id);
      break;

    case 'room.create': {
      // اگر مچ قبلی در فاز پایانی است، رفتن به اتاق = انصراف از ریمچ
      if (match && !match.over && match.phase !== 'final') return;
      hub.matchmaking.leave(user.id);
      hub.rooms.create(user, msg.fillBots !== false);
      break;
    }
    case 'room.join': {
      if (match && !match.over && match.phase !== 'final') return;
      hub.matchmaking.leave(user.id);
      const r = hub.rooms.join(user, msg.code);
      if (!r.ok) ws.send(JSON.stringify({ type: 'error', code: r.code, msg: r.code === 'room_not_found' ? 'اتاقی با این کد پیدا نشد.' : r.code === 'room_full' ? 'اتاق پر است.' : 'خطا' }));
      break;
    }
    case 'room.leave': hub.rooms.leave(user); break;
    case 'room.ready': hub.rooms.setReady(user, !!msg.ready); break;
    case 'room.start': {
      const r = hub.rooms.start(user);
      if (!r.ok) ws.send(JSON.stringify({ type: 'error', code: r.code, msg: r.code === 'not_host' ? 'فقط میزبان می‌تواند شروع کند.' : r.code === 'need_players' ? 'حداقل ۲ بازیکن لازم است.' : 'خطا' }));
      break;
    }

    case 'input': {
      if (!match || !anticheat.validateInput(msg.data)) return;
      match.onInput(user.id, msg.data);
      break;
    }

    case 'emote': {
      if (!match || match.over) return;
      if (!EMOTE_SET.has(String(msg.emote))) return;
      match.onEmote(user.id, String(msg.emote));
      break;
    }

    case 'rematch': {
      if (match && !match.over) match.onRematch(user.id);
      break;
    }

    case 'ping': ws.send(JSON.stringify({ type: 'pong', t: msg.t })); break;

    default: break; // پیام ناشناخته بی‌صدا نادیده گرفته می‌شود
  }
}

module.exports = { Hub, attach };
