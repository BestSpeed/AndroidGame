// رندر «مار محله» — درون‌یابی بین اسنپ‌شات‌های سرور برای حرکت نرم.
import { t, fmt } from '../i18n.js';
import { el } from '../ui.js';
import { sendInput } from '../socket.js';
import { sfx } from '../audio.js';

const SNAKE_COLORS = ['#ff5d73', '#4ecdc4', '#ffd166', '#9b6dff', '#c7f464', '#ff9f43', '#4d9dff', '#f368e0'];

export function createSnakeView(container, ctx) {
  let W = 24, H = 32, safe = { x0: 0, y0: 0, x1: 23, y1: 31 };
  let snaps = []; // {t: time, data}
  let myAlive = true, myFood = 0;
  let sudden = false;

  const canvas = el('canvas', { class: 'playfield' });
  const timeEl = el('div', { class: 'hud-pill' }, '');
  const aliveEl = el('div', { class: 'hud-pill' }, '');
  const scoreEl = el('div', { class: 'hud-pill' }, '🍎 0');
  const suddenBanner = el('div', { class: 'rule-banner', style: 'background:var(--danger);display:none' }, t('game.sudden'));
  const hud = el('div', { class: 'game-hud' }, timeEl, scoreEl, aliveEl);
  container.insertBefore(el('div', {}, hud, suddenBanner), container.firstChild);
  const wrap = el('div', { class: 'game-area' }, canvas);
  container.insertBefore(wrap, container.querySelector('.emote-bar'));

  // کنترل‌ها: دی‌پد + سوایپ
  let lastDir = null;
  function sendDir(d) {
    if (d === lastDir) return;
    lastDir = d;
    sendInput({ t: 'dir', d });
  }
  const pad = el('div', { class: 'game-controls', style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px' },
    el('div'),
    el('button', { class: 'pad-btn', 'data-d': 'up' }, '⬆️'),
    el('div'),
    el('button', { class: 'pad-btn', 'data-d': 'left' }, '⬅️'),
    el('button', { class: 'pad-btn', 'data-d': 'down' }, '⬇️'),
    el('button', { class: 'pad-btn', 'data-d': 'right' }, '➡️'),
  );
  pad.querySelectorAll('.pad-btn').forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); sendDir(b.dataset.d); });
  });
  container.insertBefore(pad, container.querySelector('.emote-bar'));

  let swipeStart = null;
  canvas.addEventListener('pointerdown', (e) => { swipeStart = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!swipeStart) return;
    const dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) sendDir(dx > 0 ? 'right' : 'left');
    else sendDir(dy > 0 ? 'down' : 'up');
    swipeStart = null;
  });

  const g = canvas.getContext('2d');
  function resize() {
    const r = wrap.getBoundingClientRect();
    canvas.width = Math.max(200, Math.floor(r.width * devicePixelRatio));
    canvas.height = Math.max(200, Math.floor(r.height * devicePixelRatio));
  }
  resize();
  window.addEventListener('resize', resize);

  function lerpSnaps(now) {
    if (!snaps.length) return null;
    const RENDER_DELAY = 160;
    const target = now - RENDER_DELAY;
    if (snaps.length === 1 || target <= snaps[0].t) return snaps[0].data;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= target) {
        const a = snaps[i], b = snaps[i + 1];
        if (!b) return a.data;
        const f = Math.min(1, (target - a.t) / Math.max(1, b.t - a.t));
        return { ...b.data, _from: a.data, _f: f };
      }
    }
    return snaps[snaps.length - 1].data;
  }

  let raf = null;
  function draw() {
    raf = requestAnimationFrame(draw);
    const data = lerpSnaps(Date.now());
    const cw = canvas.width, ch = canvas.height;
    g.fillStyle = '#171030';
    g.fillRect(0, 0, cw, ch);
    if (!data) return;
    if (data.safe) safe = data.safe;
    const cell = Math.min(cw / W, ch / H);
    const ox = (cw - cell * W) / 2, oy = (ch - cell * H) / 2;

    // منطقه خطر بیرون دیوار امن
    g.fillStyle = 'rgba(255,60,80,.16)';
    g.fillRect(ox, oy, cell * W, cell * safe.y0);
    g.fillRect(ox, oy + cell * (safe.y1 + 1), cell * W, cell * (H - safe.y1 - 1));
    g.fillRect(ox, oy + cell * safe.y0, cell * safe.x0, cell * (safe.y1 - safe.y0 + 1));
    g.fillRect(ox + cell * (safe.x1 + 1), oy + cell * safe.y0, cell * (W - safe.x1 - 1), cell * (safe.y1 - safe.y0 + 1));

    // غذاها
    for (const f of data.food || []) {
      g.fillStyle = '#ff4d5e';
      g.beginPath();
      g.arc(ox + (f.x + 0.5) * cell, oy + (f.y + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3ddc84';
      g.fillRect(ox + (f.x + 0.45) * cell, oy + (f.y + 0.05) * cell, cell * 0.1, cell * 0.2);
    }

    // مارها
    const idx = {};
    ctx.players.forEach((p, i) => { idx[p.id] = i; });
    for (const s of data.snakes || []) {
      if (!s.a) continue;
      const color = SNAKE_COLORS[(idx[s.id] ?? 0) % SNAKE_COLORS.length];
      g.fillStyle = s.id === ctx.meId ? '#ffffff' : color;
      const cells = s.c;
      for (let i = cells.length - 1; i >= 0; i--) {
        const [x, y] = cells[i];
        const isHead = i === 0;
        g.globalAlpha = isHead ? 1 : 0.85;
        g.beginPath();
        g.roundRect(ox + x * cell + cell * 0.08, oy + y * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * (isHead ? 0.4 : 0.28));
        g.fill();
      }
      g.globalAlpha = 1;
      // چشم‌های سر
      const [hx, hy] = cells[0] || [0, 0];
      g.fillStyle = '#171030';
      g.beginPath();
      g.arc(ox + (hx + 0.35) * cell, oy + (hy + 0.4) * cell, cell * 0.1, 0, Math.PI * 2);
      g.arc(ox + (hx + 0.65) * cell, oy + (hy + 0.4) * cell, cell * 0.1, 0, Math.PI * 2);
      g.fill();
    }
  }
  raf = requestAnimationFrame(draw);

  return {
    handle(type, msg) {
      if (type === 's.init') { W = msg.w; H = msg.h; safe = msg.safe; }
      else if (type === 's.snapshot') {
        snaps.push({ t: Date.now(), data: msg });
        if (snaps.length > 8) snaps.shift();
        const mine = msg.snakes.find((s) => s.id === ctx.meId);
        if (mine) {
          if (!mine.a && myAlive) { myAlive = false; sfx.fail(); }
          myFood = Math.floor((mine.g || 0));
        }
        aliveEl.textContent = '🐍 ' + fmt(msg.snakes.filter((s) => s.a).length);
        scoreEl.textContent = '🍎 ' + fmt(msg.snakes.find((s) => s.id === ctx.meId)?.c?.length - 3 || 0);
      }
      else if (type === 's.eat') { if (msg.id === ctx.meId) { sfx.eat(); } }
      else if (type === 's.dead') { if (msg.id === ctx.meId) toastDeath(); }
      else if (type === 'sudden') { sudden = true; suddenBanner.style.display = ''; sfx.hit(); }
      else if (type === 'walls') { safe = msg.safe; }
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      container.querySelectorAll('.game-hud, .rule-banner, .game-area, .game-controls').forEach((n) => n.remove());
    },
  };

  function toastDeath() {
    const b = el('div', { class: 'rule-banner', style: 'background:var(--card);text-align:center' }, '💀 ' + t('game.spectating'));
    container.insertBefore(b, container.querySelector('.emote-bar'));
    setTimeout(() => b.remove(), 2500);
  }
}
