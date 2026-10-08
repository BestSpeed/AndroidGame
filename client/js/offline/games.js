// موتور آفلاین — پورت دقیق منطق سرور (همان قوانین، همان کانفیگ‌ها) برای اجرای محلی در برابر ربات‌ها.
// منبع حقیقت قوانین: server/src/games/* — هر تغییر آنجا باید اینجا هم اعمال شود (نکتهٔ همگام‌سازی).
import { CONFIGS } from '../configs.generated.js';

// ── ربات‌ها (معادل server/src/bots.js) ──
let seq = 0;
export function spawnBot(difficulty) {
  const B = CONFIGS.bots;
  seq += 1;
  const diff = difficulty || B.fillMix[seq % B.fillMix.length];
  const name = B.names[Math.floor(Math.random() * B.names.length)];
  return {
    id: `bot_${seq}_${Math.floor(Math.random() * 1e6)}`,
    username: `${B.namePrefix} ${name}`,
    isBot: true,
    botDifficulty: diff,
    avatar: { emoji: B.avatars[Math.floor(Math.random() * B.avatars.length)], bg: 8 + Math.floor(Math.random() * 4), frame: null },
    params: B.difficulties[diff],
    trophies: 300 + Math.floor(Math.random() * 900),
  };
}
export function fillWithBots(players, targetSize) {
  const out = [...players];
  while (out.length < targetSize) out.push(spawnBot());
  return out;
}
function reactionFor(bot) {
  const [lo, hi] = bot.params.reactionMs;
  return lo + Math.random() * (hi - lo);
}
function shouldErr(bot) { return Math.random() < bot.params.errorRate; }

// ── اقتصاد (معادل فرمول‌های server/src/economy.js) ──
export function xpForLevel(level) {
  const E = CONFIGS.economy;
  return Math.round(E.xp.levelBase * Math.pow(Math.max(1, level), E.xp.levelExp));
}
export function levelFromXp(xp) {
  const E = CONFIGS.economy;
  let level = 1;
  while (level < E.xp.maxLevel && xp >= xpForLevel(level + 1)) level++;
  return level;
}
export function matchRewards(rank, playerCount) {
  const E = CONFIGS.economy;
  const r = Math.min(rank, E.coins.matchByRank.length - 1);
  const coins = E.coins.matchByRank[r] + (rank === 0 ? E.coins.winBonus : 0);
  const trophies = E.trophies.byRank[Math.min(rank, E.trophies.byRank.length - 1)];
  let xp = E.xp.sources.matchComplete;
  if (rank === 0) xp += E.xp.sources.win;
  else if (rank < Math.ceil(playerCount / 2)) xp += E.xp.sources.topHalf;
  return { coins, trophies, xp };
}

