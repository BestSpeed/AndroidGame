// صفحات اصلی: ورود، خانه، بازی
import { t, fmt, getLang, setLang } from '../i18n.js';
import { el, avatarEl, topbar, toast, bottomNav } from '../ui.js';
import { api, setToken } from '../api.js';
import { store } from '../store.js';
import { sfx } from '../audio.js';
import { ev } from '../analytics.js';
import { connect } from '../socket.js';

export function loginScreen(root, onLoggedIn) {
  root.innerHTML = '';
  const langBtn = el('button', {
    class: 'btn ghost small', style: 'position:absolute;top:14px;left:14px',
    onclick: (e) => {
      setLang(getLang() === 'fa' ? 'en' : 'fa');
      e.target.textContent = getLang() === 'fa' ? 'English' : 'فارسی';
      loginScreen(root, onLoggedIn);
    },
  }, getLang() === 'fa' ? 'English' : 'فارسی');

  const btn = el('button', { class: 'btn primary block cta-play', style: 'max-width:340px' }, '🎮 ', t('login.enter'));
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = t('login.loading');
    try {
      sfx.go();
      const res = await api.guestLogin();
      setToken(res.token);
      connect();
      await onLoggedIn();
    } catch (e) {
      toast(e.message || t('err.generic'), 'err');
      btn.disabled = false; btn.textContent = '🎮 ' + t('login.enter');
    }
  });

  root.appendChild(el('div', { class: 'screen no-nav', style: 'justify-content:center;align-items:center;gap:14px;position:relative' },
    langBtn,
    el('div', { style: 'font-size:90px' }, '🕹️'),
    el('div', { style: 'font-size:42px;font-weight:900;background:linear-gradient(90deg,var(--accent2),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent' }, t('app.name')),
    el('div', { class: 'muted' }, t('app.tag')),
    el('div', { class: 'mt2', style: 'width:100%;display:flex;justify-content:center' }, btn),
    el('div', { class: 'muted', style: 'margin-top:8px' }, t('login.guest') + ' · ' + '8P · 3 ROUNDS'),
  ));
  ev('app_open', { lang: getLang() });
}

export function homeScreen(root) {
  const p = store.profile;
  root.innerHTML = '';
  const xpCur = p.xp, xpNext = p.xpNext || 100;
  const pct = Math.min(100, Math.round((xpCur / xpNext) * 100));

  const playBtn = el('button', { class: 'btn primary block cta-play', onclick: () => { sfx.go(); location.hash = '#play'; } },
    '🎮 ', t('home.play'));

  const daily = store.daily;
  const dailyCard = daily ? el('div', { class: 'card', style: 'cursor:pointer', onclick: () => location.hash = '#daily' },
    el('div', { class: 'spread' },
      el('div', {},
        el('div', { style: 'font-weight:800' }, '🎯 ', t('home.daily')),
        el('div', { class: 'muted' }, t('daily.target', { n: fmt(daily.target) })),
      ),
      el('div', { style: 'font-size:26px' }, daily.completed ? '✅' : '🎁'),
    ),
  ) : null;

  root.appendChild(el('div', { class: 'screen' },
    topbar(p),
    el('div', { class: 'card player-strip' },
      avatarEl(p.avatar, 58),
      el('div', { style: 'flex:1' },
        el('div', { style: 'font-weight:800' }, p.username),
        el('div', { class: 'row', style: 'margin-top:6px' },
          el('span', { class: 'badge-lvl' }, t('common.level', { n: fmt(p.level) })),
          el('div', { class: 'xpbar' }, el('i', { style: `width:${pct}%` })),
        ),
      ),
      el('div', { class: 'center', style: 'min-width:64px' },
        el('div', { style: 'font-weight:900;color:var(--accent2);font-size:20px' }, '🏆 ' + fmt(p.trophies)),
      ),
    ),
    el('div', { class: 'home-cta' }, playBtn),
    el('div', { class: 'home-second' },
      el('button', { class: 'btn', onclick: () => location.hash = '#friends' }, '👥 ', t('home.friends')),
      el('button', { class: 'btn', onclick: () => location.hash = '#leaderboard' }, '🏅 ', t('home.rank')),
    ),
    dailyCard,
    bottomNav('home'),
  ));
}

export function playScreen(root) {
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, t('nav.play')),
    el('div', { class: 'card', style: 'cursor:pointer', onclick: () => { sfx.go(); location.hash = '#matchmaking'; } },
      el('div', { style: 'font-size:34px' }, '⚡'),
      el('div', { style: 'font-weight:900;font-size:19px' }, t('play.quick')),
      el('div', { class: 'muted' }, t('play.quickDesc')),
    ),
    el('div', { class: 'card', style: 'cursor:pointer', onclick: () => location.hash = '#room' },
      el('div', { style: 'font-size:34px' }, '🚪'),
      el('div', { style: 'font-weight:900;font-size:19px' }, t('play.room')),
      el('div', { class: 'muted' }, t('play.roomDesc')),
    ),
    el('div', { class: 'card', style: 'cursor:pointer', onclick: () => location.hash = '#daily' },
      el('div', { style: 'font-size:34px' }, '🎯'),
      el('div', { style: 'font-weight:900;font-size:19px' }, t('play.daily')),
      el('div', { class: 'muted' }, t('daily.reward', { c: fmt(store.daily?.rewardCoins || 0), x: fmt(store.daily?.rewardXp || 0) })),
    ),
    bottomNav('play'),
  ));
}
