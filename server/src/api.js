'use strict';
// REST API — لایه غیربلادرینگ (پروفایل، فروشگاه، خرید، لیدربرد، …)
const express = require('express');
const { env, configs, clientConfig } = require('./config');
const auth = require('./auth');
const economy = require('./economy');
const shop = require('./shop');
const iap = require('./iap');
const ads = require('./ads');
const leaderboard = require('./leaderboard');
const social = require('./social');
const daily = require('./dailyChallenge');
const { trackBatch, track, summary } = require('./analytics');

function authed(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '') || req.query.token;
  const user = auth.userByToken(token);
  if (!user) return res.status(401).json({ ok: false, code: 'unauthorized', msg: 'نشست معتبر نیست؛ دوباره وارد شوید.' });
  req.user = user;
  next();
}

function build(hub) {
  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use((err, req, res, next) => { // مدیریت خطای مهربان با کاربر (بند ۴۷)
    console.error('[api]', err.message);
    res.status(400).json({ ok: false, code: 'bad_request', msg: 'درخواست نامعتبر بود.' });
  });

  // ── احراز هویت و پروفایل ──
  api.post('/auth/guest', (req, res) => {
    const { token, user } = auth.guestLogin();
    res.json({ ok: true, token, profile: publicProfile(user) });
  });

  api.get('/me', authed, (req, res) => {
    res.json({ ok: true, profile: publicProfile(req.user), daily: daily.status(req.user.id) });
  });

  api.patch('/me', authed, (req, res) => {
    const u = req.user;
    const b = req.body || {};
    if (typeof b.username === 'string' && b.username.trim().length >= 2) u.username = auth.sanitizeUsername(b.username);
    if (b.avatar && typeof b.avatar === 'object') {
      if (typeof b.avatar.emoji === 'string') u.avatar.emoji = b.avatar.emoji.slice(0, 8);
      if (Number.isInteger(b.avatar.bg)) u.avatar.bg = Math.max(0, Math.min(11, b.avatar.bg));
    }
    if (b.settings && typeof b.settings === 'object') {
      if (['fa', 'en'].includes(b.settings.lang)) u.settings.lang = b.settings.lang;
      if (typeof b.settings.music === 'number') u.settings.music = Math.max(0, Math.min(1, b.settings.music));
      if (typeof b.settings.sfx === 'number') u.settings.sfx = Math.max(0, Math.min(1, b.settings.sfx));
    }
    if (b.tutorialComplete === true && !u.tutorialComplete) {
      u.tutorialComplete = true;
      economy.grant(u.id, { coins: configs.app.tutorial.rewardCoins, xp: configs.app.tutorial.rewardXp }, 'tutorial');
      track(u.id, 'tutorial_complete', {});
    }
    require('./db').store.scheduleSave();
    res.json({ ok: true, profile: publicProfile(u) });
  });

  // ── کانفیگ عمومی کلاینت ──
  api.get('/config/client', (req, res) => res.json({ ok: true, config: clientConfig(), env: env.SERVER_ENV }));

  // ── فروشگاه ──
  api.get('/shop', authed, (req, res) => {
    track(req.user.id, 'shop_open', {});
    res.json({ ok: true, items: shop.catalog(), owned: shop.ownedItems(req.user.id) });
  });
  api.post('/shop/buy', authed, (req, res) => {
    const r = shop.buy(req.user.id, String((req.body || {}).itemId || ''));
    if (!r.ok) return res.status(400).json({ ok: false, code: r.code, msg: msgFor(r.code) });
    res.json({ ok: true, profile: publicProfile(req.user) });
  });
  api.post('/shop/equip', authed, (req, res) => {
    const r = shop.equip(req.user.id, String((req.body || {}).itemId || ''));
    if (!r.ok) return res.status(400).json({ ok: false, code: r.code, msg: msgFor(r.code) });
    res.json({ ok: true, profile: publicProfile(req.user) });
  });

  // ── خرید درون‌برنامه‌ای (معماری) ──
  api.post('/iap/start', authed, async (req, res) => {
    const r = await iap.start(req.user.id, String((req.body || {}).itemId || ''));
    if (!r.ok) return res.status(400).json({ ok: false, code: r.code, msg: msgFor(r.code) });
    res.json({ ok: true, orderId: r.orderId });
  });
  api.post('/iap/mock-complete', authed, async (req, res) => {
    const r = await iap.complete(req.user.id, String((req.body || {}).orderId || ''));
    if (!r.ok) return res.status(400).json({ ok: false, code: r.code, msg: msgFor(r.code) });
    res.json({ ok: true, profile: publicProfile(req.user) });
  });

  // ── تبلیغ تشویقی ──
  api.post('/ads/rewarded/complete', authed, (req, res) => {
    const r = ads.completeRewarded(req.user.id, String((req.body || {}).nonce || ''));
    if (!r.ok) return res.status(400).json({ ok: false, code: r.code, msg: msgFor(r.code) });
    res.json({ ok: true, extraCoins: r.extraCoins, profile: publicProfile(req.user) });
  });

  // ── لیدربرد ──
  api.get('/leaderboard', authed, (req, res) => {
    const type = req.query.type || 'global';
    if (type === 'weekly') return res.json({ ok: true, type, ...leaderboard.weeklyBoard(req.user.id) });
    if (type === 'friends') return res.json({ ok: true, type, list: leaderboard.friendsBoard(req.user.id) });
    res.json({ ok: true, type, list: leaderboard.globalBoard() });
  });

  // ── اجتماعی ──
  api.get('/social/recent', authed, (req, res) => {
    res.json({ ok: true, players: social.recentPlayers(req.user.id) });
  });
  api.post('/social/follow', authed, (req, res) => {
    const r = social.setFollow(req.user.id, String((req.body || {}).userId || ''), !!(req.body || {}).follow);
    res.json(r.ok ? { ok: true } : { ok: false, code: r.code });
  });
  api.post('/social/block', authed, (req, res) => {
    const r = social.setBlock(req.user.id, String((req.body || {}).userId || ''), !!(req.body || {}).block);
    res.json(r.ok ? { ok: true } : { ok: false, code: r.code });
  });
  api.post('/social/report', authed, (req, res) => {
    social.report(req.user.id, String((req.body || {}).userId || ''), (req.body || {}).reason);
    res.json({ ok: true });
  });

  // ── چالش روز ──
  api.get('/daily', authed, (req, res) => res.json({ ok: true, daily: daily.status(req.user.id) }));
  api.post('/daily/start', authed, (req, res) => {
    const r = daily.startRun(req.user.id, hub);
    if (!r.ok) return res.status(400).json({ ok: false, code: r.code, msg: msgFor(r.code) });
    hub.startDailyRun(req.user);
    res.json({ ok: true });
  });

  // ── آنالیتیکس ──
  api.post('/events', authed, (req, res) => {
    const n = trackBatch(req.user.id, (req.body || {}).events);
    res.json({ ok: true, accepted: n });
  });

  if (env.SERVER_ENV === 'development') {
    api.get('/analytics/summary', (req, res) => res.json({ ok: true, ...summary() }));
  }

  return api;
}

