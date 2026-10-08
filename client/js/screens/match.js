// جریان مچ: مچ‌میکینگ، لابی، راوندها، نتایج، ریمچ — هدف: ریمچ در ≤۲ تپ (بند ۲۳)
import { t, fmt } from '../i18n.js';
import { el, avatarEl, toast, emoteBar, emoteBubble, showInterstitial, showRewardedAd, copyText } from '../ui.js';
import { send, on } from '../socket.js';
import { api, isOffline } from '../api.js';
import { store } from '../store.js';
import { sfx } from '../audio.js';
import { ev } from '../analytics.js';
import { createReactionView } from '../games/reactionView.js';
import { createSnakeView } from '../games/snakeView.js';
import { createRaceView } from '../games/raceView.js';

const VIEWS = { ReactionGame: createReactionView, SnakeArena: createSnakeView, StreetRace: createRaceView };
const ICONS = { ReactionGame: '⚡', SnakeArena: '🐍', StreetRace: '🏎️' };
const HINTS = { ReactionGame: 'tut.step3', SnakeArena: 'game.snake.hint', StreetRace: 'game.race.hint' };

let flow = null; // وضعیت جاری مچ در کلاینت
let view = null; // ویو مینی‌گیم فعال
let bound = false;

function me() { return store.profile; }

export function bindGlobalMatchHandlers() {
  if (bound) return;
  bound = true;
  on('match.found', (m) => onMatchFound(m));
  on('round.start', (m) => onRoundStart(m));
  on('round.end', (m) => onRoundEnd(m));
  on('match.end', (m) => onMatchEnd(m));
  on('resume', (m) => onResume(m));
  on('rematch.update', (m) => onRematchUpdate(m));
  on('emote', (m) => {
    if (!flow) return;
    const p = flow.players.find((x) => x.id === m.from);
    emoteBubble(String(m.emote), p?.username || '');
  });
  on('error', (m) => toast(m.msg === 'room' ? t('offline.roomUnavailable') : (m.msg || t('err.generic')), 'err'));
  on('*', (type, msg) => {
    // رویدادهای گیم‌پلی به ویو فعال می‌رسند
    if (view && (type.startsWith('card.') || type.startsWith('rule.') || type.startsWith('s.') || type.startsWith('r.') || type === 'walls' || type === 'sudden')) {
      view.handle(type, msg);
    }
  });
}

// ── مچ‌میکینگ ─────────────────────────────────────────────
export function matchmakingScreen(root) {
  root.innerHTML = '';
  send('queue.join');
  let cancelled = false;
  const status = el('div', { class: 'muted center' }, '');
  const cancel = el('button', { class: 'btn ghost block mt', onclick: () => { cancelled = true; send('queue.leave'); location.hash = '#play'; } }, t('mm.cancel'));
  root.appendChild(el('div', { class: 'screen no-nav', style: 'justify-content:center' },
    el('div', { class: 'radar' }, '🎮'),
    el('div', { class: 'h1 center' }, t('mm.searching')),
    status,
    el('div', { class: 'muted center mt' }, t('mm.foundSoon')),
    cancel,
  ));
  const off = on('queue.status', (m) => { status.textContent = `${fmt(m.pos)} · ${fmt(m.est)}s`; });
  const iv = setInterval(() => { if (!document.body.contains(status)) { clearInterval(iv); off(); if (!cancelled) send('queue.leave'); } }, 1000);
}

// ── لابی / شروع مچ ─────────────────────────────────────────
function onMatchFound(m) {
  flow = { matchId: m.matchId, players: m.players, rounds: m.rounds, roundIndex: -1, results: null, mode: m.mode };
  const root = document.getElementById('app');
  root.innerHTML = '';
  const seats = el('div', { class: 'lobby-grid' });
  for (const p of m.players) {
    seats.appendChild(el('div', { class: `seat filled ${p.id === me().id ? 'me' : ''} ${p.isBot ? 'bot' : ''}` },
      avatarEl(p.avatar, 40),
      el('span', { class: 'nm' }, p.username),
      p.isBot ? el('span', { class: 'muted', style: 'font-size:9.5px' }, t('common.bot')) : null,
    ));
  }
  root.appendChild(el('div', { class: 'screen no-nav', style: 'justify-content:center' },
    el('div', { class: 'h1 center' }, '🎉 ', t('lobby.found')),
    seats,
    el('div', { class: 'muted center mt' }, t('lobby.starting')),
  ));
  sfx.go();
}

