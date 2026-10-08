// سوکت محلی آفلاین — همان پروتکل سوکت آنلاین را شبیه‌سازی می‌کند تا صفحات موجود بدون تغییر کار کنند.
// ارکستریتور مچ معادل ساده‌شدهٔ server/src/match.js است (بدون شبکه/ضدتقلب؛ بازیکن تنها + ربات‌ها).
import { CONFIGS } from '../configs.generated.js';
import { makeReaction, makeSnake, makeRace, spawnBot, fillWithBots, matchRewards } from './games.js';
import { getProfile, saveProfile, grant, checkAchievements, getDaily, saveDaily, dayKey } from './store.js';

const GAMES = { ReactionGame: makeReaction, SnakeArena: makeSnake, StreetRace: makeRace };
const M = CONFIGS.match;
const EMOTES = ['😂', '😎', '😱', '😭', '🔥', '👏', '🤔'];

class LocalSocket {
  constructor() {
    this.listeners = new Map();
    this.match = null;
    this.queueTimer = null;
    this.adNonces = new Map(); // nonce -> coins
  }

  // ── API هم‌شکل با سوکت واقعی ──
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  emit(type, payload) {
    for (const fn of this.listeners.get(type) || []) { try { fn({ type, ...(payload || {}) }); } catch (e) { console.error(e); } }
    for (const fn of this.listeners.get('*') || []) { try { fn(type, { type, ...(payload || {}) }); } catch (e) { console.error(e); } }
  }
  connect() { setTimeout(() => this.emit('open', {}), 30); }
  disconnect() {}

  send(type, payload = {}) {
    switch (type) {
      case 'queue.join': this.startQueue(); break;
      case 'queue.leave': if (this.queueTimer) { clearTimeout(this.queueTimer); this.queueTimer = null; } break;
      case 'input': if (this.match && payload.data) this.match.onInput(payload.data); break;
      case 'emote': this.onEmote(payload.emote); break;
      case 'rematch': if (this.match) this.match.onRematch(); break;
      case 'room.create': case 'room.join':
        this.emit('error', { code: 'offline', msg: 'room' });
        break;
      default: break;
    }
  }

  startQueue() {
    this.emit('queue.status', { pos: 1, est: 1 });
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null;
      const me = this.meEntry();
      this.startMatch(fillWithBots([me], CONFIGS.matchmaking.targetSize), 'quick');
    }, 900);
  }

  startDailyRun() {
    const me = this.meEntry();
    const daily = getDaily();
    this.startMatch(fillWithBots([me], 4), 'solo', { forceGame: 'ReactionGame', daily: { dateKey: dayKey(), target: daily.target } });
  }

  meEntry() {
    const p = getProfile();
    return { id: p.id, username: p.username, avatar: p.avatar, trophies: p.trophies, isBot: false };
  }

  startMatch(players, mode, options = {}) {
    if (this.match) this.match.destroy();
    this.match = new LocalMatch(this, players, mode, options);
    this.match.start();
  }

  onEmote(emote) {
    if (!this.match) return;
    const me = getProfile();
    this.emit('emote', { from: me.id, username: me.username, emote });
    // گاهی یک ربات پاسخ می‌دهد — برای حفظ حس رقابت
    if (Math.random() < 0.5) {
      const bots = this.match.players.filter((p) => p.isBot);
      if (bots.length) {
        const bot = bots[Math.floor(Math.random() * bots.length)];
        setTimeout(() => this.emit('emote', { from: bot.id, username: bot.username, emote: EMOTES[Math.floor(Math.random() * EMOTES.length)] }), 700 + Math.random() * 900);
      }
    }
  }

  registerAdNonce(nonce, coins) { this.adNonces.set(nonce, coins); }
  consumeAdNonce(nonce) {
    if (!this.adNonces.has(nonce)) return null;
    const coins = this.adNonces.get(nonce);
    this.adNonces.delete(nonce);
    return coins;
  }
}

class LocalMatch {
  constructor(hub, players, mode, options) {
    this.hub = hub;
    this.mode = mode;
    this.options = options;
    this.players = players;
    this.meId = getProfile().id;
    this.rounds = this.pickRounds();
    this.roundIndex = -1;
    this.phase = 'found';
    this.game = null;
    this.timers = [];
    this.over = false;
    this.rematched = false;
  }

