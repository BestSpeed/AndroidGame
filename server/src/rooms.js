'use strict';
// اتاق خصوصی — بند ۱۶: ساخت/پیوستن با کد ۶ رقمی، آماده، شروع.
const { configs } = require('./config');
const { store } = require('./db');
const { roomCode } = require('./ids');
const { Match } = require('./match');
const { fillWithBots } = require('./bots');
const { track } = require('./analytics');

class Rooms {
  constructor(hub) {
    this.hub = hub;
    this.rooms = new Map(); // code -> room
  }

  create(user, fillWithBots = true) {
    // خروج از اتاق قبلی
    this.leave(user, true);
    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();
    const room = {
      code, hostId: user.id, fillWithBots: !!fillWithBots,
      players: [{ id: user.id, username: user.username, avatar: user.avatar, ready: false, trophies: user.trophies }],
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    store.col.rooms[code] = { code, hostId: user.id, createdAt: room.createdAt, playerCount: 1 };
    store.scheduleSave();
    track(user.id, 'room_create', { code });
    this.sendRoom(code);
    return room;
  }

  join(user, code) {
    const room = this.rooms.get(String(code || '').trim());
    if (!room) return { ok: false, code: 'room_not_found' };
    if (room.players.length >= configs.match.players.max) return { ok: false, code: 'room_full' };
    if (room.players.some((p) => p.id === user.id)) { this.sendRoom(code); return { ok: true, room }; }
    this.leave(user, true);
    room.players.push({ id: user.id, username: user.username, avatar: user.avatar, ready: false, trophies: user.trophies });
    track(user.id, 'room_join', { code, players: room.players.length });
    this.sendRoom(code);
    return { ok: true, room };
  }

  leave(user, silent = false) {
    for (const [code, room] of this.rooms) {
      const i = room.players.findIndex((p) => p.id === user.id);
      if (i < 0) continue;
      room.players.splice(i, 1);
      if (!room.players.length || Date.now() - room.createdAt > 30 * 60 * 1000) {
        this.rooms.delete(code);
        delete store.col.rooms[code];
        store.scheduleSave();
      } else {
        if (room.hostId === user.id) room.hostId = room.players[0].id;
        this.sendRoom(code);
      }
      if (!silent) this.hub.sendToUser(user.id, 'room.left', {});
      return;
    }
  }

  setReady(user, ready) {
    const room = this.findRoomOf(user.id);
    if (!room) return;
    const p = room.players.find((x) => x.id === user.id);
    if (p) p.ready = !!ready;
    this.sendRoom(room.code);
  }

  start(user) {
    const room = this.findRoomOf(user.id);
    if (!room) return { ok: false, code: 'room_not_found' };
    if (room.hostId !== user.id) return { ok: false, code: 'not_host' };
    if (room.players.length < configs.match.players.min) return { ok: false, code: 'need_players' };
    const humans = room.players.map((p) => ({ id: p.id, username: p.username, avatar: p.avatar, trophies: p.trophies, isBot: false }));
    const roster = room.fillWithBots ? fillWithBots(humans, configs.match.players.target) : humans;
    const match = new Match({ hub: this.hub, players: roster, mode: 'room', roomId: room.code });
    for (const h of humans) this.hub.assignMatch(h.id, match);
    this.rooms.delete(room.code);
    delete store.col.rooms[room.code];
    store.scheduleSave();
    match.start();
    return { ok: true };
  }

  findRoomOf(userId) {
    for (const room of this.rooms.values()) if (room.players.some((p) => p.id === userId)) return room;
    return null;
  }

  sendRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const p of room.players) {
      this.hub.sendToUser(p.id, 'room.state', {
        code: room.code, hostId: room.hostId, fillWithBots: room.fillWithBots,
        players: room.players, max: configs.match.players.max,
      });
    }
  }

  removeDisconnected(userId) { this.leave(userId, true); }
}

module.exports = { Rooms };
