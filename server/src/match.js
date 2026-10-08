'use strict';
// ارکستریتور مچ — فازها: FOUND → (INTRO → PLAY → ROUND_RESULT) ×3 → FINAL → REMATCH_WINDOW
const { configs } = require('./config');
const { ids, randId } = require('./ids');
const { store } = require('./db');
const economy = require('./economy');
const { spawnBot } = require('./bots');
const { track } = require('./analytics');
const achievements = require('./achievements');

const GAMES = {
  ReactionGame: require('./games/reaction').makeLogic,
  SnakeArena: require('./games/snake').makeLogic,
  StreetRace: require('./games/race').makeLogic,
};

const M = configs.match;

class Match {
  constructor({ hub, players, mode = 'quick', roomId = null, options = {} }) {
    this.id = ids.match();
    this.hub = hub;
    this.mode = mode;
    this.roomId = roomId;
    this.options = options; // {daily:{dateKey,target}} برای چالش روز
    this.startedAt = Date.now();
    this.rounds = this.pickRounds();
    this.roundIndex = -1;
    this.phase = 'found';
    this.game = null;
    this.timers = [];
    this.over = false;
    this.rematchers = new Set();
    this.players = players.map((p) => ({
      id: p.id, username: p.username, avatar: p.avatar, isBot: !!p.isBot,
      botDifficulty: p.botDifficulty || null, params: p.params || null,
      trophies: p.trophies || 0, total: 0, perRound: [],
      disconnected: false, connected: !p.isBot,
    }));
    this.humans = () => this.players.filter((p) => !p.isBot);
  }

