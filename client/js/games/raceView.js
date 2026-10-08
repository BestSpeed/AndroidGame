// رندر «مسابقه کوچه» — دوربین دنبال‌کننده، درون‌یابی اسنپ‌شات، فرمان لمسی.
import { t, fmt } from '../i18n.js';
import { el } from '../ui.js';
import { sendInput } from '../socket.js';
import { sfx } from '../audio.js';

// فرمول مشترک با سرور برای انحنای جاده
function centerOffset(track, dist) {
  return Math.sin(dist / 260) * 0.28 + Math.sin(dist / 90 + (track?.seed || 0)) * 0.1;
}

const CAR_COLORS = ['#ff5d73', '#4ecdc4', '#ffd166', '#9b6dff', '#c7f464', '#ff9f43', '#4d9dff', '#f368e0'];

export function createRaceView(container, ctx) {
  let track = { seed: 0, length: 3400, name: '' };
  let obstacles = [], gates = [];
  let snaps = [];
  let holding = { left: false, right: false, boost: false };
  let targetX = 0;
  let finished = false;

  const timeEl = el('div', { class: 'hud-pill' }, '');
  const posEl = el('div', { class: 'hud-pill' }, '');
  const boostEl = el('div', { class: 'hud-pill' }, '⚡ 100');
  const progress = el('div', { class: 'timebar' }, el('i', { style: 'width:0%' }));
  const hud = el('div', { class: 'game-hud' }, posEl, boostEl, timeEl);
  container.insertBefore(el('div', {}, hud, progress), container.firstChild);

  const canvas = el('canvas', { class: 'playfield' });
  const wrap = el('div', { class: 'game-area' }, canvas);
  container.insertBefore(wrap, container.querySelector('.emote-bar'));

  const controls = el('div', { class: 'game-controls' },
    el('button', { class: 'pad-btn', id: 'race-left' }, '⬅️'),
    el('button', { class: 'pad-btn boost', id: 'race-boost' }, '🚀'),
    el('button', { class: 'pad-btn', id: 'race-right' }, '➡️'),
  );
  container.insertBefore(controls, container.querySelector('.emote-bar'));

  function bindHold(btn, key) {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); holding[key] = true; btn.classList.add('hold'); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((evName) =>
      btn.addEventListener(evName, () => { holding[key] = false; btn.classList.remove('hold'); }));
  }
  bindHold(controls.querySelector('#race-left'), 'left');
  bindHold(controls.querySelector('#race-right'), 'right');
  bindHold(controls.querySelector('#race-boost'), 'boost');

  const keymap = { ArrowLeft: 'left', ArrowRight: 'right', ' ': 'boost' };
  const kd = (e) => { if (keymap[e.key] != null) { holding[keymap[e.key]] = true; e.preventDefault(); } };
  const ku = (e) => { if (keymap[e.key] != null) holding[keymap[e.key]] = false; };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  const g = canvas.getContext('2d');
  function resize() {
    const r = wrap.getBoundingClientRect();
    canvas.width = Math.max(200, Math.floor(r.width * devicePixelRatio));
    canvas.height = Math.max(200, Math.floor(r.height * devicePixelRatio));
  }
  resize();
  window.addEventListener('resize', resize);

  // حلقه ارسال فرمان — ~10Hz فقط وقتی چیزی تغییر کند
  let lastSent = 0;
  const inputTimer = setInterval(() => {
    const now = Date.now();
    if (now - lastSent < 90) return;
    if (!holding.left && !holding.right && !holding.boost && lastSent === -1) return;
    lastSent = now;
    sendInput({ t: 'steer', x: Math.round(targetX * 100) / 100, boost: holding.boost });
  }, 50);

  let lastFrame = performance.now();
  let raf = null;
  let prevSnap = null;

  function carAt(id, now) {
    // موقعیت درون‌یابی‌شده یک ماشین
    if (!snaps.length) return null;
    const cur = snaps[snaps.length - 1].data;
    const c = cur.cars.find((x) => x.id === id);
    if (!c) return null;
    if (prevSnap) {
      const p = prevSnap.data.cars.find((x) => x.id === id);
      if (p) {
        const f = Math.min(1, (now - prevSnap.t) / Math.max(1, cur.t - prevSnap.t + 0.001));
        return { ...c, d: p.d + (c.d - p.d) * Math.min(1, f), x: p.x + (c.x - p.x) * Math.min(1, f) };
      }
    }
    return c;
  }

  function draw(nowMs) {
    raf = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (nowMs - lastFrame) / 1000);
    lastFrame = nowMs;

    // فرمان محلی
    if (holding.left) targetX = Math.max(-1, targetX - 2.4 * dt);
    if (holding.right) targetX = Math.min(1, targetX + 2.4 * dt);

    const cw = canvas.width, ch = canvas.height;
    g.fillStyle = '#101426';
    g.fillRect(0, 0, cw, ch);

    const me = carAt(ctx.meId, nowMs);
    const camDist = (me?.d || 0) - 90;
    const camLen = 560;
    const roadHalf = cw * 0.34;
    const cx = (d) => cw / 2 + centerOffset(track, d) * cw * 0.42;
    const sy = (d) => ch - ((d - camDist) / camLen) * ch;

    // آسفالت
    g.beginPath();
    for (let d = camDist; d <= camDist + camLen; d += 8) {
      const x = cx(d);
      if (d === camDist) g.moveTo(x - roadHalf, sy(d));
      g.lineTo(x - roadHalf, sy(d));
    }
    for (let d = camDist + camLen; d >= camDist; d -= 8) g.lineTo(cx(d) + roadHalf, sy(d));
    g.closePath();
    g.fillStyle = '#2a2f45';
    g.fill();

    // خط‌چین وسط
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = Math.max(2, cw * 0.008);
    g.setLineDash([18, 26]);
    g.beginPath();
    for (let d = Math.floor(camDist / 44) * 44; d < camDist + camLen; d += 44) {
      const y = sy(d);
      if (y < -40 || y > ch + 40) continue;
      g.moveTo(cx(d), y); g.lineTo(cx(d + 20), sy(d + 20));
    }
    g.stroke();
    g.setLineDash([]);

    // خط پایان
    if (track.length > camDist && track.length < camDist + camLen) {
      const y = sy(track.length);
      for (let i = 0; i < 10; i++) {
        g.fillStyle = i % 2 ? '#fff' : '#111';
        g.fillRect(cx(track.length) - roadHalf + (i * roadHalf * 2) / 10, y - 8, (roadHalf * 2) / 10, 16);
      }
    }

    // دروازه‌های میان‌بر
    for (const gate of gates) {
      if (gate.d < camDist - 20 || gate.d > camDist + camLen + 20) continue;
      const y = sy(gate.d);
      const x = cx(gate.d) + gate.x * roadHalf;
      const gw = gate.w * roadHalf * 2 + 18;
      g.fillStyle = 'rgba(61,220,132,.9)';
      g.fillRect(x - gw / 2, y - 5, 8, 10);
      g.fillRect(x + gw / 2 - 8, y - 5, 8, 10);
      g.strokeStyle = 'rgba(61,220,132,.85)';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(x - gw / 2, y); g.lineTo(x + gw / 2, y); g.stroke();
      g.fillStyle = '#3ddc84';
      g.font = `${Math.max(12, cw * 0.035)}px Vazirmatn, sans-serif`;
      g.textAlign = 'center';
      g.fillText(t('game.shortcut'), x, y - 12);
    }

    // موانع
    for (const o of obstacles) {
      if (o.d < camDist - 30 || o.d > camDist + camLen + 30) continue;
      const y = sy(o.d);
      const x = cx(o.d) + o.x * roadHalf;
      const w = o.w * roadHalf * 2;
      g.fillStyle = '#ff9f43';
      g.beginPath();
      g.moveTo(x, y - 16); g.lineTo(x - w / 2, y + 10); g.lineTo(x + w / 2, y + 10);
      g.closePath(); g.fill();
      g.fillStyle = '#fff';
      g.fillRect(x - w / 4, y - 2, w / 2, 4);
    }

    // ماشین‌ها
    const idx = {};
    ctx.players.forEach((p, i) => { idx[p.id] = i; });
    const sorted = snaps.length ? [...snaps[snaps.length - 1].data.cars] : [];
    sorted.sort((a, b) => a.d - b.d);
    for (const snapCar of sorted) {
      const c = carAt(snapCar.id, nowMs);
      if (!c) continue;
      const y = sy(c.d);
      const x = cx(c.d) + c.x * roadHalf;
      if (y < -60 || y > ch + 60) continue;
      const isMe = c.id === ctx.meId;
      const carW = cw * 0.075, carH = cw * 0.12;
      g.fillStyle = c.cr ? '#888' : CAR_COLORS[(idx[c.id] ?? 0) % CAR_COLORS.length];
      g.beginPath();
      g.roundRect(x - carW / 2, y - carH / 2, carW, carH, 8);
      g.fill();
      if (isMe) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }
      if (c.on) {
        g.fillStyle = 'rgba(255,209,102,.8)';
        g.beginPath();
        g.moveTo(x - carW * 0.3, y + carH / 2); g.lineTo(x, y + carH / 2 + 22); g.lineTo(x + carW * 0.3, y + carH / 2);
        g.fill();
      }
      const p = ctx.players.find((pl) => pl.id === c.id);
      g.font = `${Math.max(14, cw * 0.045)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(p?.avatar?.emoji || '🚗', x, y + 6);
    }
  }
  raf = requestAnimationFrame(draw);

  return {
    handle(type, msg) {
      if (type === 'r.init') { track = msg.track; obstacles = msg.obstacles; gates = msg.gates; }
      else if (type === 's.snapshot') {
        snaps.push({ t: Date.now(), data: msg });
        if (snaps.length > 6) { prevSnap = snaps[snaps.length - 3]; snaps.shift(); }
        const mine = msg.cars.find((c) => c.id === ctx.meId);
        if (mine) {
          boostEl.textContent = '⚡ ' + fmt(mine.bst);
          progress.firstChild.style.width = Math.min(100, (mine.d / track.length) * 100) + '%';
          timeEl.textContent = '🏁 ' + fmt(Math.max(0, Math.ceil(ctx.durationSec - msg.t)));
          const sortedByDist = [...msg.cars].sort((a, b) => b.d - a.d);
          posEl.textContent = '🏆 ' + fmt(sortedByDist.findIndex((c) => c.id === ctx.meId) + 1) + '/' + fmt(msg.cars.length);
        }
      }
      else if (type === 'r.crash') { if (msg.id === ctx.meId) sfx.hit(); }
      else if (type === 'r.shortcut') { if (msg.id === ctx.meId) { sfx.reward(); } }
      else if (type === 'r.finished') { if (msg.id === ctx.meId && !finished) { finished = true; sfx.win(); } }
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(inputTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      container.querySelectorAll('.game-hud, .timebar, .game-area, .game-controls').forEach((n) => n.remove());
    },
  };
}
