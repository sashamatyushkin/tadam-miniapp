// ── Точка входа и роутер ─────────────────────────────────────────────
import { tg } from './tg.js?v=2609242324';
import { load, save, state, track, registerReferral, syncAccessFromServer, syncReferral, resetAll, syncWishlists, syncDates, setWheelWeights } from './store.js?v=2609242324';
import { api, apiAvailable } from './api.js?v=2609242324';
import { $, closeSheet, sheetOpen } from './ui.js?v=2609242324';

import * as Onboarding from './screens/onboarding.js?v=2609242324';
import * as Home from './screens/home.js?v=2609242324';
import * as Ideas from './screens/ideas.js?v=2609242324';
import * as Wishlist from './screens/wishlist.js?v=2609242324';
import * as Wheel from './screens/wheel.js?v=2609242324';
import * as Profile from './screens/profile.js?v=2609242324';
import * as Dates from './screens/dates.js?v=2609242324';
import * as Extra from './screens/extra.js?v=2609242324';
import { dismissTour } from './screens/coach.js?v=2609242324';
import { addAdminIdeas } from './data/ideas.js?v=2609242324';
import { BRAND_FRIENDS } from './config.js?v=2609242324';
import { addAdminStories } from './screens/stories.js?v=2609242324';

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
  me: Extra.renderMe,
  support: Extra.renderSupport,
  terms: Extra.renderTerms,
  doc: Extra.renderDoc,
  calendar: Dates.renderCalendar,
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
  // «Назад» — везде, куда можно вернуться: по истории, а с корневых вкладок — на Главную.
  // «Закрыть» остаётся только на самой Главной и на экранах, открытых по внешней ссылке.
  // Экран может задать свой обработчик (например, шаг назад в онбординге).
  const canBack = stack.length > 0 || current.route !== 'home';
  tg.back(view.onBack || (!view.hideBack && canBack ? back : null));
  // Познакомился до появления юр. документов — один раз спрашиваем согласие (кроме экрана самого документа)
  if (state.onboarded && current.route !== 'doc') Onboarding.askConsentsIfNeeded();
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
  const sp = tg.startParam();
  if (apiAvailable()) {
    // auth первым: он создаёт пользователя на сервере и запоминает, откуда тот пришёл
    api.auth(sp).then(() => { syncReferral(); syncAccessFromServer(); syncWishlists(); syncDates(); });
    loadAdminContent();
  }

  // Тестовый запуск «с нуля»: каждый вход по debug-ссылке стирает данные и начинает со знакомства
  if (sp === 'debug') { resetAll(); save(true); }
  registerReferral(sp);

  track('app_open', { platform: tg.raw?.platform || 'browser', source: sp || 'direct' });

  const splash = $('#splash');
  setTimeout(() => { splash.classList.add('splash--hide'); setTimeout(() => splash.remove(), 400); }, 2400);   // держим сплэш ~2.4 с: успевают догрузиться шрифты, картинки и данные

  // Токен вишлиста раньше терялся здесь: h_<idea> и w_<token> вели на один и тот же
  // экран с id=null, поэтому полученный вишлист всегда показывал заглушку.
  if (sp && sp.startsWith('h_')) { go('hint', { id: sp.slice(2) }, true); return; }
  if (sp && sp.startsWith('w_')) { go('sharedWishlist', { wl: sp.slice(2) }, true); return; }
  // Код друга из колеса (?start=f_<код>): новичка сначала знакомим, код подставим в тарифах
  if (sp && sp.startsWith('f_')) state.pendingPromo = sp.slice(2).toUpperCase();
  if (!state.onboarded) { go('onboarding', {}, true); return; }
  // С сайта по кнопке «Купить» (?start=tariffs) — сразу на тарифы
  if (sp === 'tariffs') { go('home', {}, true); go('paywall', { from: 'site' }); return; }
  go('home', {}, true);
  offerPendingPromo();
}

export function offerPendingPromo() {
  if (!state.pendingPromo || !state.consents.pd) return;
  const code = state.pendingPromo;
  state.pendingPromo = null; save();
  Extra.promoSheet(code);
}

// Идеи и сторис, добавленные через админку. Не блокирует старт: подгружается в фоне,
// а если что-то уже нарисовано (главная или каталог) — перерисовываем той же командой,
// что и обычная навигация, чтобы новый контент появился без перезахода в приложение.
async function loadAdminContent() {
  const [ideasRes, storiesRes, friendsRes, wheelRes] = await Promise.all([api.contentIdeas(), api.contentStories(), api.contentFriends(), api.contentWheel()]);
  let changed = false;
  if (wheelRes?.ok) setWheelWeights(wheelRes.weights);
  if (friendsRes?.ok) BRAND_FRIENDS.splice(0, BRAND_FRIENDS.length, ...friendsRes.items);
  if (ideasRes?.ok && ideasRes.items.length) { addAdminIdeas(ideasRes.items); changed = true; }
  if (storiesRes?.ok && storiesRes.items.length) { addAdminStories(storiesRes.items); changed = true; }
  if (changed && (current.route === 'home' || current.route === 'cat')) go(current.route, current.params, true);
}

window.addEventListener('error', e => console.error('[tadam]', e.message));
// Мгновенно, без debounce: при закрытии Mini App таймер 600 мс не успевает сработать
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
window.addEventListener('pagehide', () => save(true));

boot();
