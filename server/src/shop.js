'use strict';
// فروشگاه Data-Driven — بند ۲۷. آیتم‌ها فقط تزئینی‌اند (بند ۱۴).
const { configs } = require('./config');
const { store } = require('./db');
const { ids } = require('./ids');
const economy = require('./economy');

function catalog() { return configs.shop.items; }

function ownedItems(userId) {
  return Object.values(store.col.inventory).filter((i) => i.userId === userId).map((i) => i.itemId);
}

function buy(userId, itemId) {
  const item = configs.shop.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, code: 'item_not_found' };
  if (item.currency === 'iap') return { ok: false, code: 'use_iap' }; // بسته‌های پولی از مسیر خرید می‌روند
  if (ownedItems(userId).includes(itemId)) return { ok: false, code: 'already_owned' };

  const cost = item.currency === 'gems' ? { coins: 0, gems: item.price } : { coins: item.price, gems: 0 };
  const res = economy.spend(userId, cost, `shop:${itemId}`);
  if (!res.ok) return res;

  store.col.inventory[ids.inventory()] = { userId, itemId, acquiredAt: Date.now(), source: 'shop' };
  if (item.type === 'pack' && item.amount) {
    economy.grant(userId, item.asset === 'gems' ? { gems: item.amount } : { coins: item.amount }, `pack:${itemId}`);
  }
  store.scheduleSave();
  return { ok: true, item };
}

function equip(userId, itemId) {
  const item = configs.shop.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, code: 'item_not_found' };
  if (!ownedItems(userId).includes(itemId)) return { ok: false, code: 'not_owned' };
  const u = store.col.users[userId];
  if (!u) return { ok: false, code: 'no_user' };
  if (item.type === 'avatar') u.avatar.emoji = item.asset;
  else if (item.type === 'frame') u.avatar.frame = item.asset;
  store.scheduleSave();
  return { ok: true };
}

module.exports = { catalog, buy, equip, ownedItems };
