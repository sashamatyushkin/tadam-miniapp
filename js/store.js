// ── Состояние, правила доступа и хранилище ───────────────────────────
// ВНИМАНИЕ (прототип): все правила считаются на клиенте.
// В production источник истины — backend: доступ, лимиты, розыгрыш колеса,
// рефералы и платежи проверяются сервером, клиент лишь отображает результат.

import { tg } from './tg.js?v=2609081709';
import { CONFIG, WHEEL } from './config.js?v=2609081709';

const KEY = 'tadam_state_v1';
const CHUNK = 3500; // лимит значения Telegram CloudStorage — 4096 символов

const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const token = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
};

function blank() {
  return {
    v: 1,
    createdAt: Date.now(),
    onboarded: false,
    profile: { name: '', ageRange: '', giveTo: [], interests: [], dreamGift: '', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow' },
    access: { type: 'free', until: null, source: null },
    tempCategories: {},
    wishlists: [],
    dates: [],
    wheel: { lastSpinDate: null, freeUsedToday: false, bonusSpins: 0, bonusEarnedToday: 0, history: [] },
    rewards: [],
    extraSlots: 0,
    discountUntil: null,
    referral: { code: null, invited: [], invitedBy: null },
    quest: { rewardIssued: false, rewardCode: null },
    hints: [],
    ugc: null,
    seen: {},
    tips: {},                       // какие обучающие подсказки уже показаны
    storiesSeen: {},                // просмотренные сторис
    settings: { reminders: true, analytics: true },
    events: []
  };
}

export const state = blank();
let ready = false;

// ── персистентность ──────────────────────────────────────────────────
async function loadCloud() {
  const meta = await tg.cloudGet('st_meta');
  if (!meta) return null;
  const n = parseInt(meta, 10);
  if (!n || n > 40) return null;
  let s = '';
  for (let i = 0; i < n; i++) {
    const part = await tg.cloudGet('st_' + i);
    if (part == null) return null;
    s += part;
  }
  try { return JSON.parse(s); } catch (e) { return null; }
}

async function saveCloud(json) {
  const parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
  if (parts.length > 40) return;                       // защита от переполнения
  await tg.cloudSet('st_meta', String(parts.length));
  for (let i = 0; i < parts.length; i++) await tg.cloudSet('st_' + i, parts[i]);
}

export async function load() {
  let data = null;
  if (tg.inTelegram) data = await loadCloud();
  if (!data) {
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  }
  if (data && data.v === 1) Object.assign(state, blank(), data);
  if (!state.referral.code) state.referral.code = 'r' + token().slice(0, 8);
  ready = true;
  return state;
}

let saveTimer = null;
export function save() {
  if (!ready) return;
  const json = JSON.stringify(state);
  try { localStorage.setItem(KEY, json); } catch (e) {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (tg.inTelegram) saveCloud(json); }, 600);
}

export function resetAll() {
  Object.assign(state, blank());
  state.referral.code = 'r' + token().slice(0, 8);
  save();
}

// ── аналитика (в проде — POST /analytics/events) ─────────────────────
export function track(name, params = {}) {
  if (!state.settings.analytics) return;
  state.events.push({ n: name, t: Date.now(), p: params });
  if (state.events.length > 300) state.events.splice(0, state.events.length - 300);
  save();
}

// ── обучающие подсказки ──────────────────────────────────────────────
export const tipSeen = key => !!state.tips[key];
export function markTip(key) { state.tips[key] = Date.now(); track('coach_completed', { key }); save(); }
export function resetTips() { state.tips = {}; save(); }

// ── доступ ───────────────────────────────────────────────────────────
export const isPremium = () =>
  state.access.type === 'forever' ||
  (!!state.access.until && Date.now() < state.access.until);

export const accessLabel = () => {
  if (state.access.type === 'forever') return 'Навсегда';
  if (isPremium()) {
    const left = Math.ceil((state.access.until - Date.now()) / 86400000);
    return `Ещё ${left} дн.`;
  }
  return 'Бесплатный';
};

export function grantAccess(productId, source) {
  const p = CONFIG.products.find(x => x.id === productId);
  if (!p) return;
  if (p.days === null) state.access = { type: 'forever', until: null, source };
  else {
    const base = isPremium() && state.access.until ? state.access.until : Date.now();
    state.access = { type: 'holiday', until: base + p.days * 86400000, source };
  }
  track('entitlement_issued', { product: productId, source });
  save();
}

export function categoryOpen(cat) {
  if (cat.free) return true;
  if (isPremium()) return true;
  const until = state.tempCategories[cat.id];
  return !!until && Date.now() < until;
}

export const wishlistLimit = () =>
  isPremium() ? Infinity : CONFIG.limits.freeWishlists + state.extraSlots;
export const datesLimit = () =>
  isPremium() ? Infinity : CONFIG.limits.freeDates;

// ── вишлисты ─────────────────────────────────────────────────────────
export function createWishlist(title) {
  const wl = { id: uid(), title: title || 'Мой вишлист', createdAt: Date.now(), shareToken: token(), shared: false, items: [] };
  state.wishlists.push(wl);
  track('wishlist_created', { id: wl.id });
  save();
  return wl;
}
export function defaultWishlist() {
  return state.wishlists[0] || createWishlist('Мой вишлист');
}
export function addToWishlist(wl, item) {
  if (item.ideaId && wl.items.some(i => i.ideaId === item.ideaId)) return false;
  wl.items.push({ id: uid(), addedAt: Date.now(), priority: false, ...item });
  track(item.ideaId ? 'wishlist_item_added' : 'own_wish_added', { wl: wl.id });
  save();
  return true;
}
export const totalWishlistItems = () => state.wishlists.reduce((n, w) => n + w.items.length, 0);

