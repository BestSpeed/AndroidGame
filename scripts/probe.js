'use strict';
// ردیابی رویدادهای یک مچ برای دیباگ
const WebSocket = require('ws');
const BASE = process.env.SMOKE_BASE || 'http://localhost:8200';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const g = await (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).json();
  const ws = new WebSocket(BASE.replace('http', 'ws') + `/ws?token=${g.token}`);
  let currentGame = null;
  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 's.snapshot') {
      if (!global._lastSnap || Date.now() - global._lastSnap > 2000) console.log(ts(), 'snapshot', m.t, 'snakes:', m.snakes?.filter(s=>s.a).length ?? m.cars?.length);
      global._lastSnap = Date.now();
      return;
    }
    console.log(ts(), m.type, JSON.stringify(m).slice(0, 160));
    if (m.type === 'round.start') currentGame = m.gameId;
    if (m.type === 'match.end') { console.log('DONE'); process.exit(0); }
  });
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'queue.join' })); });
  setInterval(() => {
    if (currentGame === 'ReactionGame') ws.send(JSON.stringify({ type: 'input', data: { t: 'tap', ts: Date.now() } }));
    else if (currentGame === 'SnakeArena') ws.send(JSON.stringify({ type: 'input', data: { t: 'dir', d: 'up' } }));
    else if (currentGame === 'StreetRace') ws.send(JSON.stringify({ type: 'input', data: { t: 'steer', x: 0, boost: false } }));
  }, 400);
  setTimeout(() => { console.log('TIMEOUT — still waiting'); process.exit(2); }, 90000);
}
main();