  pickRounds() {
    if (this.options.forceGame) return [this.options.forceGame];
    const pool = [...M.roundRotation];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, M.rounds);
  }

  later(fn, ms) { const t = setTimeout(() => { if (!this.over) fn(); }, ms); this.timers.push(t); }
  broadcast(type, payload) { this.hub.emit(type, payload); }

  gameCfg(gameId) {
    const base = CONFIGS.games[gameId];
    if (this.options.daily && gameId === 'ReactionGame') return { ...base, durationSec: CONFIGS.daily.reaction.durationSec };
    return base;
  }

  start() {
    this.broadcast('match.found', {
      matchId: 'local_' + Date.now(), mode: this.mode, rounds: this.rounds,
      players: this.players.map((p) => ({ id: p.id, username: p.username, avatar: p.avatar, isBot: p.isBot, trophies: p.trophies || 0 })),
    });
    this.later(() => this.nextRound(), 3500);
  }

  nextRound() {
    this.roundIndex += 1;
    if (this.roundIndex >= this.rounds.length) return this.finalize();
    const gameId = this.rounds[this.roundIndex];
    this.phase = 'intro';
    const cfg = this.gameCfg(gameId);
    this.broadcast('round.start', { i: this.roundIndex, gameId, cfg, durationSec: cfg.durationSec || cfg.maxDurationSec });
    this.later(() => this.startPlay(gameId), M.roundIntroSec * 1000);
  }

  startPlay(gameId) {
    this.phase = 'play';
    const ctx = {
      cfg: this.gameCfg(gameId),
      matchId: 'local',
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
      p._round = scores[p.id] || 0;
      p._total = (p._total || 0) + p._round;
    }
    const standings = order.map((p, i) => ({ id: p.id, round: scores[p.id] || 0, total: p._total, rank: i }));
    const cut = M.elimination.cutAfterRound[this.roundIndex];
    this.broadcast('round.end', { i: this.roundIndex, gameId, standings, cut: typeof cut === 'number' ? cut : null });
    if (this.game) { this.game.destroy(); this.game = null; }
    this.later(() => this.nextRound(), M.roundResultSec * 1000);
  }

  finalize() {
    this.phase = 'final';
    const order = [...this.players].sort((a, b) => (b._total || 0) - (a._total || 0));
    const standings = order.map((p, i) => ({ id: p.id, total: p._total || 0, rank: i }));
    const rank = order.findIndex((p) => p.id === this.meId);
    const me = order[rank];
    const rewards = matchRewards(rank, this.players.length);

    const profile = getProfile();
    const before = profile.level;
    grant({ xp: rewards.xp, coins: rewards.coins, trophies: rewards.trophies });
    const p2 = getProfile();
    p2.stats.matches += 1;
    if (rank === 0) p2.stats.wins += 1; else p2.stats.losses += 1;
    p2.stats.bestScores.total = Math.max(p2.stats.bestScores.total || 0, me._total || 0);
    if (this.rounds.includes('SnakeArena') && rank === 0) p2.stats.snakeWins = (p2.stats.snakeWins || 0) + 1;
    saveProfile(p2);
    checkAchievements();

    const adNonce = 'local_' + Math.random().toString(36).slice(2, 12);
    this.hub.registerAdNonce(adNonce, rewards.coins);
    const results = {
      [this.meId]: {
        rank, total: me._total || 0, perRound: this.rounds.map(() => 0),
        rewards: { xp: rewards.xp, coins: rewards.coins, trophies: rewards.trophies, levelUp: p2.level > before, level: p2.level },
        best: p2.stats.bestScores.total,
        adOffer: { nonce: adNonce, multiplier: CONFIGS.economy.ads.doubleCoinsMultiplier },
        interstitial: p2.stats.matches % CONFIGS.economy.ads.interstitialEveryNMatches === 0,
        rematchWindowSec: M.rematchWindowSec,
      },
    };
    this.broadcast('match.end', { standings, results });

    if (this.options.daily) this.dailyFinished(me._total || 0);
    this.later(() => this.destroy(), M.rematchWindowSec * 1000);
  }

  dailyFinished(score) {
    const rec = getDaily();
    rec.bestScore = Math.max(rec.bestScore, score);
    if (!rec.rewarded && rec.bestScore >= rec.target) {
      grant({ coins: rec.rewardCoins, xp: rec.rewardXp });
      rec.rewarded = true;
    }
    saveDaily(rec);
  }

  onRematch() {
    if (this.phase !== 'final' || this.over || this.rematched) return;
    this.rematched = true;
    this.broadcast('rematch.update', { ready: [this.meId], windowSec: M.rematchWindowSec });
    const me = this.hub.meEntry();
    const fresh = this.players.filter((p) => p.isBot).map(() => spawnBot());
    const players = fillWithBots([me], CONFIGS.matchmaking.targetSize).length
      ? [me, ...fresh.slice(0, CONFIGS.matchmaking.targetSize - 1)]
      : [me];
    setTimeout(() => { if (!this.over) this.hub.startMatch(players, 'rematch'); }, 600);
  }

  onInput(data) {
    if (this.phase !== 'play' || !this.game) return;
    this.game.onInput(this.meId, data);
  }

  destroy() {
    this.over = true;
    if (this.game) { try { this.game.destroy(); } catch {} this.game = null; }
    for (const t of this.timers) clearTimeout(t);
    if (this.hub.match === this) this.hub.match = null;
  }
}

export const localSocket = new LocalSocket();
