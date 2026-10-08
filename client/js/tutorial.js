// آموزش تعاملی «دست‌به‌کار» — بند ۳۹: سه گام، زیر ۶۰ ثانیه، بدون متن سنگین.
import { t } from './i18n.js';
import { el, toast } from './ui.js';
import { api } from './api.js';
import { store } from './store.js';
import { sfx } from './audio.js';
import { ev } from './analytics.js';

const CARDS = { tap: { mark: '✅', bg: '#2e7d4f' }, hold: { mark: '✋', bg: '#8a2f3a' } };

export function startTutorial(onDone) {
  ev('tutorial_start', {});
  const steps = [
    { text: 'tut.step1', seq: ['tap', 'tap', 'tap'] },
    { text: 'tut.step2', seq: ['hold', 'tap', 'hold'] },
    { text: 'tut.step3', seq: ['tap', 'hold', 'tap'] },
  ];
  let stepIdx = 0, cardIdx = 0, awaiting = false, mistakes = 0;

  const demo = el('div', { class: 'tut-demo' }, '👋');
  const title = el('div', { class: 'h2' }, t('tut.step1'));
  const sub = el('div', { class: 'muted' }, '');
  const skip = el('button', { class: 'btn ghost small', onclick: () => finish(false) }, t('tut.skip'));
  const back = el('div', { class: 'round-intro', style: 'z-index:97' },
    el('div', { class: 'tut-card', style: 'width:min(400px,92vw)' },
      el('div', { class: 'spread' }, el('div', { style: 'font-weight:900' }, '🎓 ' + t('tut.title')), skip),
      title, demo, sub,
    ),
  );
  document.body.appendChild(back);

  let shownAt = 0;
  function showCard(kind) {
    awaiting = true;
    shownAt = Date.now();
    const c = CARDS[kind];
    demo.style.background = c.bg;
    demo.textContent = c.mark;
    sub.textContent = kind === 'tap' ? t('tut.tapNow') : t('tut.holdNow');
  }

  function nextCard() {
    const step = steps[stepIdx];
    if (cardIdx >= step.seq.length) {
      stepIdx += 1; cardIdx = 0;
      if (stepIdx >= steps.length) return finish(true);
      title.textContent = t(steps[stepIdx].text);
      demo.style.background = 'var(--bg2)';
      demo.textContent = '👀';
      sub.textContent = '';
      awaiting = false;
      setTimeout(() => nextCard(), 1200);
      return;
    }
    showCard(step.seq[cardIdx]);
  }

  demo.addEventListener('pointerdown', () => {
    if (!awaiting) return;
    const kind = steps[stepIdx].seq[cardIdx];
    const tapped = true;
    if ((kind === 'tap') === tapped) {
      sfx.ok();
      cardIdx += 1;
      awaiting = false;
      demo.style.background = 'var(--bg2)'; demo.textContent = '✨'; sub.textContent = '';
      setTimeout(() => nextCard(), 450);
    } else {
      mistakes += 1;
      sfx.fail();
      sub.textContent = t('tut.oops');
    }
  });

  // گام ۲ و ۳ نیاز به «نزدن» دارند: اگر ۱.۶ ثانیه روی کارتِ نگه‌داشتن تپ نشود، قبول است
  const holdTimer = setInterval(() => {
    if (!awaiting || Date.now() - shownAt < 1400) return;
    const kind = steps[stepIdx].seq[cardIdx];
    if (kind === 'hold') {
      sfx.ok();
      cardIdx += 1;
      awaiting = false;
      demo.style.background = 'var(--bg2)'; demo.textContent = '✨'; sub.textContent = '';
      setTimeout(() => nextCard(), 450);
    }
  }, 1600);

  async function finish(completed) {
    clearInterval(holdTimer);
    back.remove();
    try {
      const r = await api.updateMe({ tutorialComplete: completed });
      store.profile = r.profile;
      if (completed) {
        toast(t('tut.great'), 'ok');
        sfx.reward();
      }
    } catch {}
    onDone?.();
  }

  title.textContent = t(steps[0].text);
  setTimeout(() => nextCard(), 900);
}
