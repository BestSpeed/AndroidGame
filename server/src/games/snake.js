'use strict';
// مار محله (SnakeArena) — سرور-معتبر: حرکت، برخورد و رشد همه سمت سرور محاسبه می‌شود.
// پاورآپ در MVP ندارد؛ نقطه توسعه آینده در انتهای فایل مشخص شده. (بند ۸)

const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const SPAWNS = [ // ۸ نقطه شروع پخش روی زمین
  { x: 3, y: 4, d: 'down' }, { x: 20, y: 4, d: 'down' },
  { x: 3, y: 27, d: 'up' }, { x: 20, y: 27, d: 'up' },
  { x: 7, y: 15, d: 'right' }, { x: 16, y: 15, d: 'left' },
  { x: 11, y: 8, d: 'down' }, { x: 12, y: 23, d: 'up' },
];

function makeLogic(ctx) {
  const cfg = ctx.cfg;
  const W = cfg.gridW, H = cfg.gridH;
  const safe = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  let elapsed = 0, nextShrinkAt = cfg.suddenDeathAtSec, sudden = false, over = false, timer = null;
  let lastInputAt = new Map(); // برای نرخ‌سنجی ورودی مار

  const snakes = ctx.players.map((p, i) => {
    const sp = SPAWNS[i % SPAWNS.length];
    const cells = [];
    for (let k = 0; k < 3; k++) cells.push({ x: sp.x - DIRS[sp.d].x * k, y: sp.y - DIRS[sp.d].y * k });
    return {
      id: p.id, isBot: !!p.isBot, bot: p, cells, dir: sp.d, queue: [],
      alive: true, growth: 0, acc: 0, foodEaten: 0, diedAt: null,
      botDecideAt: 0,
    };
  });
  const byId = new Map(snakes.map((s) => [s.id, s]));

  const food = [];
  function freeCell() {
    for (let tries = 0; tries < 60; tries++) {
      const c = { x: safe.x0 + Math.floor(Math.random() * (safe.x1 - safe.x0 + 1)), y: safe.y0 + Math.floor(Math.random() * (safe.y1 - safe.y0 + 1)) };
      if (!snakes.some((s) => s.cells.some((b) => b.x === c.x && b.y === c.y)) && !food.some((f) => f.x === c.x && f.y === c.y)) return c;
    }
    return null;
  }
  for (let i = 0; i < cfg.foodCount; i++) { const c = freeCell(); if (c) food.push(c); }

  function key(x, y) { return x + ',' + y; }
  function occupiedSet(excludeTailOf = null) {
    const set = new Set();
    for (const s of snakes) {
      if (!s.alive) continue;
      const cells = s === excludeTailOf && s.growth === 0 ? s.cells.slice(0, -1) : s.cells;
      for (const c of cells) set.add(key(c.x, c.y));
    }
    return set;
  }

  // امتیاز بقا هر ثانیه
  let survivalAcc = 0;

  function tick() {
    const dt = cfg.tickMs / 1000;
    elapsed += dt;

    if (!sudden && elapsed >= cfg.suddenDeathAtSec) {
      sudden = true;
      ctx.broadcast('sudden', { at: elapsed });
    }
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
      while (s.acc >= 1) {
        s.acc -= 1;
        stepSnake(s);
        if (!s.alive) break;
      }
    }

    resolveHeadCollisions();

    const alive = snakes.filter((s) => s.alive);
    if (alive.length <= 1 || elapsed >= cfg.maxDurationSec) {
      if (alive.length === 1) alive[0].score = (alive[0].score || 0) + 50; // پاداش آخرین بازمانده
      finish();
      return;
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
    const body = occupiedSet(s);
    if (body.has(key(nx, ny))) return kill(s);
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

  function resolveHeadCollisions() {
    const heads = new Map();
    for (const s of snakes) if (s.alive) heads.set(key(s.cells[0].x, s.cells[0].y), (heads.get(key(s.cells[0].x, s.cells[0].y)) || []).concat(s));
    for (const list of heads.values()) {
      if (list.length > 1) for (const s of list) kill(s); // برخورد شاخ‌به‌شاخ: هر دو می‌بازند
    }
  }

  function kill(s) {
    if (!s.alive) return;
    s.alive = false; s.diedAt = elapsed;
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
      const center = -Math.abs(nx - W / 2) * 0.1 - Math.abs(ny - H / 2) * 0.05;
      const scoreVal = -foodDist * 2 + space * 1.2 + center + Math.random() * (s.bot.botDifficulty === 'easy' ? 4 : 1);
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
    for (const s of snakes) out[s.id] = Math.round(s.score || 0) + s.foodEaten * 0; // بقا+غذا در s.score
    return out;
  }

  function buildSnapshot() {
    return {
      t: Math.round(elapsed * 10) / 10,
      safe,
      food,
      snakes: snakes.map((s) => ({ id: s.id, a: s.alive, c: s.cells.map((c) => [c.x, c.y]), g: s.growth })),
    };
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
      const now = Date.now();
      const last = lastInputAt.get(pid) || [];
      const recent = last.filter((t) => t > now - 1000);
      if (recent.length >= cfg.maxInputsPerSec) return; // نرخ‌سنجی — ضد اسپم/تقلب
      recent.push(now);
      lastInputAt.set(pid, recent);
      if (s.queue.length < 3) s.queue.push(msg.d);
    },
    scores,
    takeover(pid, params) { const s = byId.get(pid); if (s) { s.isBot = true; s.bot = { params }; } },
    release(pid) { const s = byId.get(pid); if (s) s.isBot = false; },
    snapshot: buildSnapshot,
    destroy() { over = true; if (timer) clearInterval(timer); },
  };
  // TODO(post-MVP): پاورآپ‌ها — بوت سرعت/سپر/بمب/آهنربا/تله (بند ۸). نقطه ورود: همین ماژول + کانفیگ.
}

module.exports = { makeLogic };