// ── شروع راوند ─────────────────────────────────────────
function onRoundStart(m) {
  if (!flow) return;
  flow.roundIndex = m.i;
  flow.gameId = m.gameId;
  flow.cfg = m.cfg;
  const root = document.getElementById('app');
  root.innerHTML = '';

  // اینترو: نام بازی + راهنما + شمارش معکوس
  let count = 3;
  const cd = el('div', { class: 'countdown' }, fmt(count));
  root.appendChild(el('div', { class: 'round-intro' },
    el('div', { style: 'font-size:60px' }, ICONS[m.gameId] || '🎮'),
    el('div', { class: 'big' }, t(`game.name.${m.gameId}`)),
    el('div', { class: 'muted' }, t('round.start', { n: fmt(m.i + 1) }) + ' · ' + t('lobby.round', { n: fmt(m.i + 1), t: fmt(flow.rounds.length) })),
    el('div', { class: 'muted', style: 'max-width:300px' }, t(HINTS[m.gameId] || '')),
    cd,
  ));
  sfx.countdown();
  const iv = setInterval(() => {
    count -= 1;
    if (count > 0) { cd.textContent = fmt(count); cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = ''; sfx.countdown(); }
    else { clearInterval(iv); sfx.go(); mountGame(); }
  }, 1000);

  function mountGame() {
    const screen = el('div', { id: 'game-screen' });
    document.body.appendChild(screen);
    const players = flow.players;
    view = VIEWS[m.gameId](screen, {
      players, meId: me().id, cfg: m.cfg, durationSec: m.durationSec,
      round: m.i, totalRounds: flow.rounds.length,
    });
    screen.appendChild(emoteBar((emote) => send('emote', { emote })));
    ev('minigame_start', { game: m.gameId, round: m.i });
  }
}

// ── نتیجه راوند ─────────────────────────────────────────
function onRoundEnd(m) {
  ev('minigame_finish', { game: m.gameId, round: m.i });
  const rows = m.standings.map((s) => {
    const p = flow.players.find((x) => x.id === s.id);
    const isMe = s.id === me().id;
    const cut = typeof m.cut === 'number' && s.rank >= m.cut;
    return el('div', { class: `stand-row ${isMe ? 'me' : ''} ${cut ? 'cut' : ''}` },
      el('span', { class: 'rk' }, fmt(s.rank + 1)),
      avatarEl(p?.avatar, 26),
      el('span', { style: 'flex:1;font-weight:700' }, p?.username || '?'),
      el('span', { class: 'muted' }, fmt(s.round)),
      el('span', { style: 'font-weight:900;color:var(--accent2)' }, fmt(s.total)),
    );
  });
  const overlay = el('div', { class: 'round-intro', id: 'round-result-overlay' },
    el('div', { class: 'big' }, t('round.result', { n: fmt(m.i + 1) })),
    el('div', { class: 'standings', style: 'width:min(400px,92vw)' }, rows),
    typeof m.cut === 'number' ? el('div', { class: 'muted mt' }, t('round.cutline')) : null,
  );
  document.body.appendChild(overlay);
  sfx.coin();
}

function closeRoundOverlay() {
  document.getElementById('round-result-overlay')?.remove();
}

// ── نتیجه نهایی ─────────────────────────────────────────
function onMatchEnd(m) {
  closeRoundOverlay();
  if (view) { view.destroy(); view = null; }
  document.getElementById('game-screen')?.remove();
  if (!flow) return;
  const myResult = m.results[me().id];
  if (myResult) flow.results = myResult;
  flow.standings = m.standings;
  ev('match_finish', { match_id: flow.matchId });
  showFinalResult();
}

