// وضعیت سراسری کلاینت
import { api, setToken } from './api.js';
import { setLang } from './i18n.js';

export const store = {
  profile: null,
  config: null,
  env: 'development',
  currentMatch: null, // داده‌های جاری مچ برای صفحه نتیجه
};

export async function boot() {
  const cfgRes = await api.config();
  store.config = cfgRes.config;
  store.env = cfgRes.env;
  setLang(localStorage.getItem('bk_lang') || store.config.app.defaultLang);
}

export async function loadProfile() {
  const res = await api.me();
  store.profile = res.profile;
  store.daily = res.daily;
  return store.profile;
}

export function logout() {
  setToken(null);
  store.profile = null;
  location.reload();
}
