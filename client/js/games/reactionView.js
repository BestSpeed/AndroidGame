// رندر «دست‌به‌کار» — ورودی: تپ روی کل صفحه. داوری با سرور است؛ اینجا فقط نمایش و ارسال است.
import { t, fmt } from '../i18n.js';
import { el } from '../ui.js';
import { sendInput } from '../socket.js';
import { sfx } from '../audio.js';

const COLORS = { red: '#ff4d5e', blue: '#4d9dff', green: '#3ddc84', yellow: '#ffd166' };
const SHAPES = { circle: '●', square: '■', triangle: '▲', star: '★' };

export function createReactionView(container, ctx) {
  let rule = { t: 'direct' };
  let cardActive = false;
  let score = 0, combo = 0;
  const startedAt = Date.now();
  const durationMs = (ctx.durationSec || 45) * 1000;

  const scoreEl = el('div', { class: 'hud-pill' }, '⭐ 0');
  const comboEl = el('div', { class: 'hud-pill' }, '🔥 0');
  const timeEl = el('div', { class: 'hud-pill' }, fmt(ctx.durationSec || 45));
  const timebar = el('div', { class: 'timebar' }, el('i', { style: 'width:100%' }));
  const ruleBanner = el('div', { class: 'rule-banner' }, ruleText(rule));
  const card = el('div', { class: 'reaction-card idle' },
    el('div', { class: 'muted' }, t('round.getready')));
  const area = el('div', { class: 'reaction-wrap' },
    el('div', { class: 'game-hud' }, scoreEl, comboEl, timeEl),
    timebar, ruleBanner, card);

  area.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sendInput({ t: 'tap', ts: Date.now() });
  });

  container.insertBefore(area, container.firstChild);

  function ruleText(r) {
    switch (r.t) {
      case 'color_tap': return '👆 ' + t('game.rule.tapOnly', { c: t('game.color.' + r.color) });
      case 'color_hold': return '✋ ' + t('game.rule.notColor', { c: t('game.color.' + r.color) });
      case 'shape_tap': return '👆 ' + t('game.rule.shapeOnly', { s: t('game.shape.' + r.shape) });
      default: return '🃏 ' + t('game.rule.direct');
    }
  }

  function renderCard(c) {
    cardActive = true;
    card.className = 'reaction-card';
    card.style.background = COLORS[c.color] || '#555';
    card.innerHTML = '';
    const shape = c.direct === 'tap' ? '✅' : c.direct === 'hold' ? '✋' : SHAPES[c.shape] || '●';
    card.appendChild(el('div', { class: 'shape' }, rule.t === 'direct' ? (c.direct === 'tap' ? '✅' : '✋') : SHAPES[c.shape]));
    card.appendChild(el('div', { class: 'word' }, t('game.color.' + c.color)));
    if (rule.t === 'direct') {
      card.appendChild(el('div', { style: 'font-size:22px;font-weight:900;color:#fff' }, c.direct === 'tap' ? t('game.tap') : t('game.hold')));
    }
  }

  function floatScore(text, ok) {
    const f = el('div', { class: 'float-score', style: `color:${ok ? 'var(--ok)' : 'var(--danger)'};left:${30 + Math.random() * 40}%;top:40%` }, text);
    area.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  const hudTimer = setInterval(() => {
    const left = Math.max(0, durationMs - (Date.now() - startedAt));
    timeEl.textContent = fmt(Math.ceil(left / 1000));
    timebar.firstChild.style.width = (left / durationMs) * 100 + '%';
  }, 250);

  return {
    handle(type, msg) {
      if (type === 'rule.set') {
        rule = msg.rule;
        ruleBanner.textContent = ruleText(rule);
        sfx.click();
      } else if (type === 'card.show') {
        renderCard(msg.card);
      } else if (type === 'card.result') {
        cardActive = false;
        for (const r of msg.results || []) {
          if (r.id !== ctx.meId) continue;
          score += r.d;
          combo = r.ok ? combo + 1 : 0;
          scoreEl.textContent = '⭐ ' + fmt(score);
          comboEl.textContent = '🔥 ' + fmt(combo);
          if (r.ok) { sfx.ok(); floatScore('+' + fmt(r.d), true); card.classList.add('flash-ok'); }
          else {
            sfx.fail(); floatScore(fmt(r.d), false); card.classList.add('flash-bad');
            if (r.kind === 'spam' || r.kind === 'wrong') card.style.background = '#3a2573';
          }
          setTimeout(() => card.classList.remove('flash-ok', 'flash-bad'), 380);
        }
        if (!cardActive) {
          card.className = 'reaction-card idle';
          card.style.background = '';
          card.innerHTML = '';
          card.appendChild(el('div', { class: 'muted' }, '…'));
        }
      }
    },
    destroy() { clearInterval(hudTimer); area.remove(); },
  };
}
