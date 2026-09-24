// ── Клиент backend API ─────────────────────────────────────────────
// Прогрессивное улучшение: если API_BASE пуст или сервер недоступен,
// все функции тихо возвращают null — вызывающий код падает обратно
// на локальное поведение (как было до backend). Никто, кто просто открыл
// GitHub Pages без запущенного сервера, ничего не замечает и не теряет.
import { API_BASE } from './config.js?v=2609242257';
import { tg } from './tg.js?v=2609242257';

const TIMEOUT_MS = 4000;

export const apiAvailable = () => !!API_BASE;

async function call(method, path, body) {
  if (!API_BASE) return null;
  const initData = tg.initData();
  // Публичные GET без личных данных — вишлист по ссылке и каталог из админки
  const isPublic = path.startsWith('/api/wishlist/') || path.startsWith('/api/content/');
  if (!initData && !isPublic) return null;
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
    if (!res.ok && res.status !== 409 && res.status !== 422) return null; // 409 (спин отклонён) и 422 (приглашение не засчитано) — валидные ответы с причиной
    return await res.json();
  } catch (e) {
    clearTimeout(t);
    return null; // сеть недоступна/сервер не поднят — не ошибка приложения, просто офлайн-режим
  }
}

export const api = {
  auth: startParam => call('POST', '/api/auth', { startParam: startParam || '' }),
  access: () => call('GET', '/api/access'),
  grantTest: productId => call('POST', '/api/access/grant-test', { productId }),

  spin: idempotencyKey => call('POST', '/api/wheel/spin', { idempotencyKey }),
  spinsAvailable: () => call('GET', '/api/wheel/available'),

  datesList: () => call('GET', '/api/dates'),
  dateCreate: d => call('POST', '/api/dates', d),
  dateDelete: id => call('DELETE', '/api/dates/' + id),

  wishlistSync: (token, title, items, dream, shared = true, wlId = '') => call('POST', '/api/wishlist/sync', { token, title, items, dream, shared, wlId }),
  wishlistRevoke: token => call('POST', '/api/wishlist/revoke', { token }),
  wishlistPublic: token => call('GET', '/api/wishlist/' + token), // без auth — публичная ссылка получателя

  profileSave: profile => call('POST', '/api/profile', profile),

  referralRegister: code => call('POST', '/api/referral/register', { code }),
  referralClaim: code => call('POST', '/api/referral/claim', { code }),

  shareInvite: link => call('POST', '/api/share/invite', { link }),

  // Каталог из админки — идеи и сторис, которых нет в статической сборке фронтенда
  contentIdeas: () => call('GET', '/api/content/ideas'),
  contentStories: () => call('GET', '/api/content/stories'),
  contentFriends: () => call('GET', '/api/content/friends'),

  contentWheel: () => call('GET', '/api/content/wheel'),
  friendCodeRedeem: code => call('POST', '/api/friend-code/redeem', { code }),
  consent: (kind, value, version) => call('POST', '/api/consent', { kind, value, version }),

  ugcSubmit: a => call('POST', '/api/ugc', a),
  ugcStatus: () => call('GET', '/api/ugc')
};