export function inWishlist(ideaId) {
  return state.wishlists.some(w => w.items.some(i => i.ideaId === ideaId));
}
export function removeItem(wl, itemId) {
  wl.items = wl.items.filter(i => i.id !== itemId);
  track('wishlist_item_removed', { wl: wl.id });
  save();
}

// ── важные даты ──────────────────────────────────────────────────────
export function addDate(d) {
  state.dates.push({ id: uid(), offsets: CONFIG.reminders.defaultOffsets.slice(), ...d });
  track('important_date_added', { type: d.type });
  save();
}
export function daysUntil(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, day);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, day);
  // 29 февраля в невисокосный год → 1 марта
  if (m === 2 && day === 29 && next.getMonth() !== 1) next = new Date(next.getFullYear(), 2, 1);
  return Math.round((next - now) / 86400000);
}

// ── квест «Заполни и получи» ─────────────────────────────────────────
export function questSteps() {
  return [
    { key: 'dates', title: 'Добавь 3 важные даты близких', done: state.dates.length >= 3 },
    { key: 'wishlist', title: 'Собери первый вишлист', done: state.wishlists.some(w => w.items.length > 0) },
    { key: 'dream', title: 'Укажи свой подарок мечты', done: !!state.profile.dreamGift }
  ];
}
export function questComplete() { return questSteps().every(s => s.done); }

export function issueQuestReward() {
  if (state.quest.rewardIssued) return null;          // идемпотентность
  if (!questComplete()) return null;
  state.quest.rewardIssued = true;
  state.quest.rewardCode = 'category24';
  const r = { id: uid(), code: 'category24', title: 'Premium-категория на 24 часа', issuedAt: Date.now(), expiresAt: Date.now() + 86400000, redeemed: false };
  state.rewards.push(r);
  track('profile_reward_issued', { code: r.code });
  save();
  return r;
}

// ── колесо ───────────────────────────────────────────────────────────
export function spinsAvailable() {
  const fresh = state.wheel.lastSpinDate !== todayStr();
  const free = fresh ? CONFIG.limits.dailySpins : (state.wheel.freeUsedToday ? 0 : CONFIG.limits.dailySpins);
  return free + state.wheel.bonusSpins;
}

function secureRandom() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

// В production этот расчёт целиком выполняется на сервере (см. README).
export function spin() {
  if (spinsAvailable() <= 0) { track('spin_rejected', { reason: 'no_spins' }); return null; }
  if (state.wheel.lastSpinDate !== todayStr()) {
    state.wheel.lastSpinDate = todayStr();
    state.wheel.freeUsedToday = false;
    state.wheel.bonusEarnedToday = 0;
  }
  if (!state.wheel.freeUsedToday) state.wheel.freeUsedToday = true;
  else state.wheel.bonusSpins = Math.max(0, state.wheel.bonusSpins - 1);

  const pool = WHEEL.rewards.filter(r => r.weight > 0);
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let x = secureRandom() * total, picked = pool[pool.length - 1];
  for (const r of pool) { if (x < r.weight) { picked = r; break; } x -= r.weight; }

  const res = { code: picked.code, title: picked.title, at: Date.now(), ruleVersion: WHEEL.ruleVersion };
  state.wheel.history.push(res);
  applyReward(picked.code);
  track('spin_completed', { code: picked.code, ruleVersion: WHEEL.ruleVersion });
  save();
  return { reward: picked, index: WHEEL.rewards.indexOf(picked) };
}

export function applyReward(code) {
  const now = Date.now();
  if (code === 'slot') state.extraSlots += 1;
  if (code === 'spin') {
    if (state.wheel.bonusEarnedToday < CONFIG.limits.maxBonusSpinsPerDay) {
      state.wheel.bonusSpins += 1;
      state.wheel.bonusEarnedToday += 1;
    } else track('wheel_limit_reached', { reason: 'bonus_cap' });
  }
  if (code === 'discount') { state.discountUntil = now + 86400000; track('discount_won', {}); }
  if (code === 'category') state.rewards.push({ id: uid(), code: 'category24', title: 'Premium-категория на 24 часа', issuedAt: now, expiresAt: now + 86400000, redeemed: false });
  if (code === 'set') state.rewards.push({ id: uid(), code: 'set', title: 'Эксклюзивная подборка', issuedAt: now, expiresAt: now + 7 * 86400000, redeemed: false });
  if (code !== 'empty') track('reward_issued', { code });
  save();
}

export function redeemCategory(rewardId, catId) {
  const r = state.rewards.find(x => x.id === rewardId && !x.redeemed);
  if (!r) return false;
  r.redeemed = true;
  r.catId = catId;
  state.tempCategories[catId] = Date.now() + 86400000;
  track('reward_redeemed', { code: r.code, cat: catId });
  save();
  return true;
}

export const activeDiscount = () => !!state.discountUntil && Date.now() < state.discountUntil;

// ── намёки и шеринг ──────────────────────────────────────────────────
export function createHint(payload) {
  const h = { id: uid(), token: token(), createdAt: Date.now(), ...payload };
  state.hints.push(h);
  track('hint_created', { idea: payload.ideaId || null });
  save();
  return h;
}

// ── рефералы ─────────────────────────────────────────────────────────
export function registerReferral(startParam) {
  if (!startParam) return;
  if (startParam.startsWith('r') && !state.referral.invitedBy && Date.now() - state.createdAt < 60000) {
    if (startParam === state.referral.code) { track('referral_rejected', { reason: 'self' }); return; }
    state.referral.invitedBy = startParam;
    track('referral_link_opened', { by: startParam });
    save();
  }
}

export { uid, token, todayStr };
