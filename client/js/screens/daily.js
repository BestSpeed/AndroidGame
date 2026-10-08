// چالش روز — بند ۲۲
import { t, fmt } from '../i18n.js';
import { el, topbar, toast, bottomNav } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { sfx } from '../audio.js';

export function dailyScreen(root) {
  root.innerHTML = '';
  const box = el('div', { class: 'muted' }, t('common.loading'));
  root.appendChild(el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, '🎯 ', t('daily.title')),
    box,
    bottomNav('play'),
  ));

  api.daily().then(({ daily }) => {
    store.daily = daily;
    store.dailyTarget = daily.target;
    box.innerHTML = '';
    const playBtn = el('button', { class: 'btn primary block cta-play', onclick: async () => {
      try {
        sfx.go();
        await api.dailyStart(); // مچ تک‌نفره از سمت سرور شروع می‌شود و match.found می‌آید
      } catch (e) { toast(e.message, 'err'); }
    } }, '🎯 ', t('daily.play'));
    if (daily.attemptsLeft <= 0) { playBtn.disabled = true; playBtn.textContent = t('daily.noAttempts'); }

    box.appendChild(el('div', {},
      el('div', { class: 'card center' },
        el('div', { style: 'font-size:50px' }, daily.completed ? '✅' : '⚡'),
        el('div', { style: 'font-weight:900;font-size:19px' }, t('game.name.ReactionGame')),
        el('div', { class: 'muted mt' }, t('daily.target', { n: fmt(daily.target) })),
        el('div', { class: 'muted' }, t('daily.best', { n: fmt(daily.bestScore) })),
        el('div', { class: 'muted' }, t('daily.attempts', { n: fmt(daily.attemptsLeft) })),
        el('div', { class: 'divider' }),
        el('div', { style: 'font-weight:800;color:var(--accent2)' }, t('daily.reward', { c: fmt(daily.rewardCoins), x: fmt(daily.rewardXp) })),
      ),
      el('div', { class: 'mt' }, playBtn),
    ));
  }).catch((e) => toast(e.message, 'err'));
}
