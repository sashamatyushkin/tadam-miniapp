// ── Точка входа и роутер ─────────────────────────────────────────────
import { tg } from './tg.js?v=2609091228';
import { load, save, state, track, registerReferral, syncAccessFromServer } from './store.js?v=2609091228';
import { api, apiAvailable } from './api.js?v=2609091228';
import { $, closeSheet, sheetOpen } from './ui.js?v=2609091228';

import * as Onboarding from './screens/onboarding.js?v=2609091228';
import * as Home from './screens/home.js?v=2609091228';
import * as Ideas from './screens/ideas.js?v=2609091228';
import * as Wishlist from './screens/wishlist.js?v=2609091228';
import * as Wheel from './screens/wheel.js?v=2609091228';
import * as Profile from './screens/profile.js?v=2609091228';
import * as Dates from './screens/dates.js?v=2609091228';
import * as Extra from './screens/extra.js?v=2609091228';
import { dismissTour } from './screens/coach.js?v=2609091228';

const ROUTES = {
  onboarding: Onboarding.render,
  home: Home.render,
  cat: Ideas.render,
  search: Ideas.renderSearch,
  wishlist: Wishlist.render,
  wl: Wishlist.renderOne,
  wheel: Wheel.render,
  profile: Profile.render,
  dates: Dates.render,
  dateform: Dates.renderForm,
  quest: Extra.renderQuest,
  paywall: Extra.renderPaywall,
  friends: Extra.renderFriends,
  ugc: Extra.renderUgc,
  invite: Extra.renderInvite,
  rewards: Extra.renderRewards,
  access: Extra.renderAccess,
  settings: Extra.renderSettings,
  support: Extra.renderSupport,
  terms: Extra.renderTerms,
  hint: Extra.renderHint,
  sharedWishlist: Extra.renderSharedWishlist,
  notfound: Extra.renderNotFound
};

const TABS = [
  { id: 'home', ico: '🏠', name: 'Главная' },
  { id: 'wishlist', ico: '💖', name: 'Вишлист' },
  { id: 'wheel', ico: '🎡', name: 'Колесо' },
  { id: 'profile', ico: '👤', name: 'Профиль' }
];

let stack = [];
export let current = { route: 'home', params: {} };

export function go(route, params = {}, replace = false) {
  closeSheet();
  const fn = ROUTES[route] || ROUTES.notfound;
  if (!replace && current.route) stack.push({ ...current });
  if (replace) stack = stack.filter(s => s.route !== route);
  current = { route, params };
  paint(fn, params);
  window.scrollTo(0, 0);
}

export function back() {
  if (sheetOpen()) return closeSheet();
  const prev = stack.pop();
  if (prev) { current = prev; paint(ROUTES[prev.route] || ROUTES.notfound, prev.params); }
  else go('home', {}, true);
}

function paint(fn, params) {
  dismissTour();
  const app = $('#app');
  const view = fn(params) || {};
  app.innerHTML = `<div class="screen">${view.html || ''}</div>`;
  app.classList.toggle('app--nonav', !!view.hideNav);
  const bar = $('#tabbar');
  bar.hidden = !!view.hideNav;
  renderTabs(view.tab);
  view.mount?.(app);
  const showBack = !view.hideBack && (stack.length > 0 && !TABS.some(t => t.id === current.route));
  tg.back(showBack ? back : null);
}

function renderTabs(active) {
  const bar = $('#tabbar');
  bar.innerHTML = TABS.map(t =>
    `<button class="tab ${t.id === active ? 'tab--on' : ''}" data-tab="${t.id}"><span>${t.ico}</span>${t.name}</button>`
  ).join('');
  bar.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => { tg.haptic('light'); stack = []; go(b.dataset.tab, {}, true); };
  });
}

// ── старт ────────────────────────────────────────────────────────────
async function boot() {
  tg.init();
  await load();

  // Не блокируем запуск: если backend недоступен или тормозит, приложение
  // продолжает работать локально, как и раньше.
  if (apiAvailable()) { api.auth(); syncAccessFromServer(); }

  const sp = tg.startParam();
  registerReferral(sp);

  track('app_open', { platform: tg.raw?.platform || 'browser', source: sp || 'direct' });

  const splash = $('#splash');
  setTimeout(() => { splash.classList.add('splash--hide'); setTimeout(() => splash.remove(), 400); }, 2400);   // держим сплэш ~2.4 с: успевают догрузиться шрифты, картинки и данные

  // Токен вишлиста раньше терялся здесь: h_<idea> и w_<token> вели на один и тот же
  // экран с id=null, поэтому полученный вишлист всегда показывал заглушку.
  if (sp && sp.startsWith('h_')) { go('hint', { id: sp.slice(2) }, true); return; }
  if (sp && sp.startsWith('w_')) { go('sharedWishlist', { wl: sp.slice(2) }, true); return; }
  if (!state.onboarded) { go('onboarding', {}, true); return; }
  go('home', {}, true);
}

window.addEventListener('error', e => console.error('[tadam]', e.message));
// Мгновенно, без debounce: при закрытии Mini App таймер 600 мс не успевает сработать
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
window.addEventListener('pagehide', () => save(true));

boot();