// ── دست‌به‌کار (معادل server/src/games/reaction.js) ──
const RULE_TYPES = ['direct', 'color_tap', 'color_hold', 'shape_tap'];
function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function makeReaction(ctx) {
  const cfg = ctx.cfg;
  const players = ctx.players.map((p) => ({
    id: p.id, isBot: !!p.isBot, bot: p, score: 0, combo: 0, lockedUntil: 0, lastAction: null,
  }));
  const byId = new Map(players.map((p) => [p.id, p]));
  const state = {
    seq: 0, rule: { t: 'direct' }, ruleChangeIn: rnd(...cfg.ruleChangeEvery),
    card: null, cardShownAt: 0, cardShowMs: cfg.cardShowMsStart,
    startedAt: 0, timers: [], over: false,
  };
  const schedule = (fn, ms) => { const t = setTimeout(() => { if (!state.over) fn(); }, ms); state.timers.push(t); };

  function newRule() {
    const t = pick(RULE_TYPES.filter((r) => r !== state.rule.t));
    state.rule = t === 'color_tap' || t === 'color_hold' ? { t, color: pick(cfg.colors) }
      : t === 'shape_tap' ? { t, shape: pick(cfg.shapes) } : { t };
    state.ruleChangeIn = rnd(...cfg.ruleChangeEvery);
    ctx.broadcast('rule.set', { rule: state.rule });
  }
  function expectedAction(card, rule) {
    switch (rule.t) {
      case 'direct': return card.direct === 'tap' ? 'tap' : 'hold';
      case 'color_tap': return card.color === rule.color ? 'tap' : 'hold';
      case 'color_hold': return card.color === rule.color ? 'hold' : 'tap';
      case 'shape_tap': return card.shape === rule.shape ? 'tap' : 'hold';
      default: return 'hold';
    }
  }
  function makeCard() {
    const color = pick(cfg.colors);
    const shape = pick(cfg.shapes);
    const direct = Math.random() < cfg.tapRatio ? 'tap' : 'hold';
    if (state.rule.t === 'color_tap' && Math.random() < 0.45) return { color: state.rule.color, shape, direct };
    if (state.rule.t === 'color_hold' && Math.random() < 0.35) return { color: state.rule.color, shape, direct };
    if (state.rule.t === 'shape_tap' && Math.random() < 0.45) return { color, shape: state.rule.shape, direct };
    return { color, shape, direct };
  }
  function showNextCard() {
    state.seq += 1;
    if (--state.ruleChangeIn <= 0) newRule();
    const card = makeCard();
    state.card = card;
    state.cardShownAt = Date.now();
    state.cardShowMs = Math.max(cfg.cardShowMsMin, state.cardShowMs - cfg.cardShowMsDecayPerCard);
    for (const p of players) { p.lastAction = null; }
    ctx.broadcast('card.show', { seq: state.seq, card, showMs: state.cardShowMs });
    for (const p of players) {
      if (!p.isBot) continue;
      const expected = expectedAction(card, state.rule);
      const wantsTap = expected === 'tap' ? !shouldErr(p.bot) : Math.random() < p.bot.params.errorRate;
      if (wantsTap) schedule(() => handleTap(p, Date.now()), reactionFor(p.bot));
    }
    schedule(expireCard, state.cardShowMs);
  }
  function expireCard() {
    const card = state.card;
    if (!card) return;
    const expected = expectedAction(card, state.rule);
    const results = [];
    for (const p of players) {
      if (p.lastAction === 'tap') continue;
      if (expected === 'hold') { p.score += cfg.score.correctHold; p.combo += 1; results.push({ id: p.id, ok: true, kind: 'hold', d: cfg.score.correctHold }); }
      else { p.score += cfg.score.missedTap; p.combo = 0; results.push({ id: p.id, ok: false, kind: 'miss', d: cfg.score.missedTap }); }
    }
    ctx.broadcast('card.result', { seq: state.seq, results });
    state.card = null;
    schedule(showNextCard, cfg.gapMsMin + Math.random() * (cfg.gapMsMax - cfg.gapMsMin));
  }
  function handleTap(p, at) {
    if (state.over || p.lockedUntil > at) return;
    const card = state.card;
    if (!card) {
      p.score += Math.round(cfg.score.wrongTap / 2); p.combo = 0;
      p.lockedUntil = at + cfg.score.lockoutMs;
      ctx.broadcast('card.result', { seq: state.seq, results: [{ id: p.id, ok: false, kind: 'spam', d: Math.round(cfg.score.wrongTap / 2) }] });
      return;
    }
    if (p.lastAction) return;
    p.lastAction = 'tap';
    const expected = expectedAction(card, state.rule);
    const reactionMs = at - state.cardShownAt;
    if (expected === 'tap') {
      const speedBonus = Math.round(cfg.score.speedBonusMax * Math.max(0, 1 - reactionMs / state.cardShowMs));
      let gain = cfg.score.correctTap + speedBonus;
      p.combo += 1;
      if (p.combo >= cfg.score.comboAfter) gain += Math.min(cfg.score.comboBonusMax, cfg.score.comboBonusPerStep * (p.combo - cfg.score.comboAfter + 1));
      p.score += gain;
      ctx.broadcast('card.result', { seq: state.seq, results: [{ id: p.id, ok: true, kind: 'tap', d: gain, ms: reactionMs }] });
    } else {
      p.score += cfg.score.wrongTap; p.combo = 0;
      p.lockedUntil = at + cfg.score.lockoutMs;
      ctx.broadcast('card.result', { seq: state.seq, results: [{ id: p.id, ok: false, kind: 'wrong', d: cfg.score.wrongTap }] });
    }
  }

  return {
    id: 'ReactionGame',
    start() {
      state.startedAt = Date.now();
      ctx.broadcast('rule.set', { rule: state.rule });
      schedule(showNextCard, cfg.firstCardDelayMs);
      schedule(() => ctx.endRound(this.scores()), cfg.durationSec * 1000);
    },
    onInput(pid, msg) {
      const p = byId.get(pid);
      if (!p || p.isBot) return;
      if (msg.t === 'tap') handleTap(p, Date.now());
    },
    scores() {
      const out = {};
      for (const p of players) out[p.id] = Math.max(0, Math.round(p.score));
      return out;
    },
    snapshot() {
      return { seq: state.seq, rule: state.rule, timeLeftMs: Math.max(0, cfg.durationSec * 1000 - (Date.now() - state.startedAt)), card: state.card, scores: this.scores() };
    },
    destroy() { state.over = true; for (const t of state.timers) clearTimeout(t); },
  };
}

