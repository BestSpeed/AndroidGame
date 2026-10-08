// فروشگاه، پروفایل، لیدربرد، دوستان، تنظیمات
import { t, fmt, getLang, setLang } from '../i18n.js';
import { el, avatarEl, topbar, toast, bottomNav, modal } from '../ui.js';
import { api, isOffline, setForceOffline } from '../api.js';
import { store } from '../store.js';
import { sfx, setVolumes, getVolumes, startMusic } from '../audio.js';
import { ev } from '../analytics.js';

const AVATAR_CHOICES = ['😎', '🦊', '🐯', '🐼', '🦁', '🐸', '🚲', '🛼', '🌸', '🐓', '🚀', '🫖', '🐉', '🤠', '👻', '🦄'];

export function shopScreen(root) {
  root.innerHTML = '';
  ev('shop_open', {});
  const grid = el('div', { class: 'shop-grid' }, el('div', { class: 'muted' }, t('common.loading')));
  root.appendChild(el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, '🛍️ ', t('shop.title')),
    grid,
    bottomNav('shop'),
  ));

  api.shop().then(({ items, owned }) => {
    grid.innerHTML = '';
    for (const item of items) {
      ev('item_view', { item_id: item.id });
      const isOwned = owned.includes(item.id);
      const priceTxt = item.currency === 'iap' ? item.priceIap[getLang()] : `${fmt(item.price)} ${item.currency === 'gems' ? '💎' : '🪙'}`;
      const btn = el('button', { class: 'btn small ' + (isOwned ? 'ghost' : 'gold') },
        isOwned ? (item.type === 'avatar' || item.type === 'frame' ? t('shop.equip') : t('shop.owned')) : `${t('shop.buy')} · ${priceTxt}`);
      if (isOwned && item.type !== 'avatar' && item.type !== 'frame') btn.disabled = true;
      btn.addEventListener('click', () => buyOrEquip(item, isOwned, btn));
      grid.appendChild(el('div', { class: `shop-item rarity-${item.rarity}` },
        el('div', { class: 'ic' }, item.type === 'pack' ? (item.asset === 'gems' ? '💎' : '🪙') : item.asset),
        el('div', { style: 'font-weight:800;font-size:13.5px' }, item.name[getLang()]),
        el('div', { class: 'muted', style: 'font-size:11px' }, t('shop.rarity.' + item.rarity)),
        btn,
      ));
    }
  }).catch((e) => toast(e.message, 'err'));

  async function buyOrEquip(item, isOwned, btn) {
    sfx.click();
    try {
      if (isOwned) {
        await api.equip(item.id);
        toast(t('shop.equipped'), 'ok');
        await refresh();
        return;
      }
      if (item.currency === 'iap') return iapFlow(item);
      const r = await api.buy(item.id);
      store.profile = r.profile;
      toast(t('shop.bought'), 'ok');
      sfx.reward();
      await refresh();
      shopScreen(root);
    } catch (e) { toast(e.message, 'err'); }
  }

  // جریان خرید درون‌برنامه‌ای — در این بیلد: شبیه‌ساز تأیید (بدون درگاه واقعی)
  async function iapFlow(item) {
    const confirmBtn = el('button', { class: 'btn gold block' }, t('shop.iapMock'));
    const m = modal(el('div', {},
      el('div', { class: 'h2 center' }, item.name[getLang()]),
      el('div', { class: 'center', style: 'font-size:44px' }, '💎'),
      el('div', { class: 'center muted' }, item.priceIap[getLang()]),
      el('div', { class: 'divider' }),
      confirmBtn,
    ));
    confirmBtn.onclick = async () => {
      try {
        ev('iap_start', { item: item.id });
        const s = await api.iapStart(item.id);
        const r = await api.iapMockComplete(s.orderId);
        store.profile = r.profile;
        m._close();
        toast(t('shop.iapSuccess'), 'ok');
        sfx.reward();
        shopScreen(root);
      } catch (e) { toast(e.message, 'err'); }
    };
  }

  async function refresh() {
    const r = await api.me();
    store.profile = r.profile;
  }
}