  pickRounds() {
    if (this.options.forceGame) return [this.options.forceGame];
    const pool = [...M.roundRotation];
    // چرخش بدون تکرار
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, M.rounds);
  }

  later(fn, ms) { const t = setTimeout(() => { if (!this.over) fn(); }, ms); this.timers.push(t); }

  broadcast(type, payload) {
    for (const p of this.humans()) this.hub.sendToUser(p.id, type, payload);
  }
  sendTo(pid, type, payload) { this.hub.sendToUser(pid, type, payload); }

  start() {
    this.broadcast('match.found', {
      matchId: this.id, mode: this.mode, rounds: this.rounds,
      players: this.players.map((p) => ({ id: p.id, username: p.username, avatar: p.avatar, isBot: p.isBot, trophies: p.trophies })),
    });
    track(null, 'match_found', { match_id: this.id, humans: this.humans().length, bots: this.players.length - this.humans().length, mode: this.mode });
    this.later(() => this.nextRound(), 3500);
  }

  nextRound() {
    this.roundIndex += 1;
    if (this.roundIndex >= this.rounds.length) return this.finalize();
    const gameId = this.rounds[this.roundIndex];
    this.phase = 'intro';
    const cfg = this.gameCfg(gameId);
    this.broadcast('round.start', { i: this.roundIndex, gameId, cfg, durationSec: cfg.durationSec || cfg.maxDurationSec });
    track(null, 'minigame_start', { match_id: this.id, game: gameId, round: this.roundIndex, player_count: this.players.length });
    this.later(() => this.startPlay(gameId), M.roundIntroSec * 1000);
  }

  gameCfg(gameId) {
    const base = configs.games[gameId];
    if (this.options.daily && gameId === 'ReactionGame') {
      return { ...base, durationSec: configs.daily.reaction.durationSec };
    }
    return base;
  }

  startPlay(gameId) {
    this.phase = 'play';
    const ctx = {
      cfg: this.gameCfg(gameId),
      matchId: this.id,
      players: this.players,
      broadcast: (t, p) => this.broadcast(t, p),
      endRound: (scores) => this.endRound(scores),
    };
    this.game = GAMES[gameId](ctx);
    this.game.start();
  }

  endRound(scores) {
    if (this.phase !== 'play') return;
    this.phase = 'roundResult';
    const gameId = this.rounds[this.roundIndex];
    const order = [...this.players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    for (const p of this.players) {
      const s = scores[p.id] || 0;
      p.perRound.push(s);
      p.total += s;
    }
    const standings = order.map((p, i) => ({ id: p.id, round: scores[p.id] || 0, total: p.total, rank: i }));
    const cut = M.elimination.cutAfterRound[this.roundIndex];
    track(null, 'minigame_finish', { match_id: this.id, game: gameId, round: this.roundIndex });
    this.broadcast('round.end', { i: this.roundIndex, gameId, standings, cut: typeof cut === 'number' ? cut : null });
    if (this.game) { this.game.destroy(); this.game = null; }
    this.later(() => this.nextRound(), M.roundResultSec * 1000);
  }

  finalize() {
    this.phase = 'final';
    const order = [...this.players].sort((a, b) => b.total - a.total);
    const standings = order.map((p, i) => ({ id: p.id, total: p.total, rank: i }));
    const resultsByUser = {};

    for (const p of this.humans()) {
      const rank = order.indexOf(p);
      const rewards = economy.matchRewards(rank, this.players.length, p.total);
      const user = store.col.users[p.id];
      if (!user) continue;
      const before = user.level;
      economy.grant(p.id, { xp: rewards.xp, coins: rewards.coins, trophies: rewards.trophies }, `match:${this.id}`);
      user.stats.matches += 1;
      if (rank === 0) user.stats.wins += 1; else user.stats.losses += 1;
      const bestKey = 'total';
      user.stats.bestScores[bestKey] = Math.max(user.stats.bestScores[bestKey] || 0, p.total);
      if (this.rounds.includes('SnakeArena') && rank === 0) user.stats.snakeWins = (user.stats.snakeWins || 0) + 1;
      store.scheduleSave();

      const adNonce = randId(10);
      this.hub.registerAdNonce(p.id, adNonce, this.id, rewards.coins);
      const matchCount = user.stats.matches;
      resultsByUser[p.id] = {
        rank, total: p.total, perRound: p.perRound,
        rewards: { xp: rewards.xp, coins: rewards.coins, trophies: rewards.trophies, levelUp: user.level > before, level: user.level },
        best: user.stats.bestScores[bestKey],
        adOffer: { nonce: adNonce, multiplier: configs.economy.ads.doubleCoinsMultiplier },
        interstitial: matchCount % configs.economy.ads.interstitialEveryNMatches === 0,
        rematchWindowSec: M.rematchWindowSec,
      };
      track(p.id, 'match_finish', { match_id: this.id, rank, score: p.total, duration_ms: Date.now() - this.startedAt });
      track(p.id, rank === 0 ? 'win' : 'loss', { match_id: this.id, rank, score: p.total });
      achievements.check(p.id);
    }

    this.persist(order);

    this.broadcast('match.end', { standings, results: resultsByUser });

    if (this.options.daily) this.hub.dailyFinished(this);

    this.later(() => this.closeRematchWindow(), M.rematchWindowSec * 1000);
  }

  persist(order) {
    const m = {
      id: this.id, mode: this.mode, roomId: this.roomId,
      startedAt: this.startedAt, finishedAt: Date.now(),
      rounds: this.rounds, playerCount: this.players.length,
      winnerId: order[0] ? order[0].id : null,
    };
    store.col.matches[this.id] = m;
    for (const p of this.players) {
      store.col.matchPlayers[ids.matchPlayer()] = {
        matchId: this.id, playerId: p.id, username: p.username, isBot: p.isBot,
        finalRank: order.indexOf(p), totalScore: p.total, perRound: p.perRound,
        disconnectedEver: p.disconnected,
      };
    }
    for (const p of this.humans()) {
      store.col.matchResults[ids.matchResult()] = {
        matchId: this.id, userId: p.id, rank: order.indexOf(p), totalScore: p.total, ts: Date.now(),
      };
    }
    store.col.gameConfigs[this.id] = { rounds: this.rounds, ts: Date.now() };
    store.scheduleSave();
  }

  onRematch(userId) {
    if (this.phase !== 'final' || this.over) return;
    if (this.rematchers.has(userId)) return;
    this.rematchers.add(userId);
    track(userId, 'rematch_click', { match_id: this.id, players_ready: this.rematchers.size });
    this.broadcast('rematch.update', { ready: [...this.rematchers], windowSec: M.rematchWindowSec });
    if (this.rematchers.size >= Math.max(2, Math.ceil(this.humans().length * 0.6))) {
      this.hub.startRematch(this);
    }
  }

  closeRematchWindow() {
    if (this.rematchers.size > 0) this.hub.startRematch(this);
    this.destroy();
  }

  destroy() {
    this.over = true;
    if (this.game) { try { this.game.destroy(); } catch {} this.game = null; }
    for (const t of this.timers) clearTimeout(t);
    for (const p of this.humans()) this.hub.clearMatch(p.id);
  }

  // ── ورودی و ارتباط ──────────────────────────────────────────────
  onInput(userId, msg) {
    if (this.phase !== 'play' || !this.game) return;
    const p = this.players.find((x) => x.id === userId);
    if (!p || p.isBot) return;
    this.game.onInput(userId, msg);
  }

  onEmote(userId, emote) {
    const p = this.players.find((x) => x.id === userId);
    if (!p) return;
    this.broadcast('emote', { from: userId, username: p.username, emote });
  }

  onUserDisconnect(userId) {
    const p = this.players.find((x) => x.id === userId);
    if (!p || p.isBot) return;
    p.connected = false;
    p.disconnected = true;
    track(userId, 'disconnect', { match_id: this.id });
    // ربات جایگزین می‌شود تا مچ بقیه خراب نشود
    if (this.phase === 'play' && this.game && this.game.takeover) {
      const normal = configs.bots.difficulties.normal;
      this.game.takeover(userId, normal);
    }
  }

  onUserReconnect(userId) {
    const p = this.players.find((x) => x.id === userId);
    if (!p) return;
    if (p.connected) return;
    p.connected = true;
    track(userId, 'reconnect', { match_id: this.id });
    if (this.game && this.game.release) this.game.release(userId);
    this.sendTo(userId, 'resume', this.resumePayload());
  }

  resumePayload() {
    return {
      matchId: this.id, phase: this.phase, roundIndex: this.roundIndex, rounds: this.rounds,
      players: this.players.map((p) => ({ id: p.id, username: p.username, avatar: p.avatar, isBot: p.isBot, total: p.total })),
      gameSnapshot: this.game ? this.game.snapshot() : null,
      gameId: this.rounds[this.roundIndex] || null,
    };
  }
}

module.exports = { Match };
