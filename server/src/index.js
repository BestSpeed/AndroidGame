'use strict';
// نقطه شروع سرور بازی‌خونه — بوت‌استرپ: استاتیک + API + وب‌سوکت
const path = require('path');
const http = require('http');
const express = require('express');
const { env, ROOT } = require('./config');
const api = require('./api');
const { Hub, attach } = require('./socketServer');
const { Matchmaking } = require('./matchmaking');
const { Rooms } = require('./rooms');
const { store } = require('./db');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const hub = new Hub();
hub.matchmaking = new Matchmaking(hub);
hub.rooms = new Rooms(hub);

app.use('/api', api.build(hub));
app.use(express.static(path.join(ROOT, 'client')));
app.get('/healthz', (req, res) => res.json({ ok: true, env: env.SERVER_ENV }));
app.use((req, res) => res.status(404).json({ ok: false, code: 'not_found' }));

const server = http.createServer(app);
attach(server, hub);

server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`🎮 بازی‌خونه | env=${env.SERVER_ENV} | http://0.0.0.0:${env.PORT}`);
});

// ذخیره نهایی هنگام خروج
process.on('SIGTERM', () => { store.scheduleSave(); setTimeout(() => process.exit(0), 400); });

// هیچ خطای داخلی نباید همه مچ‌های فعال را با خود بکشد — ثبت و ادامه
process.on('uncaughtException', (e) => console.error('[uncaught]', e));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
