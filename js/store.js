// ── Состояние, правила доступа и хранилище ───────────────────────────
// ВНИМАНИЕ (прототип): все правила считаются на клиенте.
// В production источник истины — backend: доступ, лимиты, розыгрыш колеса,
// рефералы и платежи проверяются сервером, клиент лишь отображает результат.

import { tg } from './tg.js?v=2609242257';
import { CONFIG, WHEEL, CATEGORIES, GUIDES, DOCS_VERSION } from './config.js?v=2609242257';
import { api, apiAvailable } from './api.js?v=2609242257';

const KEY = 'tadam_state_v1';
const CHUNK = 3500; // лимит значения Telegram CloudStorage — 4096 символов

// Дата в часовом поясе пользователя, а не в UTC — иначе новый спин в Москве
// открывался бы в 03:00, а не в полночь.
const todayStr = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: state.profile.tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (e) { return new Date().toISOString().slice(0, 10); }
};
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
    profile: { name: '', gender: '', birthDate: '', ageRange: '', giveTo: [], interests: [], dreamGift: '', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow' },
    access: { type: 'free', until: null, source: null },
    tempCategories: {},
    wishlists: [],
    dates: [],
    wheel: { lastSpinDate: null, freeUsedToday: false, bonusSpins: 0, bonusEarnedToday: 0, history: [] },
    rewards: [],
    extraSlots: 0,
    discountUntil: null,
    // Призы колеса: что уже получено — чтобы повтор честно превращался в +1 спин (ТЗ, раздел 04)
    prizes: { guides: {}, discount: null, discountUsed: false, openedCats: [], friendCodes: [] },
    promo: null,                    // промокод от друга: { code, priceRub } — скидка на «Навсегда»
    // Согласия по 152-ФЗ и 38-ФЗ: когда и на какую редакцию документов человек согласился
    consents: { pd: null, ads: null, offer: null, version: null },
    referral: { code: null, invited: [], invitedBy: null, claimed: false, invitedCount: 0 },
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
// Критично: раньше «не удалось прочитать» и «данных ещё нет» не различались —
// сбой сети на старте вёл к тихой перезаписи облака пустым состоянием.
// Теперь `loadCloud` явно возвращает 'empty' (правда пусто) отдельно от
// null (что-то не прочиталось), и запись в облако блокируется, пока
// чтение не подтвердится хотя бы раз в этой сессии.
let cloudReadOk = false;      // true — только после успешного подтверждённого чтения
let lastPartCount = 0;        // сколько частей писали в прошлый раз — чтобы стереть хвост

async function loadCloud() {
  const meta = await tg.cloudGet('st_meta');
  if (meta == null) return 'empty';                    // ключа нет — это правда первый запуск
  const n = parseInt(meta, 10);
  if (!n || n > 40) return null;                        // повреждённые метаданные — не трогаем
  let s = '';
  for (let i = 0; i < n; i++) {
    const part = await tg.cloudGet('st_' + i);
    if (part == null) return null;                      // meta обещала часть — её нет: сбой чтения
    s += part;
  }
  try { const data = JSON.parse(s); lastPartCount = n; return data; }
  catch (e) { return null; }
}

let warnedOverflow = false;
async function saveCloud(json) {
  const parts = [];
  for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
  if (parts.length > 40) {                              // защита от переполнения — не пишем
    if (!warnedOverflow) {
      warnedOverflow = true;
      import('./ui.js?v=2609242257').then(m => m.toast('Данных стало много — почисти старые вишлисты, иначе новое не сохранится'));
    }
    return;
  }
  // Части — сначала, метаданные — последними: если запись прервётся,
  // старое `st_meta` продолжит указывать на старые, ещё целые части.
  for (let i = 0; i < parts.length; i++) await tg.cloudSet('st_' + i, parts[i]);
  await tg.cloudSet('st_meta', String(parts.length));
  for (let i = parts.length; i < lastPartCount; i++) await tg.cloudRemove('st_' + i); // чистим хвост
  lastPartCount = parts.length;
}

// Раньше здесь был Object.assign(state, blank(), data) — поверхностное слияние.
// Сохранённый объект целиком заменял вложенный из blank(), поэтому у пользователя
// со старым состоянием новые поля не появлялись: например state.referral становился
// {code} без invited[], и экран приглашений падал на .length. Сливаем рекурсивно:
// сохранённые значения выигрывают, отсутствующие ключи берутся из значений по умолчанию.
function deepMerge(target, defaults, data) {
  for (const key of new Set([...Object.keys(defaults), ...Object.keys(data)])) {
    const d = defaults[key], v = data[key];
    const plain = x => x && typeof x === 'object' && !Array.isArray(x);
    if (plain(d) && plain(v)) target[key] = deepMerge({}, d, v);
    else target[key] = v === undefined ? d : v;
  }
  return target;
}

export async function load() {
  let data = null;
  if (tg.inTelegram) {
    const r = await loadCloud();
    if (r === 'empty') { data = null; cloudReadOk = true; }         // честно пусто — можно писать
    else if (r) { data = r; cloudReadOk = true; }                    // прочитали — можно писать
    else { cloudReadOk = false; }                                    // сбой — писать в облако нельзя
  } else {
    cloudReadOk = true;                                              // вне Telegram облака нет — не блокируем localStorage
  }
  if (!data) {
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  }
  if (data && data.v === 1) deepMerge(state, blank(), data);
  if (!state.referral.code) state.referral.code = 'r' + token().slice(0, 8);
  ready = true;
  return state;
}

let saveTimer = null;
export function save(immediate) {
  if (!ready) return;
  const json = JSON.stringify(state);
  try { localStorage.setItem(KEY, json); } catch (e) {}              // локально пишем всегда
  clearTimeout(saveTimer);
  // События аналитики в облако не пишем: это до 300 записей, которые каждый раз раздували
  // состояние на несколько лишних чанков CloudStorage. Локально они остаются.
  const flush = () => { if (tg.inTelegram && cloudReadOk) saveCloud(JSON.stringify({ ...state, events: [] })); };
  if (immediate) flush(); else saveTimer = setTimeout(flush, 600);
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
  // save() здесь не зовём: событие сохранится со следующим настоящим изменением.
  // Раньше каждый просмотр экрана запускал запись всего состояния в CloudStorage.
}

// ── обучающие подсказки ──────────────────────────────────────────────
export const tipSeen = key => !!state.tips[key];
export function markTip(key) { state.tips[key] = Date.now(); track('coach_completed', { key }); save(); }
export function resetTips() { state.tips = {}; save(); }

// ── доступ ───────────────────────────────────────────────────────────
export const isPremium = () =>
  state.access.type === 'forever' ||
  (!!state.access.until && Date.now() < state.access.until);

// «Навсегда» (и годовой доступ, выданный до смены тарифов) — полный premium:
// второе колесо и напоминания о датах круглый год.
export const isFullPremium = () =>
  isPremium() && (state.access.type === 'forever' || state.access.type === 'year');

// Текущий тариф одним словом — для сравнительной таблицы
export const planId = () => !isPremium() ? 'free' : (isFullPremium() ? 'forever' : 'week');

export const accessLabel = () => {
  if (state.access.type === 'forever') return 'Навсегда';
  if (isPremium()) {
    const left = Math.ceil((state.access.until - Date.now()) / 86400000);
    const name = { year: 'Год', gift: 'Подарок от друга' }[state.access.type] || 'На праздник';
    return `${name} · ещё ${left} ${left % 10 === 1 && left % 100 !== 11 ? 'день' : 'дн.'}`;
  }
  return 'Бесплатный';
};

export function grantAccess(productId, source) {
  const p = CONFIG.products.find(x => x.id === productId);
  if (!p) return;
  // «Навсегда» ничем не понижаем
  if (state.access.type === 'forever') return;
  if (p.id === 'forever') {
    state.access = { type: 'forever', until: null, source };
    // скидка из колеса или от друга — одноразовая: после покупки гасим
    if (state.prizes.discount) state.prizes.discountUsed = true;
    state.promo = null;
  } else {
    // Продление «На праздник» прибавляется к оставшимся дням, а не сжигает их
    const base = isPremium() && state.access.until ? state.access.until : Date.now();
    state.access = { type: 'week', until: base + p.days * 86400000, source };
  }
  track('entitlement_issued', { product: productId, source });
  save();
  // Зеркалим на сервер: только он проверяет premium для колеса/будущих платежей —
  // без этого «покупка» была бы правдой только на этом устройстве.
  if (apiAvailable() && source !== 'server') api.grantTest(productId);
}

// Подтягиваем доступ, выданный сервером (например другим устройством или тестовой
// покупкой) — источнику 'server' не даём заново дублироваться обратно на сервер.
export async function syncAccessFromServer() {
  if (!apiAvailable()) return;
  const r = await api.access();
  if (!r || !r.ok) return;
  if (r.type !== 'free') state.access = { type: r.type, until: r.until, source: 'server' };
  // Доступ, пришедший с сервера (выдан вручную в админке), сервер может и забрать.
  // Локальный доступ из другого источника не трогаем.
  else if (state.access.source === 'server') state.access = { type: 'free', until: null, source: null };
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

// За сколько дней напоминаем при текущем тарифе (сервер применяет то же правило сам):
// с premium — за 14, 7, 3 и 1 день; без него — за день и только по одной дате
export const reminderOffsets = () =>
  isPremium() ? CONFIG.reminders.defaultOffsets : [1];

// Цена «Навсегда» с учётом скидки из колеса или промокода друга
export function foreverPrice() {
  const p = CONFIG.products.find(x => x.id === 'forever');
  const fromWheel = activeDiscount() ? p.promoRub : Infinity;
  const fromFriend = state.promo?.priceRub || Infinity;
  return Math.min(p.priceRub, fromWheel, fromFriend);
}

// «Намекни» без premium — ограниченно: несколько карточек в сутки
export const hintsLeftToday = () => {
  if (isPremium()) return Infinity;
  const day = todayStr();
  const used = state.hints.filter(h => h.day === day).length;
  return Math.max(0, CONFIG.limits.freeHintsPerDay - used);
};

// ── согласия ─────────────────────────────────────────────────────────
export const consentsGiven = () => !!state.consents.pd;
export function setConsent(kind, value) {
  state.consents[kind] = value ? Date.now() : null;
  state.consents.version = DOCS_VERSION;
  track('consent_' + (value ? 'given' : 'withdrawn'), { kind });
  save();
  if (apiAvailable()) api.consent(kind, !!value, DOCS_VERSION);
}

// ── профиль ──────────────────────────────────────────────────────────
export const profileFilled = () => {
  const p = state.profile;
  return !!(p.name && p.gender && p.birthDate && p.giveTo.length);
};

// ── вишлисты ─────────────────────────────────────────────────────────
export function createWishlist(title) {
  const wl = { id: uid(), title: title || 'Мой вишлист', createdAt: Date.now(), shareToken: token(), shared: false, items: [] };
  state.wishlists.push(wl);
  track('wishlist_created', { id: wl.id });
  save();
  syncWishlists();
  return wl;
}

// Вишлисты уходят на сервер при каждом изменении — так их видно в админке
// (что люди хотят) и расшаренная ссылка всегда показывает актуальный список.
// По ссылке сервер отдаёт только список с shared = true.
let wlTimer = null;
export function syncWishlists() {
  if (!apiAvailable()) return;
  clearTimeout(wlTimer);
  wlTimer = setTimeout(() => {
    for (const wl of state.wishlists)
      api.wishlistSync(wl.shareToken, wl.title, wl.items, state.profile.dreamGift, !!wl.shared, wl.id);
  }, 800);
}

// Даты, добавленные до подключения сервера, дотягиваем при запуске: иначе
// напоминание по ним не придёт. Сервер сохраняет по id, повтор не создаёт дубль.
export function syncDates() {
  if (!apiAvailable()) return;
  for (const d of state.dates) api.dateCreate(d);
}
export function defaultWishlist() {
  return state.wishlists[0] || createWishlist('Мой вишлист');
}
export function addToWishlist(wl, item) {
  if (item.ideaId && wl.items.some(i => i.ideaId === item.ideaId)) return false;
  wl.items.push({ id: uid(), addedAt: Date.now(), priority: false, ...item });
  track(item.ideaId ? 'wishlist_item_added' : 'own_wish_added', { wl: wl.id });
  save();
  syncWishlists();
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
  syncWishlists();
}

// ── важные даты ──────────────────────────────────────────────────────
export function addDate(d) {
  const row = { id: uid(), offsets: CONFIG.reminders.defaultOffsets.slice(), ...d };
  state.dates.push(row);
  track('important_date_added', { type: d.type });
  save();
  // Зеркалим на backend без ожидания: у бота на сервере есть эта дата — только он
  // может прислать напоминание, даже когда телефон выключен и Mini App закрыт.
  if (apiAvailable()) api.dateCreate(row);
  return row;
}

export function removeDate(id) {
  state.dates = state.dates.filter(d => d.id !== id);
  track('important_date_removed', {});
  save();
  if (apiAvailable()) api.dateDelete(id);
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
    { key: 'profile', title: 'Заполни свой профиль', done: profileFilled() },
    { key: 'dates', title: 'Добавь три важные даты близких', done: state.dates.length >= 3 },
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
// Общая часть между локальным и серверным розыгрышем: списание сегодняшней/бонусной
// попытки. Сам выбор награды (что именно выпало) — разный: локально RNG, с сервера — уже готовый код.
function advanceSpinCounter() {
  if (state.wheel.lastSpinDate !== todayStr()) {
    state.wheel.lastSpinDate = todayStr();
    state.wheel.freeUsedToday = false;
    state.wheel.bonusEarnedToday = 0;
  }
  if (!state.wheel.freeUsedToday) state.wheel.freeUsedToday = true;
  else state.wheel.bonusSpins = Math.max(0, state.wheel.bonusSpins - 1);
}

// Какое колесо показываем: №2 — тарифу «Навсегда», №1 — всем остальным (ТЗ, раздел 01)
export const wheelKind = () => isFullPremium() ? 'premium' : 'free';
// Живые веса секторов приходят с сервера (админка) и перекрывают значения из config.js
export function setWheelWeights(w) {
  for (const kind of ['free', 'premium'])
    for (const r of WHEEL[kind]) if (w?.[kind]?.[r.code] != null) r.weight = +w[kind][r.code];
}
export const wheelSectors = () => WHEEL[wheelKind()];

const paidCats = () => CATEGORIES.filter(c => !c.free);
// Платные поводы, которые колесо ещё не открывало и которые сейчас закрыты
export const catsForPrize = () => isPremium() ? [] :
  paidCats().filter(c => !state.prizes.openedCats.includes(c.id) && !(state.tempCategories[c.id] > Date.now()));
// Код для друга: G… — подарок «3 дня premium», D… — скидка. Буква говорит, что это за код,
// даже когда сервер недоступен.
const friendCodeFor = kind => (kind === 'friend_gift' ? 'G' : 'D') + token().slice(0, 7).toUpperCase();
const recentFriendCodes = () => state.prizes.friendCodes.filter(c => Date.now() - c.at < 30 * 86400000).length;

// Защита от повторов: получен ли уже этот приз (тогда вместо него — честный +1 спин)
function alreadyHave(code) {
  if (code.startsWith('guide_')) return !!state.prizes.guides[code];
  if (code === 'discount') return !!state.prizes.discount;
  if (code === 'category') return !catsForPrize().length || state.rewards.some(r => r.code === 'category24' && !r.redeemed && r.expiresAt > Date.now());
  if (code === 'friend_discount' || code === 'friend_gift') return recentFriendCodes() >= WHEEL.friendCodesPer30Days;
  return false;
}

export function spin() {
  if (spinsAvailable() <= 0) { track('spin_rejected', { reason: 'no_spins' }); return null; }
  advanceSpinCounter();
  const pool = wheelSectors().filter(r => r.weight > 0);
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let x = secureRandom() * total, picked = pool[pool.length - 1];
  for (const r of pool) { if (x < r.weight) { picked = r; break; } x -= r.weight; }
  const converted = alreadyHave(picked.code);
  const code = picked.code.startsWith('friend_') && !converted ? friendCodeFor(picked.code) : null;
  return finishSpin(picked, converted, code, 'local');
}

// Тот же спин, но выбор и проверку повторов уже сделал backend (криптостойкий RNG,
// честные лимиты, идемпотентность — см. server/wheel.js). Клиент только применяет итог.
export function applyServerSpin(r) {
  const picked = wheelSectors().find(x => x.code === r.reward);
  if (!picked) return null;
  advanceSpinCounter();
  return finishSpin(picked, !!r.converted, r.friendCode || null, 'server');
}

function finishSpin(picked, converted, friendCode, source) {
  state.wheel.history.push({ code: picked.code, converted, at: Date.now(), ruleVersion: WHEEL.ruleVersion });
  if (converted) addBonusSpin();
  else applyReward(picked.code, friendCode);
  track('spin_completed', { code: picked.code, converted, ruleVersion: WHEEL.ruleVersion, source });
  save();
  return { reward: picked, converted, friendCode, index: wheelSectors().indexOf(picked) };
}

function addBonusSpin() {
  if (state.wheel.bonusEarnedToday >= CONFIG.limits.maxBonusSpinsPerDay) return track('wheel_limit_reached', { reason: 'bonus_cap' });
  state.wheel.bonusSpins += 1;
  state.wheel.bonusEarnedToday += 1;
}

export function applyReward(code, friendCode) {
  const now = Date.now();
  if (code === 'spin') addBonusSpin();
  if (code.startsWith('guide_')) {
    state.prizes.guides[code] = now;
    state.rewards.push({ id: uid(), code, title: WHEEL.free.concat(WHEEL.premium).find(r => r.code === code).title, issuedAt: now, expiresAt: null, redeemed: false });
  }
  if (code === 'discount') {
    // Скидка закрепляется за человеком без срока: активировать можно когда угодно (ТЗ, раздел 02)
    state.prizes.discount = now;
    state.rewards.push({ id: uid(), code: 'discount', title: 'Скидка на «Навсегда»: 490 → 300 ₽', issuedAt: now, expiresAt: null, redeemed: false });
  }
  if (code === 'category') state.rewards.push({ id: uid(), code: 'category24', title: 'Категория на сутки', issuedAt: now, expiresAt: now + 7 * 86400000, redeemed: false });
  if (code === 'friend_discount' || code === 'friend_gift') {
    state.prizes.friendCodes.push({ code: friendCode, kind: code, at: now });
    state.rewards.push({ id: uid(), code, friendCode, title: code === 'friend_gift' ? `Подарок другу: ${WHEEL.friendGiftDays} дня premium` : 'Скидка для друга', issuedAt: now, expiresAt: null, redeemed: false });
  }
  if (code !== 'empty') track('reward_issued', { code });
  save();
}

export function redeemCategory(rewardId, catId) {
  const r = state.rewards.find(x => x.id === rewardId && !x.redeemed);
  if (!r) return false;
  r.redeemed = true;
  r.catId = catId;
  state.tempCategories[catId] = Date.now() + 86400000;
  if (!state.prizes.openedCats.includes(catId)) state.prizes.openedCats.push(catId);
  track('reward_redeemed', { code: r.code, cat: catId });
  save();
  return true;
}

// Скидка из колеса действует, пока человек не купил «Навсегда»
export const activeDiscount = () => !!state.prizes.discount && !state.prizes.discountUsed && !isFullPremium();

// Код друга из колеса №2: G… — 3 дня premium, D… — скидка на «Навсегда».
// Сервер проверяет, что код существует, не свой и ещё не погашен; без сервера — верим ссылке.
export async function redeemFriendCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^[GD][0-9A-F]{7}$/.test(code)) return { ok: false, error: 'bad_code' };
  if (state.prizes.friendCodes.some(c => c.code === code)) return { ok: false, error: 'self' };
  let kind = null;
  if (apiAvailable()) {
    const r = await api.friendCodeRedeem(code);
    if (r && !r.ok) return r;
    if (r) kind = r.kind;
  }
  kind = kind || (code[0] === 'G' ? 'friend_gift' : 'friend_discount');
  if (kind === 'friend_gift') {
    if (isFullPremium()) return { ok: false, error: 'has_forever' };
    const base = isPremium() && state.access.until ? state.access.until : Date.now();
    state.access = { type: isPremium() ? state.access.type : 'gift', until: base + WHEEL.friendGiftDays * 86400000, source: 'friend' };
  } else {
    state.promo = { code, priceRub: WHEEL.friendDiscountRub };
  }
  track('friend_code_redeemed', { kind });
  save();
  return { ok: true, kind };
}

// ── намёки и шеринг ──────────────────────────────────────────────────
export function createHint(payload) {
  const h = { id: uid(), token: token(), createdAt: Date.now(), day: todayStr(), ...payload };
  state.hints.push(h);
  track('hint_created', { idea: payload.ideaId || null });
  save();
  return h;
}

// ── рефералы ─────────────────────────────────────────────────────────
// Приглашённым считается только тот, кто пришёл по ссылке ещё до знакомства с приложением.
// Засчитывает приглашение сервер (claimReferral) — локально мы лишь запоминаем код.
export function registerReferral(startParam) {
  if (!startParam || !startParam.startsWith('r')) return;
  if (state.referral.invitedBy || state.onboarded) return;
  if (startParam === state.referral.code) { track('referral_rejected', { reason: 'self' }); return; }
  state.referral.invitedBy = startParam;
  track('referral_link_opened', { by: startParam });
  save();
}

// Вызывается, когда приглашённый прошёл первый шаг онбординга. Сервер проверяет,
// что это новый пользователь, не сам пригласивший и не больше 5 друзей в сутки,
// начисляет спин пригласившему и шлёт ему сообщение от бота.
export async function claimReferral() {
  const r = state.referral;
  if (!r.invitedBy || r.claimed || !apiAvailable()) return;
  const res = await api.referralClaim(r.invitedBy);
  if (res && (res.ok || res.error === 'already_claimed' || res.error === 'not_new_user' || res.error === 'self')) {
    r.claimed = true;                      // окончательный ответ сервера — повторно не шлём
    track(res.ok ? 'referral_qualified' : 'referral_rejected', { reason: res.error || null });
    save();
  }
}

// Код приглашения закрепляем за пользователем на сервере: так ссылка одна и та же
// на всех устройствах, а сервер знает, кому начислять спин.
export async function syncReferral() {
  if (!apiAvailable()) return;
  const res = await api.referralRegister(state.referral.code);
  if (res && res.ok) {
    state.referral.code = res.code;
    state.referral.invitedCount = res.invited || 0;
    save();
  }
}

export { uid, token, todayStr };