function showFinalResult() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  const res = flow.results;
  const rank = res ? res.rank : 0;
  const medals = ['🥇', '🥈', '🥉'];
  const title = rank === 0 ? t('result.rank1') : rank === 1 ? t('result.rank2') : rank === 2 ? t('result.rank3') : t('result.rankN', { n: fmt(rank + 1) });

  if (rank === 0) sfx.win(); else sfx.lose();

  const standings = flow.standings.map((s) => {
    const p = flow.players.find((x) => x.id === s.id);
    return el('div', { class: `stand-row ${s.id === me().id ? 'me' : ''}` },
      el('span', { class: 'rk' }, fmt(s.rank + 1)),
      avatarEl(p?.avatar, 26),
      el('span', { style: 'flex:1;font-weight:700' }, p?.username || '?'),
      p?.isBot ? el('span', { class: 'muted', style: 'font-size:10px' }, t('common.bot')) : null,
      el('span', { style: 'font-weight:900' }, fmt(s.total)),
    );
  });

  const rematchBtn = el('button', { class: 'btn primary block cta-play', onclick: () => {
    ev('rematch_click', {});
    sfx.go();
    send('rematch');
    rematchBtn.disabled = true;
    rematchBtn.textContent = t('result.waiting');
  } }, '🔁 ', t('result.rematch'));

  const inviteBtn = el('button', { class: 'btn block', onclick: () => inviteFriends() }, '👥 ', t('result.invite'));
  const homeBtn = el('button', { class: 'btn ghost block', onclick: () => { flow = null; location.hash = '#home'; refreshWallet(); } }, t('result.home'));

  const children = [
    el('div', { class: 'result-hero' },
      el('div', { class: 'rank' }, medals[rank] || '🎖️'),
      el('div', { class: 'title' }, title),
      el('div', { class: 'muted' }, t('result.best') + ': ' + fmt(res?.best || 0)),
    ),
  ];

  if (res) {
    children.push(el('div', { class: 'card' },
      el('div', { class: 'reward-line' }, el('span', {}, '⭐ ' + t('result.xp')), el('span', { class: 'val' }, '+' + fmt(res.rewards.xp))),
      el('div', { class: 'reward-line' }, el('span', {}, '🪙 ' + t('result.coins')), el('span', { class: 'val' }, '+' + fmt(res.rewards.coins))),
      el('div', { class: 'reward-line', style: 'border:none' }, el('span', {}, '🏆 ' + t('result.trophies')), el('span', { class: 'val' }, (res.rewards.trophies >= 0 ? '+' : '') + fmt(res.rewards.trophies))),
      res.rewards.levelUp ? el('div', { class: 'center', style: 'color:var(--lime);font-weight:900' }, t('result.levelup'), ' — ', t('common.level', { n: fmt(res.rewards.level) })) : null,
    ));

    // پیشنهاد تبلیغ تشویقی — اختیاری (بند ۱۵)
    if (res.adOffer) {
      const adBtn = el('button', { class: 'btn gold block', onclick: () => {
        ev('ad_offer', { context: 'double_coins' });
        showRewardedAd(async () => {
          try {
            const r = await api.adComplete(res.adOffer.nonce);
            toast(t('result.ad.done', { n: fmt(r.extraCoins) }), 'ok');
            sfx.reward();
            adBtn.remove();
            await refreshWallet();
          } catch (e) { toast(e.message, 'err'); }
        });
      } }, `📺 ${t('result.ad.double')} (🪙×${res.adOffer.multiplier})`);
      children.push(adBtn);
    }
  }

  children.push(
    el('div', { class: 'card' }, el('div', { class: 'standings' }, standings)),
    el('div', { style: 'height:10px' }),
    rematchBtn,
    el('div', { class: 'row mt' }, inviteBtn, homeBtn),
  );

  // چالش روز: نمایش نتیجه هدف
  if (flow.mode === 'solo' && store.dailyTarget) {
    const my = flow.standings.find((s) => s.id === me().id);
    const passed = (my?.total || 0) >= store.dailyTarget;
    children.unshift(el('div', { class: 'card center', style: passed ? 'border-color:var(--ok)' : '' },
      el('div', { style: 'font-weight:900;font-size:18px' }, passed ? t('daily.passed') : t('daily.missed', { n: fmt(my?.total || 0) })),
      el('div', { class: 'muted' }, t('daily.target', { n: fmt(store.dailyTarget) })),
    ));
  }

  root.appendChild(el('div', { class: 'screen no-nav', style: 'padding-top:20px' }, ...children));

  // بین‌صفحه‌ای فقط در نقطه امن (بند ۱۵) — شبیه‌سازی‌شده
  if (res?.interstitial) {
    setTimeout(() => showInterstitial(() => {}), 800);
  }
  refreshWallet();
}

function onRematchUpdate(m) {
  // اگر به اندازه کافی آماده شوند، سرور مچ جدید را می‌سازد و match.found می‌آید
}

function onResume(m) {
  // اتصال مجدد: بازسازی وضعیت و پرش به گیم‌پلی فعال
  flow = { matchId: m.matchId, players: m.players, rounds: m.rounds, roundIndex: m.roundIndex, mode: 'resume' };
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.appendChild(el('div', { class: 'screen no-nav', style: 'justify-content:center' },
    el('div', { class: 'h1 center' }, t('conn.back')),
    el('div', { class: 'muted center' }, t('lobby.starting')),
  ));
  if (m.phase === 'play' && m.gameId && VIEWS[m.gameId]) {
    document.getElementById('game-screen')?.remove();
    const screen = el('div', { id: 'game-screen' });
    document.body.appendChild(screen);
    view = VIEWS[m.gameId](screen, {
      players: m.players, meId: me().id, cfg: store.config?.games?.[m.gameId] || {},
      durationSec: 0, round: m.roundIndex, totalRounds: m.rounds.length, resumeSnapshot: m.gameSnapshot,
    });
  }
}

async function inviteFriends() {
  if (isOffline()) return toast(t('offline.roomUnavailable'), 'err');
  ev('friend_invite', { channel: 'share_code' });
  send('room.create', { fillBots: true });
  location.hash = '#room';
  toast(t('room.share'));
}

async function refreshWallet() {
  try {
    const r = await api.me();
    store.profile = r.profile;
    store.daily = r.daily;
  } catch {}
}
