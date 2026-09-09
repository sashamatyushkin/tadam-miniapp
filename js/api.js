// ── Клиент backend API ─────────────────────────────────────────────
// Прогрессивное улучшение: если API_BASE пуст или сервер недоступен,
// все функции тихо возвращают null — вызывающий код падает обратно
// на локальное поведение (как было до backend). Никто, кто просто открыл
// GitHub Pages без запущенного сервера, ничего не замечает и не теряет.
import { API_BASE } from './config.js?v=2609091241';
import { tg } from './tg.js?v=2609091241';

const TIMEOUT_MS = 4000;

export const apiAvailable = () => !!API_BASE;

async function call(method, path, body) {
  if (!API_BASE) return null;
  const initData = tg.initData();
  if (!initData && !path.startsWith('/api/wishlist/')) return null; // публичные GET вишлиста — исключение
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(initData ? { Authorization: 'tma ' + initData } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok && res.status !== 409) return null; // 409 (спин отклонён) — тоже валидный ответ, разбираем ниже
    return await res.json();
  } catch (e) {
    clearTimeout(t);
    return null; // сеть недоступна/сервер не поднят — не ошибка приложения, просто офлайн-режим
  }
}

export const api = {
  auth: () => call('POST', '/api/auth'),
  access: () => call('GET', '/api/access'),
  grantTest: productId => call('POST', '/api/access/grant-test', { productId }),

  spin: idempotencyKey => call('POST', '/api/wheel/spin', { idempotencyKey }),
  spinsAvailable: () => call('GET', '/api/wheel/available'),

  datesList: () => call('GET', '/api/dates'),
  dateCreate: d => call('POST', '/api/dates', d),
  dateDelete: id => call('DELETE', '/api/dates/' + id),

  wishlistSync: (token, title, items) => call('POST', '/api/wishlist/sync', { token, title, items }),
  wishlistRevoke: token => call('POST', '/api/wishlist/revoke', { token }),
  wishlistPublic: token => call('GET', '/api/wishlist/' + token) // без auth — публичная ссылка получателя
};
