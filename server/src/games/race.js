'use strict';
// مسابقه کوچه (StreetRace) — ریس آرکید از بالا، فیزیک ساده و سرور-معتبر.
// پیست‌ها از کانفیگ با بذر ثابت تولید می‌شوند تا برای همه بازیکنان یک مچ یکسان باشند.
const anticheat = require('../anticheat');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// انحنای جاده: آفست مرکز مسیر نسبت به فاصله — فرمول مشترک سرور/کلاینت (برای رندر و درک پیچ‌ها)
function centerOffset(track, dist) {
  return Math.sin(dist / 260) * 0.28 + Math.sin(dist / 90 + track.seed) * 0.1;
}

function buildTrack(track) {
  const rnd = mulberry32(track.seed * 1000 + track.length);
  const obstacles = [];
  const gates = []; // میان‌برها
  const spacing = 110 / track.obstacleDensity;
  for (let d = 300; d < track.length - 200; d += spacing * (0.7 + rnd() * 0.6)) {
    obstacles.push({ x: (rnd() * 1.5 - 0.75), d: Math.round(d), w: 0.16 + rnd() * 0.1 });
  }
  for (let d = track.shortcutEvery; d < track.length - 400; d += track.shortcutEvery) {
    gates.push({ x: rnd() * 1.2 - 0.6, d: Math.round(d + rnd() * 120), w: 0.14, used: new Set() });
  }
  return { obstacles, gates };
}

function makeLogic(ctx) {
  const cfg = ctx.cfg;
  const track = cfg.tracks[Math.floor(Math.random() * cfg.tracks.length)];
  const built = buildTrack(track);
  let elapsed = 0, timer = null, over = false, startTime = 0;

  const cars = ctx.players.map((p, i) => ({
    id: p.id, isBot: !!p.isBot, bot: p,
    x: ((i % 4) - 1.5) * 0.38, dist: 0, speed: cfg.baseSpeed,
    boost: 100, boosting: false, targetX: ((i % 4) - 1.5) * 0.38,
    crashedUntil: 0, finished: false, finishTime: null, score: 0,
    botDecideAt: 0, lastDist: 0,
  }));
  const byId = new Map(cars.map((c) => [c.id, c]));

  function tick() {
    const dt = cfg.tickMs / 1000;
    elapsed += dt;
    const now = elapsed;

    for (const c of cars) {
      if (c.finished) continue;
      if (c.isBot) botDrive(c, dt);

      // فرمان: حرکت نرم به سمت هدف
      const drift = (centerOffset(track, c.dist + 10) - centerOffset(track, c.dist)) * cfg.baseSpeed * 0.9;
      const dx = Math.max(-cfg.steerSpeed * dt, Math.min(cfg.steerSpeed * dt, c.targetX - c.x));
      c.x = Math.max(-1, Math.min(1, c.x + dx - drift * dt));

      // بوست
      if (c.boosting && c.boost > 0) c.boost = Math.max(0, c.boost - cfg.boostDrainPerSec * dt);
      else { c.boosting = false; c.boost = Math.min(100, c.boost + cfg.boostRegenPerSec * dt); }

      const crashed = now < c.crashedUntil;
      let speed = cfg.baseSpeed * (c.boosting && c.boost > 0 ? cfg.boostMultiplier : 1) * (crashed ? cfg.crashSpeedFactor : 1);
      const delta = speed * dt;

      // تشخیص حرکت ناممکن (ضدتقلب) — قبل از اعمال میان‌بر
      const maxLegal = cfg.baseSpeed * cfg.boostMultiplier * dt * 1.25;
      if (!anticheat.checkImpossibleJump(c.id, ctx.matchId, delta, maxLegal)) continue;

      c.dist += delta;

      // برخورد با مانع
      if (!crashed) {
        for (const o of built.obstacles) {
          if (Math.abs(o.d - c.dist) < 14 && Math.abs(o.x - c.x) < o.w + 0.09) {
            c.crashedUntil = now + cfg.crashSlowdownMs / 1000;
            ctx.broadcast('r.crash', { id: c.id, d: Math.round(c.dist) });
            break;
          }
        }
      }

      // دروازه میان‌بر
      for (const g of built.gates) {
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
      c.lastDist = c.dist;
    }

    if (cars.every((c) => c.finished) || elapsed >= cfg.maxDurationSec) return finish();
    ctx.broadcast('s.snapshot', buildSnapshot());
  }

  function botDrive(c, dt) {
    if (elapsed < c.botDecideAt) { if (c.boosting && c.boost < 15) c.boosting = false; return; }
    c.botDecideAt = elapsed + 0.12;
    const p = c.bot.params;
    const lookahead = cfg.baseSpeed * (c.boosting ? 1.1 : 0.75);
    const lanes = [-0.7, -0.35, 0, 0.35, 0.7];
    let best = c.x, bestScore = -Infinity;
    for (const lane of lanes) {
      let danger = 0;
      for (const o of built.obstacles) {
        if (o.d > c.dist && o.d < c.dist + lookahead && Math.abs(o.x - lane) < o.w + 0.12) danger += 1 - (o.d - c.dist) / lookahead;
      }
      let gateReward = 0;
      for (const g of built.gates) {
        if (!g.used.has(c.id) && g.d > c.dist && g.d < c.dist + lookahead && Math.abs(g.x - lane) < g.w + 0.1) {
          gateReward = p.raceAccuracy * 1.6;
        }
      }
      const score = -danger * 3 + gateReward - Math.abs(lane - c.x) * 0.5 + Math.random() * (1 - p.raceAccuracy);
      if (score > bestScore) { bestScore = score; best = lane; }
    }
    c.targetX = Math.random() < p.raceAccuracy ? best : c.targetX;
    const clearAhead = !built.obstacles.some((o) => o.d > c.dist && o.d < c.dist + lookahead * 0.8 && Math.abs(o.x - c.x) < 0.25);
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
    for (const c of cars) {
      out[c.id] = c.finished ? Math.round(200000 - c.finishTime / 10) : Math.round(c.dist * 10);
    }
    return out;
  }

  function buildSnapshot() {
    return {
      t: Math.round(elapsed * 10) / 10,
      cars: cars.map((c) => ({
        id: c.id, x: Math.round(c.x * 100) / 100, d: Math.round(c.dist),
        bst: Math.round(c.boost), on: c.boosting, cr: elapsed < c.crashedUntil, fin: c.finished,
      })),
    };
  }

  return {
    id: 'StreetRace',
    start() {
      startTime = Date.now();
      ctx.broadcast('r.init', { track: { id: track.id, name: track.name, length: track.length, seed: track.seed }, obstacles: built.obstacles, gates: built.gates.map((g) => ({ x: g.x, d: g.d, w: g.w })) });
      timer = setInterval(tick, cfg.tickMs);
    },
    onInput(pid, msg) {
      const c = byId.get(pid);
      if (!c || c.finished || c.isBot) return;
      if (msg.t === 'steer') {
        c.targetX = Math.max(-1, Math.min(1, msg.x));
        c.boosting = !!msg.boost;
      } else if (msg.t === 'release') {
        c.boosting = false;
      }
    },
    scores,
    takeover(pid, params) { const c = byId.get(pid); if (c) { c.isBot = true; c.bot = { params }; } },
    release(pid) { const c = byId.get(pid); if (c) c.isBot = false; },
    snapshot: buildSnapshot,
    destroy() { over = true; if (timer) clearInterval(timer); },
  };
}

module.exports = { makeLogic, centerOffset };
