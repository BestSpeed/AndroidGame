'use strict';
// معماری خرید درون‌برنامه‌ای — بند ۱۲/۲۸.
// اینترفیس PurchaseProvider: در توسعه MockProvider فعال است؛ مسیر گوگل‌پلی (با اعتبارسنجی رسید سمت سرور) در TODO.
const { configs } = require('./config');
const { store } = require('./db');
const { ids } = require('./ids');
const economy = require('./economy');
const { track } = require('./analytics');

const orders = new Map(); // orderId -> {userId, itemId, status, createdAt}

const MockProvider = {
  id: 'mock',
  async createOrder(userId, item) {
    const order = { id: ids.purchase(), userId, itemId: item.id, status: 'pending', createdAt: Date.now() };
    orders.set(order.id, order);
    return order;
  },
  // در provider واقعی این مرحله اعتبارسنجی رسید از فروشگاه است — نه اعتماد به کلاینت.
  async verify(orderId) {
    const order = orders.get(orderId);
    return order && order.status === 'pending' ? { ok: true } : { ok: false, code: 'bad_order' };
  },
};

const provider = MockProvider; // TODO: PlayBillingProvider برای پروداکشن

async function start(userId, itemId) {
  const item = configs.shop.items.find((i) => i.id === itemId && i.currency === 'iap');
  if (!item) return { ok: false, code: 'item_not_found' };
  track(userId, 'iap_start', { item: itemId, env: provider.id });
  const order = await provider.createOrder(userId, item);
  store.col.purchases[order.id] = { ...order, price: item.priceIap || {}, status: 'pending' };
  store.scheduleSave();
  return { ok: true, orderId: order.id };
}

async function complete(userId, orderId) {
  const order = orders.get(orderId);
  if (!order || order.userId !== userId) {
    track(userId, 'iap_failed', { order: orderId || '', reason: 'bad_order' });
    return { ok: false, code: 'bad_order' };
  }
  const verify = await provider.verify(orderId);
  if (!verify.ok) {
    track(userId, 'iap_failed', { order: orderId, reason: verify.code });
    return { ok: false, code: verify.code };
  }
  const item = configs.shop.items.find((i) => i.id === order.itemId);
  order.status = 'completed';
  economy.grant(userId, item.asset === 'gems' ? { gems: item.amount } : { coins: item.amount }, `iap:${item.id}`);
  const rec = store.col.purchases[order.id];
  if (rec) rec.status = 'completed';
  store.scheduleSave();
  track(userId, 'iap_success', { item: item.id, amount: item.amount });
  return { ok: true, granted: { item: item.id, amount: item.amount } };
}

module.exports = { start, complete };