export function profileScreen(root) {
  root.innerHTML = '';
  const p = store.profile;
  const ach = [
    { icon: '🏆', name: 'اولین برد', done: p.stats.wins >= 1 },
    { icon: '🎮', name: 'ده مسابقه', done: p.stats.matches >= 10 },
    { icon: '⭐', name: 'پنج برد', done: p.stats.wins >= 5 },
    { icon: '🐍', name: 'مار جون‌سخت', done: (p.stats.snakeWins || 0) >= 1 },
  ];
  function makeEmojiGrid() {
    const grid = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px' });
    for (const e of AVATAR_CHOICES) {
      grid.appendChild(el('button', {
        class: 'btn small', style: 'font-size:22px;padding:6px 10px',
        onclick: async () => {
          const r = await api.updateMe({ avatar: { emoji: e } });
          store.profile = r.profile; sfx.click();
          document.querySelector('.modal-back')?._close();
          profileScreen(root);
        },
      }, e));
    }
    return grid;
  }
  root.appendChild(el('div', { class: 'screen' },
    topbar(p),
    el('div', { class: 'card center' },
      avatarEl(p.avatar, 84),
      el('div', { class: 'h2', style: 'margin-top:10px' }, p.username),
      el('div', { class: 'row', style: 'justify-content:center' },
        el('span', { class: 'badge-lvl' }, t('common.level', { n: fmt(p.level) })),
        el('span', { class: 'muted' }, '🏆 ' + fmt(p.trophies)),
      ),
      el('div', { class: 'xpbar mt', style: 'max-width:260px;margin-inline:auto' },
        el('i', { style: `width:${Math.min(100, (p.xp / (p.xpNext || 1)) * 100)}%` })),
      el('div', { class: 'muted mt' }, `${fmt(p.xp)} / ${fmt(p.xpNext)} XP`),
      el('button', { class: 'btn small ghost mt', onclick: () => modal(makeEmojiGrid()) }, '🎨 ', t('profile.avatar')),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'h2' }, t('profile.stats')),
      el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center' },
        statBox(p.stats.wins, t('profile.wins'), 'var(--ok)'),
        statBox(p.stats.losses, t('profile.losses'), 'var(--danger)'),
        statBox(p.stats.matches, t('profile.matches'), 'var(--accent2)'),
      ),
    ),
    el('div', { class: 'card' },
      el('div', { class: 'h2' }, t('profile.achievements')),
      ach.map((a) => el('div', { class: 'row', style: 'padding:6px 0', opacity: a.done ? 1 : 0.45 },
        el('span', { style: 'font-size:22px' }, a.icon),
        el('span', { style: 'flex:1;font-weight:700' }, a.name),
        el('span', {}, a.done ? '✅' : '🔒'),
      )),
    ),
    bottomNav('profile'),
  ));

  function statBox(v, label, color) {
    return el('div', {}, el('div', { style: `font-weight:900;font-size:20px;color:${color}` }, fmt(v)), el('div', { class: 'muted', style: 'font-size:12px' }, label));
  }
}

export function leaderboardScreen(root) {
  root.innerHTML = '';
  const list = el('div', {}, el('div', { class: 'muted' }, t('common.loading')));
  let type = 'global';
  const tabs = el('div', { class: 'tabs' });
  function renderTabs() {
    tabs.innerHTML = '';
    for (const [id, label] of [['global', t('lb.global')], ['weekly', t('lb.weekly')], ['friends', t('lb.friends')]]) {
      tabs.appendChild(el('div', { class: `tab ${type === id ? 'active' : ''}`, onclick: () => { type = id; renderTabs(); load(); } }, label));
    }
  }
  renderTabs();
  root.appendChild(el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, '🏅 ', t('lb.title')),
    tabs, list,
    bottomNav('home'),
  ));

  async function load() {
    list.innerHTML = `<div class="muted">${t('common.loading')}</div>`;
    try {
      const r = await api.leaderboard(type);
      const rows = (r.list || []);
      if (!rows.length) { list.innerHTML = `<div class="muted center">${t('lb.empty')}</div>`; return; }
      list.innerHTML = '';
      for (const row of rows) {
        const isMe = row.id === store.profile.id;
        const scoreTxt = type === 'weekly' ? `+${fmt(row.weekly)} 🏆` : `${fmt(row.trophies)} 🏆`;
        list.appendChild(el('div', { class: `lb-row ${isMe || row.me ? 'me' : ''}` },
          el('div', { class: 'lb-rank' }, row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : fmt(row.rank)),
          avatarEl(row.avatar, 36),
          el('div', { style: 'flex:1' },
            el('div', { style: 'font-weight:800;font-size:14px' }, row.username),
            el('div', { class: 'muted', style: 'font-size:11px' }, t('common.level', { n: fmt(row.level) })),
          ),
          el('div', { style: 'font-weight:900' }, scoreTxt),
        ));
      }
    } catch (e) { toast(e.message, 'err'); }
  }
  load();
}