// ── مار محله (معادل server/src/games/snake.js) ──
const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SPAWNS = [
  { x: 3, y: 4, d: 'down' }, { x: 20, y: 4, d: 'down' },
  { x: 3, y: 27, d: 'up' }, { x: 20, y: 27, d: 'up' },
  { x: 7, y: 15, d: 'right' }, { x: 16, y: 15, d: 'left' },
  { x: 11, y: 8, d: 'down' }, { x: 12, y: 23, d: 'up' },
];

export function makeSnake(ctx) {
  const cfg = ctx.cfg;
  const W = cfg.gridW, H = cfg.gridH;
  const safe = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  let elapsed = 0, nextShrinkAt = cfg.suddenDeathAtSec, sudden = false, over = false, timer = null, survivalAcc = 0;

  const snakes = ctx.players.map((p, i) => {
    const sp = SPAWNS[i % SPAWNS.length];
    const cells = [];
    for (let k = 0; k < 3; k++) cells.push({ x: sp.x - DIRS[sp.d].x * k, y: sp.y - DIRS[sp.d].y * k });
    return { id: p.id, isBot: !!p.isBot, bot: p, cells, dir: sp.d, queue: [], alive: true, growth: 0, acc: 0, foodEaten: 0, botDecideAt: 0 };
  });
  const byId = new Map(snakes.map((s) => [s.id, s]));

  const food = [];
  const key = (x, y) => x + ',' + y;
  function freeCell() {
    for (let tries = 0; tries < 60; tries++) {
      const c = { x: safe.x0 + Math.floor(Math.random() * (safe.x1 - safe.x0 + 1)), y: safe.y0 + Math.floor(Math.random() * (safe.y1 - safe.y0 + 1)) };
      if (!snakes.some((s) => s.cells.some((b) => b.x === c.x && b.y === c.y)) && !food.some((f) => f.x === c.x && f.y === c.y)) return c;
    }
    return null;
  }
  for (let i = 0; i < cfg.foodCount; i++) { const c = freeCell(); if (c) food.push(c); }

  function occupiedSet() {
    const set = new Set();
    for (const s of snakes) { if (!s.alive) continue; for (const c of s.cells) set.add(key(c.x, c.y)); }
    return set;
  }

  function tick() {
    const dt = cfg.tickMs / 1000;
    elapsed += dt;
    if (!sudden && elapsed >= cfg.suddenDeathAtSec) { sudden = true; ctx.broadcast('sudden', { at: elapsed }); }
    if (sudden && elapsed >= nextShrinkAt) {
      nextShrinkAt += cfg.suddenDeathShrinkEverySec;
      if (safe.x1 - safe.x0 > 6 && safe.y1 - safe.y0 > 8) { safe.x0++; safe.y0++; safe.x1--; safe.y1--; }
      ctx.broadcast('walls', { safe });
    }
    survivalAcc += dt;
    const grantSurvival = survivalAcc >= 1;
    if (grantSurvival) survivalAcc -= 1;

    for (const s of snakes) {
      if (!s.alive) continue;
      if (grantSurvival) s.score = (s.score || 0) + cfg.survivalScorePerSec;
      if (s.isBot) botDecide(s);
      s.acc += cfg.speedCellsPerSec * dt;
      while (s.acc >= 1) { s.acc -= 1; stepSnake(s); if (!s.alive) break; }
    }
    const heads = new Map();
    for (const s of snakes) if (s.alive) {
      const k = key(s.cells[0].x, s.cells[0].y);
      heads.set(k, (heads.get(k) || []).concat(s));
    }
    for (const list of heads.values()) if (list.length > 1) for (const s of list) kill(s);

    const alive = snakes.filter((s) => s.alive);
    if (alive.length <= 1 || elapsed >= cfg.maxDurationSec) {
      if (alive.length === 1) alive[0].score = (alive[0].score || 0) + 50;
      return finish();
    }
    ctx.broadcast('s.snapshot', buildSnapshot());
  }

  function stepSnake(s) {
    if (s.queue.length) {
      const next = s.queue.shift();
      if (next !== OPP[s.dir]) s.dir = next;
      else if (s.queue.length) { const alt = s.queue.shift(); if (alt !== OPP[s.dir]) s.dir = alt; }
    }
    const head = s.cells[0];
    const nx = head.x + DIRS[s.dir].x, ny = head.y + DIRS[s.dir].y;
    if (nx < safe.x0 || nx > safe.x1 || ny < safe.y0 || ny > safe.y1) return kill(s);
    if (occupiedSet().has(key(nx, ny))) return kill(s);
    s.cells.unshift({ x: nx, y: ny });
    const fi = food.findIndex((f) => f.x === nx && f.y === ny);
    if (fi >= 0) {
      food.splice(fi, 1);
      s.growth += 1; s.foodEaten += 1;
      s.score = (s.score || 0) + cfg.foodScore;
      const c = freeCell(); if (c) food.push(c);
      ctx.broadcast('s.eat', { id: s.id, x: nx, y: ny });
    }
    if (s.growth > 0) s.growth -= 1; else s.cells.pop();
  }

  function kill(s) {
    if (!s.alive) return;
    s.alive = false;
    ctx.broadcast('s.dead', { id: s.id, rank: snakes.filter((x) => !x.alive).length });
  }

  function botDecide(s) {
    if (elapsed < s.botDecideAt) return;
    s.botDecideAt = elapsed + 0.25;
    const p = s.bot.params;
    const options = Object.keys(DIRS).filter((d) => d !== OPP[s.dir]);
    const safeMoves = options.filter((d) => {
      const nx = s.cells[0].x + DIRS[d].x, ny = s.cells[0].y + DIRS[d].y;
      if (nx < safe.x0 || nx > safe.x1 || ny < safe.y0 || ny > safe.y1) return false;
      return !occupiedSet().has(key(nx, ny));
    });
    if (!safeMoves.length) return;
    if (Math.random() < p.snakeMistakeRate) { s.queue.push(safeMoves[Math.floor(Math.random() * safeMoves.length)]); return; }
    let best = safeMoves[0], bestScore = -Infinity;
    for (const d of safeMoves) {
      const nx = s.cells[0].x + DIRS[d].x, ny = s.cells[0].y + DIRS[d].y;
      let foodDist = 99;
      for (const f of food) foodDist = Math.min(foodDist, Math.abs(f.x - nx) + Math.abs(f.y - ny));
      const space = floodCount(nx, ny);
      const scoreVal = -foodDist * 2 + space * 1.2 - Math.abs(nx - W / 2) * 0.1 + Math.random() * (s.bot.botDifficulty === 'easy' ? 4 : 1);
      if (scoreVal > bestScore) { bestScore = scoreVal; best = d; }
    }
    s.queue = [best];
  }

  function floodCount(sx, sy) {
    const seen = new Set([key(sx, sy)]);
    const body = occupiedSet();
    const q = [{ x: sx, y: sy }];
    while (q.length && seen.size < 50) {
      const c = q.pop();
      for (const d of Object.values(DIRS)) {
        const nx = c.x + d.x, ny = c.y + d.y;
        if (nx < safe.x0 || nx > safe.x1 || ny < safe.y0 || ny > safe.y1) continue;
        const k = key(nx, ny);
        if (seen.has(k) || body.has(k)) continue;
        seen.add(k); q.push({ x: nx, y: ny });
      }
    }
    return seen.size;
  }

  function finish() {
    if (over) return;
    over = true;
    clearInterval(timer);
    ctx.endRound(scores());
  }
  function scores() {
    const out = {};
    for (const s of snakes) out[s.id] = Math.round(s.score || 0);
    return out;
  }
  function buildSnapshot() {
    return { t: Math.round(elapsed * 10) / 10, safe, food, snakes: snakes.map((s) => ({ id: s.id, a: s.alive, c: s.cells.map((c) => [c.x, c.y]), g: s.growth })) };
  }

  return {
    id: 'SnakeArena',
    start() {
      ctx.broadcast('s.init', { w: W, h: H, safe, cfg: { tickMs: cfg.tickMs, suddenDeathAtSec: cfg.suddenDeathAtSec } });
      timer = setInterval(tick, cfg.tickMs);
    },
    onInput(pid, msg) {
      const s = byId.get(pid);
      if (!s || !s.alive || s.isBot) return;
      if (msg.t !== 'dir' || !DIRS[msg.d]) return;
      if (s.queue.length < 3) s.queue.push(msg.d);
    },
    scores,
    snapshot: buildSnapshot,
    destroy() { over = true; if (timer) clearInterval(timer); },
  };
}

