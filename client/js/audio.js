// Audio Manager — بند ۴۰. همه صداها رویه‌ای (WebAudio) و اوریجینال‌اند — بدون فایل کپی‌رایت‌دار.
let ctx = null;
let musicGain = null, sfxGain = null, musicTimer = null;
const settings = {
  music: parseFloat(localStorage.getItem('bk_music') ?? '0.7'),
  sfx: parseFloat(localStorage.getItem('bk_sfx') ?? '0.8'),
};

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    musicGain = ctx.createGain(); sfxGain = ctx.createGain();
    musicGain.connect(ctx.destination); sfxGain.connect(ctx.destination);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function applyVolumes() {
  if (!ctx) return;
  musicGain.gain.value = settings.music * 0.16;
  sfxGain.gain.value = settings.sfx * 0.5;
}

export function setVolumes({ music, sfx }) {
  if (typeof music === 'number') { settings.music = music; localStorage.setItem('bk_music', String(music)); }
  if (typeof sfx === 'number') { settings.sfx = sfx; localStorage.setItem('bk_sfx', String(sfx)); }
  applyVolumes();
  if (settings.music <= 0.01) stopMusic(); else if (musicTimer === null) startMusic();
}
export function getVolumes() { return { ...settings }; }

function tone(freq, dur, type = 'square', vol = 1, delay = 0, dest = sfxGain) {
  if (!ensure()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = ctx.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

export const sfx = {
  click: () => tone(660, 0.06, 'square', 0.5),
  countdown: () => tone(440, 0.12, 'square', 0.6),
  go: () => { tone(660, 0.1, 'square', 0.7); tone(880, 0.18, 'square', 0.7, 0.09); },
  hit: () => tone(180, 0.2, 'sawtooth', 0.8),
  fail: () => { tone(220, 0.18, 'sawtooth', 0.7); tone(160, 0.26, 'sawtooth', 0.7, 0.12); },
  ok: () => tone(920, 0.09, 'triangle', 0.7),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.6, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.2, 'square', 0.5, i * 0.14)),
  coin: () => { tone(1180, 0.07, 'square', 0.5); tone(1560, 0.12, 'square', 0.5, 0.06); },
  reward: () => [660, 880, 990, 1320].forEach((f, i) => tone(f, 0.1, 'triangle', 0.6, i * 0.07)),
  rankup: () => [523, 659, 784, 880, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'square', 0.55, i * 0.08)),
  eat: () => tone(760, 0.06, 'square', 0.55),
  boost: () => tone(300, 0.25, 'sawtooth', 0.35),
};

// موسیقی: لوپ آرکید ساده و اوریجینال (آرپژژ) — با قطع/ولوم مستقل
const MELODY = [262, 330, 392, 330, 294, 392, 494, 392];
let step = 0;
export function startMusic() {
  if (settings.music <= 0.01 || musicTimer !== null) return;
  ensure();
  musicTimer = setInterval(() => {
    if (settings.music <= 0.01) return;
    const f = MELODY[step % MELODY.length];
    tone(f, 0.22, 'triangle', 0.8, 0, musicGain);
    if (step % 2 === 0) tone(f / 2, 0.3, 'sine', 0.6, 0, musicGain);
    step++;
  }, 280);
}
export function stopMusic() {
  if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
}
