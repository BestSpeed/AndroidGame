// بوت + روتر + اتصال‌های سراسری
import { t } from './i18n.js';
import { api, getToken } from './api.js';
import { store, boot, loadProfile } from './store.js';
import { connect, on } from './socket.js';
import { setVolumes, startMusic, sfx } from './audio.js';
import { ev, flush } from './analytics.js';
import { loginScreen, homeScreen, playScreen } from './screens/core.js';
import { shopScreen, profileScreen, leaderboardScreen, friendsScreen, settingsScreen } from './screens/meta.js';
import { matchmakingScreen, bindGlobalMatchHandlers } from './screens/match.js';
import { roomScreen } from './screens/room.js';
import { dailyScreen } from './screens/daily.js';
import { startTutorial } from './tutorial.js';
import { toast } from './ui.js';

const ROUTES = {
  home: homeScreen,
  play: playScreen,
  shop: shopScreen,
  profile: profileScreen,
  leaderboard: leaderboardScreen,
  friends: friendsScreen,
  settings: settingsScreen,
  matchmaking: matchmakingScreen,
  room: roomScreen,
  daily: dailyScreen,
};

function route() {
  const hash = (location.hash || '#home').slice(1);
  const fn = ROUTES[hash];
  if (!fn) { location.hash = '#home'; return; }
  document.getElementById('game-screen')?.remove();
  const root = document.getElementById('app');
  if (hash === 'matchmaking') { bindGlobalMatchHandlers(); }
  fn(root);
}

async function enterApp() {
  await loadProfile();
  setVolumes({ music: store.profile.settings.music, sfx: store.profile.settings.sfx });
  document.getElementById('splash').hidden = true;
  const app = document.getElementById('app');
  app.hidden = false;
  window.addEventListener('hashchange', route);
  route();

  // آموزش تعاملی برای ورود اول (بند ۳۹)
  if (!store.profile.tutorialComplete && !localStorage.getItem('bk_tut_done')) {
    setTimeout(() => startTutorial(() => localStorage.setItem('bk_tut_done', '1')), 600);
  }
  startMusic();
  document.body.addEventListener('pointerdown', () => startMusic(), { once: true });
}

async function main() {
  try {
    await boot();
  } catch {
    document.querySelector('.splash-tag').textContent = t('err.offline');
    return;
  }
  bindGlobalMatchHandlers();

  // اگر نشست معتبر داریم، مستقیم وارد شو؛ وگرنه صفحه ورود
  if (getToken()) {
    try {
      connect();
      await enterApp();
      return;
    } catch (e) {
      if (e.code === 'unauthorized') { /* ادامه به صفحه ورود */ }
      else { toast(e.message || t('err.generic'), 'err'); }
    }
  }
  document.getElementById('splash').hidden = true;
  const app = document.getElementById('app');
  app.hidden = false;
  loginScreen(app, async () => {
    await enterApp();
    ev('login', { method: 'guest' });
    flush();
  });
}

main();