// ── مسابقه کوچه (معادل server/src/games/race.js) ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRace(ctx) {
  const cfg = ctx.cfg;
  const track = cfg.tracks[Math.floor(Math.random() * cfg.tracks.length)];
  const rnd = mulberry32(track.seed * 1000 + track.length);
  const obstacles = [], gates = [];
  const spacing = 110 / track.obstacleDensity;
  for (let d = 300; d < track.length - 200; d += spacing * (0.7 + rnd() * 0.6)) {
    obstacles.push({ x: rnd() * 1.5 - 0.75, d: Math.round(d), w: 0.16 + rnd() * 0.1 });
  }
  for (let d = track.shortcutEvery; d < track.length - 400; d += track.shortcutEvery) {
    gates.push({ x: rnd() * 1.2 - 0.6, d: Math.round(d + rnd() * 120), w: 0.14, used: new Set() });
  }

  let elapsed = 0, timer = null, over = false, startTime = 0;
  const cars = ctx.players.map((p, i) => ({
    id: p.id, isBot: !!p.isBot, bot: p,
    x: ((i % 4) - 1.5) * 0.38, dist: 0, boost: 100, boosting: false,
    targetX: ((i % 4) - 1.5) * 0.38, crashedUntil: 0, finished: false, finishTime: null, botDecideAt: 0,
  }));
  const byId = new Map(cars.map((c) => [c.id, c]));

  function tick() {
    const dt = cfg.tickMs / 1000;
    elapsed += dt;
    for (const c of cars) {
      if (c.finished) continue;
      if (c.isBot) botDrive(c);
      const centerOffset = (dist) => Math.sin(dist / 260) * 0.28 + Math.sin(dist / 90 + track.seed) * 0.1;
      const drift = (centerOffset(c.dist + 10) - centerOffset(c.dist)) * cfg.baseSpeed * 0.9;
      const dx = Math.max(-cfg.steerSpeed * dt, Math.min(cfg.steerSpeed * dt, c.targetX - c.x));
      c.x = Math.max(-1, Math.min(1, c.x + dx - drift * dt));
      if (c.boosting && c.boost > 0) c.boost = Math.max(0, c.boost - cfg.boostDrainPerSec * dt);
      else { c.boosting = false; c.boost = Math.min(100, c.boost + cfg.boostRegenPerSec * dt); }
      const crashed = elapsed < c.crashedUntil;
      const speed = cfg.baseSpeed * (c.boosting && c.boost > 0 ? cfg.boostMultiplier : 1) * (crashed ? cfg.crashSpeedFactor : 1);
      c.dist += speed * dt;
      if (!crashed) {
        for (const o of obstacles) {
          if (Math.abs(o.d - c.dist) < 14 && Math.abs(o.x - c.x) < o.w + 0.09) {
            c.crashedUntil = elapsed + cfg.crashSlowdownMs / 1000;
            ctx.broadcast('r.crash', { id: c.id, d: Math.round(c.dist) });
            break;
          }
        }
      }
      for (const g of gates) {
        if (!g.used.has(c.id) && Math.abs(g.d - c.dist) < 12 && Math.abs(g.x - c.x) < g.w + 0.08) {
          g.used.add(c.id);
          c.dist += cfg.shortcutBonus;
          ctx.broadcast('r.shortcut', { id: c.id });
        }
      }
      if (c.dist >= track.length) {
        c.finished = true;
        c.finishTime = Date.now() - startTime;
        ctx.broadcast('r.finished', { id: c.id, ms: c.finishTime });
      }
    }
    if (cars.every((c) => c.finished) || elapsed >= cfg.maxDurationSec) return finish();
    ctx.broadcast('s.snapshot', buildSnapshot());
  }

  function botDrive(c) {
    if (elapsed < c.botDecideAt) { if (c.boosting && c.boost < 15) c.boosting = false; return; }
    c.botDecideAt = elapsed + 0.12;
    const p = c.bot.params;
    const lookahead = cfg.baseSpeed * (c.boosting ? 1.1 : 0.75);
    const lanes = [-0.7, -0.35, 0, 0.35, 0.7];
    let best = c.x, bestScore = -Infinity;
    for (const lane of lanes) {
      let danger = 0;
      for (const o of obstacles) {
        if (o.d > c.dist && o.d < c.dist + lookahead && Math.abs(o.x - lane) < o.w + 0.12) danger += 1 - (o.d - c.dist) / lookahead;
      }
      let gateReward = 0;
      for (const g of gates) {
        if (!g.used.has(c.id) && g.d > c.dist && g.d < c.dist + lookahead && Math.abs(g.x - lane) < g.w + 0.1) gateReward = p.raceAccuracy * 1.6;
      }
      const score = -danger * 3 + gateReward - Math.abs(lane - c.x) * 0.5 + Math.random() * (1 - p.raceAccuracy);
      if (score > bestScore) { bestScore = score; best = lane; }
    }
    c.targetX = Math.random() < p.raceAccuracy ? best : c.targetX;
    const clearAhead = !obstacles.some((o) => o.d > c.dist && o.d < c.dist + lookahead * 0.8 && Math.abs(o.x - c.x) < 0.25);
    c.boosting = clearAhead && c.boost > 25 && Math.random() < p.boostIQ;
  }

  function finish() {
    if (over) return;
    over = true;
    clearInterval(timer);
    ctx.endRound(scores());
  }
  function scores() {
    const out = {};
    for (const c of cars) out[c.id] = c.finished ? Math.round(200000 - c.finishTime / 10) : Math.round(c.dist * 10);
    return out;
  }
  function buildSnapshot() {
    return {
      t: Math.round(elapsed * 10) / 10,
      cars: cars.map((c) => ({ id: c.id, x: Math.round(c.x * 100) / 100, d: Math.round(c.dist), bst: Math.round(c.boost), on: c.boosting, cr: elapsed < c.crashedUntil, fin: c.finished })),
    };
  }

  return {
    id: 'StreetRace',
    start() {
      startTime = Date.now();
      ctx.broadcast('r.init', { track: { id: track.id, name: track.name, length: track.length, seed: track.seed }, obstacles, gates: gates.map((g) => ({ x: g.x, d: g.d, w: g.w })) });
      timer = setInterval(tick, cfg.tickMs);
    },
    onInput(pid, msg) {
      const c = byId.get(pid);
      if (!c || c.finished || c.isBot) return;
      if (msg.t === 'steer') { c.targetX = Math.max(-1, Math.min(1, msg.x)); c.boosting = !!msg.boost; }
      else if (msg.t === 'release') c.boosting = false;
    },
    scores,
    snapshot: buildSnapshot,
    destroy() { over = true; if (timer) clearInterval(timer); },
  };
}
