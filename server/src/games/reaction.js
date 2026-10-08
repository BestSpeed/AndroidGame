'use strict';
// دست‌به‌کار (ReactionGame) — واکنش + حافظه + فریب. کاملاً سرور-معتبر:
// زمان‌سنجی و داوری سمت سرور است؛ کلاینت فقط «تپ» می‌فرستد.
const { reactionFor, shouldErr } = require('../bots');
const anticheat = require('../anticheat');

const RULE_TYPES = ['direct', 'color_tap', 'color_hold', 'shape_tap'];

function makeLogic(ctx) {
  const cfg = ctx.cfg;
  const players = ctx.players.map((p) => ({
    id: p.id, isBot: !!p.isBot, bot: p, score: 0, combo: 0,
    lockedUntil: 0, lastAction: null, reactedAt: null,
    fastHistory: [],
  }));
  const byId = new Map(players.map((p) => [p.id, p]));

  const state = {
    seq: 0, rule: { t: 'direct' }, ruleCardCount: 0, ruleChangeIn: rnd(...cfg.ruleChangeEvery),
    card: null, cardShownAt: 0, cardExpiresAt: 0, cardShowMs: cfg.cardShowMsStart,
    startedAt: 0, timers: [], over: false,
  };

  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
    let direct = Math.random() < cfg.tapRatio ? 'tap' : 'hold';
    // برای قوانین رنگی، گاهی کارت هدف را تضمین کن تا ترکیب تپ/نگهدار متعادل بماند
    if (state.rule.t === 'color_tap' && Math.random() < 0.45) return { color: state.rule.color, shape, direct };
    if (state.rule.t === 'color_hold' && Math.random() < 0.35) return { color: state.rule.color, shape, direct };
    if (state.rule.t === 'shape_tap' && Math.random() < 0.45) return { color, shape: state.rule.shape, direct };
    return { color, shape, direct };
  }

  function schedule(fn, ms) {
    const t = setTimeout(() => { if (!state.over) fn(); }, ms);
    state.timers.push(t);
    return t;
  }

  function showNextCard() {
    state.seq += 1;
    if (--state.ruleChangeIn <= 0) newRule();
    const card = makeCard();
    state.card = card;
    state.cardShownAt = Date.now();
    state.cardShowMs = Math.max(cfg.cardShowMsMin, state.cardShowMs - cfg.cardShowMsDecayPerCard);
    state.cardExpiresAt = state.cardShownAt + state.cardShowMs;
    for (const p of players) { p.lastAction = null; p.reactedAt = null; }
    ctx.broadcast('card.show', { seq: state.seq, card, showMs: state.cardShowMs });
    scheduleBots(card);
    schedule(expireCard, state.cardShowMs);
  }

  function expireCard() {
    const card = state.card;
    if (!card) return;
    const expected = expectedAction(card, state.rule);
    const results = [];
    for (const p of players) {
      if (p.lastAction === 'tap') continue; // قبلاً داوری شده
      if (expected === 'hold') {
        p.score += cfg.score.correctHold; p.combo += 1;
        results.push({ id: p.id, ok: true, kind: 'hold', d: cfg.score.correctHold });
      } else {
        p.score += cfg.score.missedTap; p.combo = 0;
        results.push({ id: p.id, ok: false, kind: 'miss', d: cfg.score.missedTap });
      }
    }
    ctx.broadcast('card.result', { seq: state.seq, results });
    state.card = null;
    const gap = cfg.gapMsMin + Math.random() * (cfg.gapMsMax - cfg.gapMsMin);
    schedule(showNextCard, gap);
  }

  function scheduleBots(card) {
    const expected = expectedAction(card, state.rule);
    for (const p of players) {
      if (!p.isBot) continue;
      const wantsTap = expected === 'tap' ? !shouldErr(p.bot) : shouldErr(p.bot) * 0.5 > Math.random() * 0.5;
      if (wantsTap) {
        schedule(() => handleTap(p, Date.now()), reactionFor(p.bot));
      }
    }
  }

  function handleTap(p, at) {
    if (state.over || p.lockedUntil > at) return;
    const card = state.card;
    if (!card) { // تپ در فضای خالی = اسپم
      p.score += Math.round(cfg.score.wrongTap / 2);
      p.combo = 0;
      p.lockedUntil = at + cfg.score.lockoutMs;
      ctx.broadcast('card.result', { seq: state.seq, results: [{ id: p.id, ok: false, kind: 'spam', d: Math.round(cfg.score.wrongTap / 2) }] });
      return;
    }
    if (p.lastAction) return;
    p.lastAction = 'tap';
    p.reactedAt = at;
    const expected = expectedAction(card, state.rule);
    const reactionMs = at - state.cardShownAt;
    if (expected === 'tap') {
      const speedBonus = Math.round(cfg.score.speedBonusMax * Math.max(0, 1 - reactionMs / state.cardShowMs));
      let gain = cfg.score.correctTap + speedBonus;
      p.combo += 1;
      if (p.combo >= cfg.score.comboAfter) gain += Math.min(cfg.score.comboBonusMax, cfg.score.comboBonusPerStep * (p.combo - cfg.score.comboAfter + 1));
      p.score += gain;
      anticheat.checkReaction(p.id, ctx.matchId, reactionMs, p.fastHistory);
      ctx.broadcast('card.result', { seq: state.seq, results: [{ id: p.id, ok: true, kind: 'tap', d: gain, ms: reactionMs }] });
    } else {
      p.score += cfg.score.wrongTap;
      p.combo = 0;
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
    takeover(pid, params) { const p = byId.get(pid); if (p) { p.isBot = true; p.bot = { params }; } },
    release(pid) { const p = byId.get(pid); if (p) { p.isBot = false; } },
    snapshot() {
      return {
        seq: state.seq, rule: state.rule,
        timeLeftMs: Math.max(0, cfg.durationSec * 1000 - (Date.now() - state.startedAt)),
        card: state.card ? { ...state.card, shownAt: state.cardShownAt, showMs: state.cardShowMs } : null,
        scores: this.scores(),
      };
    },
    destroy() { state.over = true; for (const t of state.timers) clearTimeout(t); },
  };
}

module.exports = { makeLogic };