function publicProfile(u) {
  return {
    id: u.id, username: u.username, avatar: u.avatar, level: u.level, xp: u.xp,
    xpNext: economy.xpForLevel(u.level + 1),
    coins: u.coins, gems: u.gems, trophies: u.trophies,
    stats: u.stats, tutorialComplete: u.tutorialComplete, settings: u.settings,
    equipped: u.equipped, createdAt: u.createdAt,
  };
}

function msgFor(code) {
  const map = {
    not_enough_coins: 'سکه کافی نداری!',
    not_enough_gems: 'جم کافی نداری!',
    already_owned: 'این آیتم را داری.',
    item_not_found: 'آیتم پیدا نشد.',
    use_iap: 'این بسته از مسیر خرید درون‌برنامه‌ای است.',
    bad_order: 'سفارش معتبر نیست.',
    daily_cap: 'سهمیه امروز تبلیغ تمام شد.',
    cooldown: 'کمی صبر کن، بعد دوباره.',
    no_attempts: 'تلاش‌های امروز چالش تمام شد.',
    bad_nonce: 'این پاداش قبلاً گرفته شده.',
    unauthorized: 'نشست معتبر نیست.',
  };
  return map[code] || 'خطا رخ داد؛ دوباره تلاش کن.';
}

module.exports = { build, authed, publicProfile };
