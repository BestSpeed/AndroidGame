// اتاق خصوصی — بند ۱۶: ساخت/پیوستن با کد، آماده، شروع، کپی کد
import { t, fmt } from '../i18n.js';
import { el, avatarEl, topbar, toast, bottomNav, copyText } from '../ui.js';
import { send, on } from '../socket.js';
import { store } from '../store.js';
import { sfx } from '../audio.js';
import { ev } from '../analytics.js';

export function roomScreen(root) {
  root.innerHTML = '';
  const codeInput = el('input', { class: 'code-input', maxlength: '6', inputmode: 'numeric', placeholder: '______' });
  let unbind = null;

  const panel = el('div', { class: 'screen' },
    topbar(store.profile),
    el('div', { class: 'h1' }, '🚪 ', t('room.title')),
    el('div', { class: 'card' },
      el('button', { class: 'btn primary block', onclick: () => { sfx.go(); send('room.create', { fillBots: true }); } }, '➕ ', t('room.create')),
      el('div', { class: 'muted center mt' }, t('room.fillBots') + ' ✅'),
    ),
    el('div', { class: 'card center' },
      el('div', { class: 'h2' }, t('room.join')),
      codeInput,
      el('button', { class: 'btn teal block mt', onclick: () => {
        const code = codeInput.value.trim();
        if (code.length === 6) { sfx.click(); send('room.join', { code }); }
      } }, t('room.join')),
    ),
    el('button', { class: 'btn ghost block mt', onclick: () => location.hash = '#play' }, t('common.cancel')),
    bottomNav('play'),
  );
  root.appendChild(panel);

  unbind = on('room.state', (room) => renderLobby(room));
  on('room.left', () => { /* بازگشت به پنل در ناوبری بعدی */ });
}

function renderLobby(room) {
  const root = document.getElementById('app');
  root.innerHTML = '';
  const isHost = room.hostId === store.profile.id;
  let myReady = false;
  const meP = room.players.find((p) => p.id === store.profile.id);
  myReady = !!meP?.ready;

  const seats = el('div', { class: 'lobby-grid' });
  for (const p of room.players) {
    seats.appendChild(el('div', { class: `seat filled ${p.id === store.profile.id ? 'me' : ''} ${p.ready ? 'ready' : ''}` },
      avatarEl(p.avatar, 40),
      el('span', { class: 'nm' }, p.username),
      p.id === room.hostId ? el('span', { class: 'muted', style: 'font-size:9.5px' }, '👑 ' + t('room.host')) : null,
      p.ready ? el('span', { style: 'color:var(--ok);font-size:12px' }, '✓') : null,
    ));
  }
  for (let i = room.players.length; i < room.max; i++) {
    seats.appendChild(el('div', { class: 'seat' }, el('span', { class: 'muted' }, '…')));
  }

  const readyBtn = el('button', { class: `btn block ${myReady ? 'ghost' : 'teal'}`, onclick: () => { sfx.click(); send('room.ready', { ready: !myReady }); } },
    myReady ? t('room.notReady') : '✅ ' + t('room.ready'));
  const startBtn = isHost ? el('button', { class: 'btn primary block mt', onclick: () => { sfx.go(); send('room.start'); } }, '🎮 ' + t('room.start')) : null;

  root.appendChild(el('div', { class: 'screen' },
    el('div', { class: 'h1' }, '🚪 ', t('room.title')),
    el('div', { class: 'muted center' }, t('room.share')),
    el('div', { class: 'room-code' }, room.code),
    el('button', { class: 'btn small block', onclick: async () => { await copyText(room.code); toast(t('room.copied'), 'ok'); ev('friend_invite', { channel: 'copy_code' }); } }, '📋 ', t('room.copy')),
    el('div', { class: 'mt' }, seats),
    el('div', { class: 'mt' }, readyBtn),
    startBtn,
    el('button', { class: 'btn ghost block mt', onclick: () => { send('room.leave'); location.hash = '#play'; } }, t('room.leave')),
  ));
}