export function friendsScreen(root) {
  root.innerHTML = '';
  const list = el('div', {}, el('div', { class: 'muted' }, t('common.loading')));
  root.appendChild(el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, '👥 ', t('friends.title')),
    el('div', { class: 'h2' }, t('friends.recent')),
    list,
    bottomNav('home'),
  ));
  if (isOffline()) {
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'card center muted' }, '📴 ', t('friends.offline')));
    return;
  }
  api.recent().then(({ players }) => {
    list.innerHTML = '';
    if (!players.length) { list.innerHTML = `<div class="muted center">${t('friends.empty')}</div>`; return; }
    for (const p of players) {
      list.appendChild(el('div', { class: 'lb-row' },
        avatarEl(p.avatar, 38),
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-weight:800;font-size:14px' }, p.username),
          el('div', { class: 'muted', style: 'font-size:11px' }, '🏆 ' + fmt(p.trophies)),
        ),
        el('button', { class: 'btn small ' + (p.following ? 'ghost' : 'teal'), onclick: async (e) => {
          await api.follow(p.id, !p.following); sfx.click(); friendsScreen(root);
        } }, p.following ? t('friends.following') : t('friends.follow')),
        el('button', { class: 'btn small ghost', onclick: async () => {
          await api.block(p.id, true); toast(t('common.ok')); friendsScreen(root);
        } }, '🚫'),
        el('button', { class: 'btn small ghost', onclick: async () => {
          await api.report(p.id, 'manual'); toast(t('friends.reported'), 'ok');
        } }, '⚠️'),
      ));
    }
  }).catch((e) => toast(e.message, 'err'));
}

export function settingsScreen(root) {
  root.innerHTML = '';
  const vols = getVolumes();
  const musicRange = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(vols.music) });
  const sfxRange = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(vols.sfx) });
  musicRange.addEventListener('input', () => { setVolumes({ music: parseFloat(musicRange.value) }); if (parseFloat(musicRange.value) > 0) startMusic(); });
  sfxRange.addEventListener('input', () => { setVolumes({ sfx: parseFloat(sfxRange.value) }); sfx.click(); });

  const langSel = el('select', { class: 'field', onchange: async (e) => {
    setLang(e.target.value);
    await api.updateMe({ settings: { lang: e.target.value } }).catch(() => {});
    location.reload();
  } },
    el('option', { value: 'fa', selected: getLang() === 'fa' || undefined }, 'فارسی'),
    el('option', { value: 'en', selected: getLang() === 'en' || undefined }, 'English'),
  );

  const offlineToggle = el('input', { type: 'checkbox', ...(isOffline() ? { checked: true } : {}) });
  offlineToggle.style.width = '22px'; offlineToggle.style.height = '22px'; offlineToggle.style.accentColor = 'var(--accent)';
  offlineToggle.addEventListener('change', () => {
    setForceOffline(offlineToggle.checked);
    location.reload();
  });

  root.appendChild(el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, '⚙️ ', t('settings.title')),
    el('div', { class: 'card' },
      el('div', { class: 'spread' },
        el('div', {},
          el('div', { style: 'font-weight:800' }, '📴 ', t('settings.offlineMode')),
          el('div', { class: 'muted', style: 'font-size:12px' }, t('settings.offlineHint')),
        ),
        offlineToggle,
      ),
      el('div', { class: 'divider' }),
      el('label', { class: 'lbl' }, t('settings.lang')), langSel,
      el('label', { class: 'lbl' }, '🎵 ' + t('settings.music')), musicRange,
      el('label', { class: 'lbl' }, '🔊 ' + t('settings.sfx')), sfxRange,
    ),
    el('div', { class: 'card' },
      el('div', { class: 'h2' }, t('settings.about')),
      el('div', { class: 'muted' }, t('app.name') + ' · ' + t('app.tag')),
      el('div', { class: 'muted' }, t('settings.version') + ' 0.1.0 (MVP)'),
      el('button', { class: 'btn small ghost mt', onclick: () => { localStorage.setItem('bk_tut_done', ''); location.hash = '#home'; } }, t('settings.replayTut')),
    ),
    bottomNav('home'),
  ));
}

async function refreshProfile() {
  try { const r = await api.me(); store.profile = r.profile; store.daily = r.daily; } catch {}
}
