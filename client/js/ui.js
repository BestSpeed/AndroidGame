// کامپوننت‌های مشترک رابط کاربری
import { t } from './i18n.js';
import { fmt } from './i18n.js';
import { sfx } from './audio.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function avatarEl(avatar, sizePx = 48) {
  const a = el('span', { class: `avatar ${avatar?.frame ? 'frame-' + avatar.frame : ''}` });
  a.style.width = a.style.height = sizePx + 'px';
  a.style.fontSize = Math.round(sizePx * 0.52) + 'px';
  const bgs = ['#3a2573', '#7a3b52', '#2b5f7a', '#5f7a2b', '#7a5a2b', '#52377a', '#377a68', '#7a372b', '#444466', '#553355', '#2f6644', '#663322'];
  a.style.background = bgs[(avatar?.bg ?? 0) % bgs.length];
  a.textContent = avatar?.emoji || '🙂';
  return a;
}

export function topbar(profile) {
  return el('div', { class: 'topbar' },
    el('div', { class: 'wallet' },
      el('span', { class: 'chip' }, '🪙 ', fmt(profile.coins)),
      el('span', { class: 'chip gem' }, '💎 ', fmt(profile.gems)),
    ),
    el('button', { class: 'chip', style: 'cursor:pointer', onclick: () => location.hash = '#settings' }, '⚙️'),
  );
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const node = el('div', { class: `toast ${kind}` }, msg);
  root.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; node.style.transition = 'opacity .3s'; }, 2200);
  setTimeout(() => node.remove(), 2600);
}

export function modal(contentNode, { onClose } = {}) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: 'modal' }, contentNode);
  back.appendChild(box);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  function close() { back.remove(); onClose?.(); }
  back._close = close;
  document.body.appendChild(back);
  return back;
}

export function bottomNav(active) {
  const items = [
    { id: 'home', ic: '🏠', label: t('nav.home'), href: '#home' },
    { id: 'play', ic: '🎮', label: t('nav.play'), href: '#play' },
    { id: 'shop', ic: '🛍️', label: t('nav.shop'), href: '#shop' },
    { id: 'profile', ic: '👤', label: t('nav.profile'), href: '#profile' },
  ];
  return el('nav', { id: 'nav' },
    el('div', { class: 'inner' },
      items.map((it) => el('a', {
        class: `nav-item ${active === it.id ? 'active' : ''}`, href: it.href,
        onclick: () => sfx.click(),
      }, el('span', { class: 'ic' }, it.ic), it.label)),
    ),
  );
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = el('textarea', { style: 'position:fixed;opacity:0' });
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
  return Promise.resolve();
}

export function emoteBar(sendFn, phrases = true) {
  const cfgEmotes = ['😂', '😎', '😱', '😭', '🔥', '👏', '🤔'];
  const bar = el('div', { class: 'emote-bar' });
  for (const e of cfgEmotes) bar.appendChild(el('button', { class: 'emote-btn', onclick: () => sendFn(e) }, e));
  if (phrases) {
    for (const p of ['phrase.again', 'phrase.mine', 'phrase.what', 'phrase.luck', 'phrase.gg']) {
      bar.appendChild(el('button', { class: 'emote-btn phrase', onclick: () => sendFn(p) }, t(p)));
    }
  }
  return bar;
}

export function emoteBubble(emote, username) {
  const b = el('div', { class: 'emote-bubble' },
    el('span', { class: 'who' }, username),
    emote.startsWith('phrase.') ? t(emote) : emote);
  b.style.right = (10 + Math.random() * 40) + '%';
  b.style.top = (30 + Math.random() * 30) + '%';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1700);
}

export function showInterstitial(onDone) {
  const box = el('div', { class: 'ad-box' },
    el('div', { class: 'ad-fake' }, '📺'),
    el('div', { style: 'font-weight:800' }, t('ad.interstitial')),
    el('div', { class: 'ad-count' }, t('ad.simulated')),
    el('div', { class: 'ad-count', id: 'ad-timer' }, '3'),
  );
  document.body.appendChild(box);
  let left = 3;
  const timer = setInterval(() => {
    left -= 1;
    const elTimer = document.getElementById('ad-timer');
    if (elTimer) elTimer.textContent = String(left);
    if (left <= 0) { clearInterval(timer); box.remove(); onDone?.(); }
  }, 1000);
}

export function showRewardedAd(onDone) {
  const box = el('div', { class: 'ad-box' },
    el('div', { class: 'ad-fake' }, '🎬'),
    el('div', { style: 'font-weight:800' }, t('result.ad.watch')),
    el('div', { class: 'ad-count' }, t('ad.simulated')),
    el('div', { class: 'ad-count', id: 'rad-timer' }, '5'),
  );
  document.body.appendChild(box);
  let left = 5;
  const timer = setInterval(() => {
    left -= 1;
    const elTimer = document.getElementById('rad-timer');
    if (elTimer) elTimer.textContent = String(left);
    if (left <= 0) { clearInterval(timer); box.remove(); onDone?.(); }
  }, 1000);
}
