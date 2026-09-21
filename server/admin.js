// ── Админка: аналитика, пользователи, контент ──────────────────────────
// Раздел того же сервера (/admin), а не отдельный сайт — меньше, что разворачивать.
// Доступ по HTTP Basic Auth (ADMIN_USER / ADMIN_PASS в .env). Пока они не заданы,
// все /admin* маршруты выключены — чтобы не оказаться на проде с угадываемым паролем.
//
// Разметка страницы — admin-page.html рядом; этот файл отдаёт её и JSON API для неё.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, getEntitlement, isPremiumRow, grantEntitlement, lastConsent } from './db.js';
import { wheelWeights, setWheelWeight } from './wheel.js';
import { WHEEL, PRIZE_TITLES } from './config.js';
import { json, readBody } from './util.js';
import { sendMessage } from './telegram.js';

const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const ADMIN_ENABLED = !!(ADMIN_USER && ADMIN_PASS);
const BOT = process.env.BOT_USERNAME || 'tadamapp_bot';
const WEBAPP = (process.env.WEBAPP_URL || 'https://sashamatyushkin.github.io/tadam-miniapp/').replace(/\/?$/, '/');
const DAY = 86400000;

// Подписи дублируют js/config.js — сервер не импортирует браузерный модуль фронтенда
// (тот же осознанный компромисс, что в server/config.js).
const META = {
  bot: BOT,
  recipients: { mom: 'Маме', dad: 'Папе', partner: 'Партнёру', friend: 'Другу', colleague: 'Коллеге', child: 'Ребёнку', family: 'Семье', teacher: 'Учителю' },
  interests: {
    memory: 'Память и эмоции', food: 'Еда и напитки', impressions: 'Впечатления', home: 'Дом и уют', romance: 'Романтика',
    fun: 'Игры и юмор', creative: 'Творчество', learning: 'Обучение', style: 'Красота и стиль', care: 'Забота и здоровье',
    music: 'Музыка и кино', tech: 'Техника', family: 'Семья и дети', magic: 'Космос и магия',
    // старые группы — чтобы идеи, добавленные до смены базы, показывались с подписью
    coffee: 'Кофе', sport: 'Спорт', books: 'Книги', beauty: 'Красота', travel: 'Путешествия'
  },
  categories: {
    birthday: 'День рождения', newyear: 'Новый год', justso: 'Просто так', anniv: 'Годовщина', feb23: '23 февраля',
    mar8: '8 марта', baby: 'Рождение ребёнка', home: 'Новоселье', school: 'Выпускной / 1 сентября', wedding: 'Свадьба',
    colleague: 'Коллеге по работе', kid: 'Ребёнку', jubilee: 'Юбилей'
  },
  budgets: { 1000: 'до 1 000 ₽', 3000: 'до 3 000 ₽', 5000: 'до 5 000 ₽', 10000: 'до 10 000 ₽', 99999: 'дороже 10 000 ₽' },
  storyBg: { mango: 'Оранжевый', coffee: 'Кофейный', ice: 'Голубой', purple: 'Фиолетовый', rose: 'Розовый', gold: 'Золотой', ny: 'Зелёный' },
  mascots: ['wave', 'think', 'heart', 'notes', 'wow', 'cool', 'sleep', 'search', 'run', 'bubble', 'alert', 'peek'],
  ctaRoutes: { cat: 'Открыть повод', wishlist: 'Вишлист', wheel: 'Колесо', paywall: 'Premium', me: 'Мой профиль', quest: 'Заполни и получи', home: 'Главная' },
  rewards: { ...PRIZE_TITLES, set: 'Подборка (старое колесо)', slot: 'Слот вишлиста (старое колесо)' },
  wheel: { free: WHEEL.free.map(s => s.code), premium: WHEEL.premium.map(s => s.code) },
  freeCategories: ['birthday', 'newyear', 'justso']
};

const list = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const count = (sql, ...a) => db.prepare(sql).get(...a).n;

// Тариф пользователя одним словом — с учётом истёкшего срока
function planOf(ent) {
  if (!ent || !isPremiumRow(ent)) return 'free';
  return ent.type === 'holiday' || ent.type === 'gift' ? 'week' : ent.type;
}

// Источник первого входа → понятная группа для отчёта
function sourceKind(src) {
  if (!src || src === 'direct') return 'direct';
  if (src.startsWith('p_')) return 'promo';
  if (/^r[a-f0-9]{8}$/.test(src)) return 'referral';
  if (src.startsWith('h_') || src.startsWith('w_')) return 'hint';
  return 'other';
}

// ── аналитика ────────────────────────────────────────────────────────
// Считается из данных, которые приложение и так присылает в обычной работе:
// профиль, вишлисты, даты, колесо, приглашения. Отдельного лога событий нет.
export function computeStats() {
  const now = Date.now();
  const users = db.prepare('SELECT id, gender, give_to, interests, dream_gift, source, created_at, last_seen_at, birth_date FROM users').all();
  const ents = new Map(db.prepare('SELECT * FROM entitlements').all().map(e => [e.user_id, e]));

  const plan = { free: 0, week: 0, year: 0, forever: 0 };
  const gender = { f: 0, m: 0, x: 0, unknown: 0 };
  const sources = { direct: 0, promo: 0, referral: 0, hint: 0, other: 0 };
  const giveTo = {}, interests = {}, dreams = {}, age = {};
  let profiled = 0, active7 = 0;

  // новые пользователи по дням за 14 дней
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * DAY); d.setHours(0, 0, 0, 0);
    days.push({ t: d.getTime(), label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`, n: 0 });
  }

  for (const u of users) {
    plan[planOf(ents.get(u.id))]++;
    gender[['f', 'm', 'x'].includes(u.gender) ? u.gender : 'unknown']++;
    sources[sourceKind(u.source)]++;
    if (u.gender) profiled++;
    if ((u.last_seen_at || u.created_at) > now - 7 * DAY) active7++;
    for (const g of list(u.give_to)) giveTo[g] = (giveTo[g] || 0) + 1;
    for (const i of list(u.interests)) interests[i] = (interests[i] || 0) + 1;
    const dg = u.dream_gift?.trim(); if (dg) dreams[dg] = (dreams[dg] || 0) + 1;
    if (u.birth_date) {
      const years = Math.floor((now - Date.parse(u.birth_date)) / (365.25 * DAY));
      const b = years < 18 ? 'до 18' : years < 25 ? '18–24' : years < 35 ? '25–34' : years < 45 ? '35–44' : '45+';
      age[b] = (age[b] || 0) + 1;
    }
    const day = days.find(d => u.created_at >= d.t && u.created_at < d.t + DAY);
    if (day) day.n++;
  }

  const wl = db.prepare('SELECT items_json FROM wishlists WHERE revoked = 0').all();
  const items = {};
  let itemsTotal = 0;
  for (const w of wl) for (const it of list(w.items_json)) if (it.title) { items[it.title] = (items[it.title] || 0) + 1; itemsTotal++; }

  const top = (o, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const ageOrder = ['до 18', '18–24', '25–34', '35–44', '45+'];

  return {
    totalUsers: users.length,
    newToday: users.filter(u => u.created_at > now - DAY).length,
    new7: users.filter(u => u.created_at > now - 7 * DAY).length,
    active7, profiled,
    plan, gender, sources,
    byDay: days.map(d => [d.label, d.n]),
    age: ageOrder.filter(k => age[k]).map(k => [k, age[k]]),
    giveTo: top(giveTo), interests: top(interests),
    topItems: top(items), topDreams: top(dreams),
    wishlists: wl.length, itemsTotal,
    dates: count('SELECT COUNT(*) n FROM important_dates'),
    spins: Object.fromEntries(db.prepare('SELECT reward_code, COUNT(*) n FROM spin_results GROUP BY reward_code').all().map(s => [s.reward_code, s.n])),
    converted: count('SELECT COUNT(*) n FROM spin_results WHERE converted = 1'),
    consents: {
      pd: count("SELECT COUNT(DISTINCT user_id) n FROM consents c WHERE kind = 'pd' AND value = 1 AND id = (SELECT MAX(id) FROM consents WHERE user_id = c.user_id AND kind = 'pd')"),
      ads: count("SELECT COUNT(DISTINCT user_id) n FROM consents c WHERE kind = 'ads' AND value = 1 AND id = (SELECT MAX(id) FROM consents WHERE user_id = c.user_id AND kind = 'ads')"),
      offer: count("SELECT COUNT(DISTINCT user_id) n FROM consents WHERE kind = 'offer' AND value = 1")
    },
    referrals: count('SELECT COUNT(*) n FROM referrals WHERE qualified = 1'),
    ugcPending: count("SELECT COUNT(*) n FROM ugc_applications WHERE status = 'submitted'")
  };
}

// ── пользователи ─────────────────────────────────────────────────────
function userRow(u) {
  const ent = getEntitlement(u.id);
  return {
    id: u.id, firstName: u.first_name, username: u.username, name: u.profile_name || u.first_name || '',
    gender: u.gender, birthDate: u.birth_date, giveTo: list(u.give_to), interests: list(u.interests), dream: u.dream_gift || '',
    source: u.source || 'direct', sourceKind: sourceKind(u.source),
    createdAt: u.created_at, lastSeenAt: u.last_seen_at,
    plan: planOf(ent), until: ent.until,
    wishlists: count('SELECT COUNT(*) n FROM wishlists WHERE owner_id = ? AND revoked = 0', u.id),
    invited: count('SELECT COUNT(*) n FROM referrals WHERE referrer_id = ? AND qualified = 1', u.id)
  };
}

function listUsers(q, filter, page) {
  const where = [], args = [];
  if (q) {
    where.push('(CAST(id AS TEXT) LIKE ? OR first_name LIKE ? OR username LIKE ? OR profile_name LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (filter === 'profiled') where.push('gender IS NOT NULL');
  const sql = `FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  let rows = db.prepare(`SELECT * ${sql} ORDER BY created_at DESC`).all(...args).map(userRow);
  if (filter === 'premium') rows = rows.filter(r => r.plan !== 'free');
  const PAGE = 25;
  return { total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / PAGE)), items: rows.slice((page - 1) * PAGE, page * PAGE) };
}

function userDetail(id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return null;
  return {
    ...userRow(u),
    wishlists: db.prepare('SELECT title, items_json, shared, updated_at FROM wishlists WHERE owner_id = ? AND revoked = 0 ORDER BY updated_at DESC').all(id)
      .map(w => ({ title: w.title, shared: !!w.shared, updatedAt: w.updated_at, items: list(w.items_json) })),
    dates: db.prepare('SELECT name, date, relation, type FROM important_dates WHERE user_id = ? ORDER BY substr(date, 6)').all(id),
    invitedUsers: db.prepare(`SELECT u.id, u.first_name, u.profile_name, r.created_at FROM referrals r JOIN users u ON u.id = r.user_id
      WHERE r.referrer_id = ? AND r.qualified = 1 ORDER BY r.created_at DESC`).all(id),
    invitedBy: db.prepare('SELECT u.id, u.first_name, u.profile_name FROM referrals r JOIN users u ON u.id = r.referrer_id WHERE r.user_id = ?').get(id) || null,
    ugc: db.prepare('SELECT platform, link, nick, views, status, created_at FROM ugc_applications WHERE user_id = ? ORDER BY created_at DESC').all(id),
    spins: count('SELECT COUNT(*) n FROM spin_results WHERE user_id = ?', id),
    prizes: db.prepare('SELECT code, meta, created_at FROM user_prizes WHERE user_id = ? ORDER BY created_at DESC').all(id),
    friendCodes: db.prepare('SELECT code, kind, created_at, redeemed_by, redeemed_at FROM friend_codes WHERE owner_id = ? ORDER BY created_at DESC').all(id),
    consents: Object.fromEntries(['pd', 'ads', 'offer'].map(k => [k, lastConsent(id, k)]))
  };
}

const PLAN_TEXT = { week: 'premium на 7 дней', year: 'premium на год', forever: 'premium навсегда' };

// Ручная выдача доступа. Приложение подтягивает доступ с сервера при каждом запуске.
function setAccess(userId, plan) {
  if (plan === 'free') return grantEntitlement(userId, 'free', null, 'admin_revoke');
  const days = { week: 7, year: 365 }[plan];
  grantEntitlement(userId, plan, plan === 'forever' ? null : Date.now() + days * DAY, 'admin');
  sendMessage(userId, `Та-дам! 🎁 Тебе открыт ${PLAN_TEXT[plan]}`,
    { inline_keyboard: [[{ text: '🎁 Открыть Та-дам', web_app: { url: WEBAPP } }]] });
}

// ── промокоды и приглашения ──────────────────────────────────────────
function promoReport() {
  const promos = db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all().map(p => {
    const src = 'p_' + p.code;
    const ids = db.prepare('SELECT id FROM users WHERE source = ?').all(src).map(r => r.id);
    return {
      ...p, link: `https://t.me/${BOT}?start=${src}`, users: ids.length,
      premium: ids.filter(id => planOf(getEntitlement(id)) !== 'free').length,
      new7: count('SELECT COUNT(*) n FROM users WHERE source = ? AND created_at > ?', src, Date.now() - 7 * DAY)
    };
  });
  const referrers = db.prepare(`SELECT r.referrer_id id, u.first_name, u.profile_name, u.username, COUNT(*) n, MAX(r.created_at) last
    FROM referrals r LEFT JOIN users u ON u.id = r.referrer_id WHERE r.qualified = 1
    GROUP BY r.referrer_id ORDER BY n DESC LIMIT 50`).all();
  return {
    promos, referrers,
    totals: {
      promo: count("SELECT COUNT(*) n FROM users WHERE substr(source, 1, 2) = 'p_'"),
      referral: count('SELECT COUNT(*) n FROM referrals WHERE qualified = 1'),
      referrers: count('SELECT COUNT(DISTINCT referrer_id) n FROM referrals WHERE qualified = 1'),
      direct: count("SELECT COUNT(*) n FROM users WHERE source IS NULL OR source = 'direct'")
    }
  };
}

// ── колесо: веса секторов и что выпадает на самом деле ────────────────
function wheelReport() {
  const drawn = db.prepare(`SELECT reward_code code, COUNT(*) n, SUM(converted) conv FROM spin_results
    WHERE rule_version = 'v2' GROUP BY reward_code`).all();
  const d = Object.fromEntries(drawn.map(r => [r.code, r]));
  const codes = db.prepare(`SELECT kind, COUNT(*) n, SUM(redeemed_by IS NOT NULL) used FROM friend_codes GROUP BY kind`).all();
  return {
    weights: wheelWeights(),
    drawn: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { n: v.n, converted: v.conv || 0 }])),
    totalSpins: count("SELECT COUNT(*) n FROM spin_results WHERE rule_version = 'v2'"),
    friendCodes: Object.fromEntries(codes.map(c => [c.kind, { issued: c.n, used: c.used || 0 }])),
    guides: db.prepare('SELECT g.code, g.title, g.image_path, (SELECT COUNT(*) FROM user_prizes p WHERE p.code = g.code) holders FROM guides g').all()
      .map(g => ({ ...g, url: WEBAPP + g.image_path })),
    discounts: count("SELECT COUNT(*) n FROM user_prizes WHERE code = 'discount'"),
    categoriesOpened: count("SELECT COUNT(*) n FROM user_prizes WHERE code = 'category'")
  };
}

// ── база идей клиента (генерируется tools/import_ideas.py из Excel) ────
let ideasBank = null;
function ideasDb() {
  if (!ideasBank) {
    try { ideasBank = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ideas-db.json'), 'utf8')); }
    catch (e) { ideasBank = {}; }
  }
  return Object.entries(ideasBank).flatMap(([cat, rows]) => rows.map((r, i) => ({
    n: i + 1, cat, title: r[0], why: r[1], budget: r[2], who: r[5], tags: r[6], where: r[7],
    free: META.freeCategories.includes(cat) && !!r[8]
  })));
}

// ── заявки UGC ───────────────────────────────────────────────────────
const UGC_DONE = {
  approved_basic: { plan: 'year', text: 'Заявка в «Твори с Та-дам» одобрена 🎉 Держи premium на год.' },
  approved_100k: { plan: 'forever', text: 'Твой ролик набрал 100 000 — это победа 🏆 Держи premium навсегда. Скоро добавим тебя в «Друзья бренда».' },
  rejected: { plan: null, text: 'Мы посмотрели заявку в «Твори с Та-дам» — в этот раз не подошла. Попробуй с новым роликом ✨' }
};

// ── HTTP Basic Auth ──────────────────────────────────────────────────
function checkAuth(req, res) {
  if (!ADMIN_ENABLED) { json(res, 503, { ok: false, error: 'admin_not_configured' }); return false; }
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  const decoded = m ? Buffer.from(m[1], 'base64').toString('utf8') : '';
  const i = decoded.indexOf(':');
  if (i > 0 && decoded.slice(0, i) === ADMIN_USER && decoded.slice(i + 1) === ADMIN_PASS) return true;
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="tadam-admin", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Нужен логин и пароль администратора');
  return false;
}

const httpUrl = v => { try { const u = new URL(String(v || '')); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : ''; } catch (e) { return ''; } };
const str = (v, n) => String(v ?? '').trim().slice(0, n);

export function mountAdmin(on) {
  const g = handler => (req, res, m) => { if (checkAuth(req, res)) return handler(req, res, m); };
  const qs = req => new URL(req.url, 'http://x').searchParams;

  const pagePath = join(dirname(fileURLToPath(import.meta.url)), 'admin-page.html');
  on('GET', /^\/admin\/?$/, g((req, res) => {
    // читаем при каждом запросе — правка разметки не требует перезапуска сервера
    const html = readFileSync(pagePath, 'utf8').replace('/*__META__*/null', JSON.stringify(META));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  }));

  on('GET', /^\/admin\/api\/stats$/, g((req, res) => json(res, 200, { ok: true, stats: computeStats() })));

  // пользователи
  on('GET', /^\/admin\/api\/users$/, g((req, res) => {
    const p = qs(req);
    json(res, 200, { ok: true, ...listUsers(str(p.get('q'), 60), p.get('filter') || '', Math.max(1, +p.get('page') || 1)) });
  }));
  on('GET', /^\/admin\/api\/users\/(\d+)$/, g((req, res, m) => {
    const u = userDetail(+m[1]);
    u ? json(res, 200, { ok: true, user: u }) : json(res, 404, { ok: false, error: 'not_found' });
  }));
  on('POST', /^\/admin\/api\/users\/(\d+)\/access$/, g(async (req, res, m) => {
    const { plan } = await readBody(req);
    if (!['week', 'year', 'forever', 'free'].includes(plan)) return json(res, 400, { ok: false, error: 'bad_plan' });
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(+m[1])) return json(res, 404, { ok: false, error: 'not_found' });
    setAccess(+m[1], plan);
    json(res, 200, { ok: true, user: userDetail(+m[1]) });
  }));

  // колесо: отчёт и веса секторов (действуют сразу, без выкладки приложения)
  on('GET', /^\/admin\/api\/wheel$/, g((req, res) => json(res, 200, { ok: true, ...wheelReport() })));
  on('POST', /^\/admin\/api\/wheel$/, g(async (req, res) => {
    const { kind, weights } = await readBody(req);
    if (!WHEEL[kind] || !weights || typeof weights !== 'object') return json(res, 400, { ok: false, error: 'bad_request' });
    const vals = Object.values(weights).map(Number);
    if (vals.some(v => !Number.isFinite(v) || v < 0) || !vals.some(v => v > 0)) return json(res, 400, { ok: false, error: 'Шансы — числа от 0, хотя бы один больше нуля' });
    for (const [code, w] of Object.entries(weights)) setWheelWeight(kind, code, +w);
    json(res, 200, { ok: true, ...wheelReport() });
  }));

  // база идей клиента — только просмотр (правится в Excel и импортируется скриптом)
  on('GET', /^\/admin\/api\/bank$/, g((req, res) => json(res, 200, { ok: true, items: ideasDb() })));

  // промокоды
  on('GET', /^\/admin\/api\/promo$/, g((req, res) => json(res, 200, { ok: true, ...promoReport() })));
  on('POST', /^\/admin\/api\/promo$/, g(async (req, res) => {
    const b = await readBody(req);
    const code = str(b.code, 32).toLowerCase();
    if (!/^[a-z0-9_]{2,32}$/.test(code)) return json(res, 400, { ok: false, error: 'Код — латиница, цифры и _, от 2 до 32 символов' });
    try { db.prepare('INSERT INTO promo_codes (code, title, created_at) VALUES (?, ?, ?)').run(code, str(b.title, 80), Date.now()); }
    catch (e) { return json(res, 409, { ok: false, error: 'Такой промокод уже есть' }); }
    json(res, 200, { ok: true });
  }));
  on('DELETE', /^\/admin\/api\/promo\/([a-z0-9_]+)$/, g((req, res, m) => {
    db.prepare('DELETE FROM promo_codes WHERE code = ?').run(m[1]);
    json(res, 200, { ok: true });
  }));

  // заявки UGC
  on('GET', /^\/admin\/api\/ugc$/, g((req, res) => {
    const rows = db.prepare(`SELECT a.*, u.first_name, u.profile_name, u.username FROM ugc_applications a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY (a.status = 'submitted') DESC, a.created_at DESC`).all();
    json(res, 200, { ok: true, items: rows });
  }));
  on('POST', /^\/admin\/api\/ugc\/([\w-]+)$/, g(async (req, res, m) => {
    const { status } = await readBody(req);
    const done = UGC_DONE[status];
    const app = db.prepare('SELECT * FROM ugc_applications WHERE id = ?').get(m[1]);
    if (!done || !app) return json(res, 400, { ok: false, error: 'bad_request' });
    db.prepare('UPDATE ugc_applications SET status = ?, reviewed_at = ? WHERE id = ?').run(status, Date.now(), app.id);
    if (done.plan) grantEntitlement(app.user_id, done.plan, done.plan === 'forever' ? null : Date.now() + 365 * DAY, 'ugc');
    sendMessage(app.user_id, done.text, { inline_keyboard: [[{ text: '🎁 Открыть Та-дам', web_app: { url: WEBAPP } }]] });
    json(res, 200, { ok: true });
  }));

  // контент: идеи, сторис, друзья бренда — одна схема «список / сохранить (создать или изменить) / удалить»
  const content = (name, table, fields, validate) => {
    on('GET', new RegExp(`^/admin/api/${name}$`), g((req, res) => {
      const rows = db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();
      json(res, 200, { ok: true, items: rows.map(r => ({ ...r, ...(r.recipients !== undefined ? { recipients: list(r.recipients), interests: list(r.interests) } : {}) })) });
    }));
    on('POST', new RegExp(`^/admin/api/${name}$`), g(async (req, res) => {
      const b = await readBody(req);
      const row = fields(b);
      const err = validate(row);
      if (err) return json(res, 400, { ok: false, error: err });
      const id = /^[\w-]{1,40}$/.test(b.id || '') ? b.id : 'admin-' + randomUUID().slice(0, 8);
      const cols = Object.keys(row);
      db.prepare(`INSERT INTO ${table} (id, ${cols.join(', ')}, created_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?)
        ON CONFLICT(id) DO UPDATE SET ${cols.map(c => `${c} = excluded.${c}`).join(', ')}`)
        .run(id, ...cols.map(c => row[c]), Date.now());
      json(res, 200, { ok: true, id });
    }));
    on('DELETE', new RegExp(`^/admin/api/${name}/([\\w-]+)$`), g((req, res, m) => {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(m[1]);
      json(res, 200, { ok: true });
    }));
  };

  content('ideas', 'admin_ideas', b => ({
    cat: str(b.cat, 20), title: str(b.title, 80), desc: str(b.desc, 140), long_desc: str(b.long || b.desc, 600),
    budget: +b.budget || 0,
    recipients: JSON.stringify((b.recipients || []).filter(x => META.recipients[x])),
    interests: JSON.stringify((b.interests || []).filter(x => META.interests[x])),
    photo: httpUrl(b.photo), buy: httpUrl(b.buy),
    who: str(b.who, 80), tags: str(b.tags, 80), where_to: str(b.where, 80)
  }), r => !META.categories[r.cat] ? 'Выбери повод' : !r.title ? 'Нужно название' : !META.budgets[r.budget] ? 'Выбери бюджет' : null);

  content('stories', 'admin_stories', b => ({
    title: str(b.title, 30), emoji: str(b.emoji, 8) || '✨', bg: META.storyBg[b.bg] ? b.bg : 'mango',
    mascot: META.mascots.includes(b.mascot) ? b.mascot : 'wow',
    slide_title: str(b.slideTitle, 60), slide_text: str(b.slideText, 300),
    cta_label: str(b.ctaLabel, 30), cta_route: META.ctaRoutes[b.ctaRoute] ? b.ctaRoute : 'home',
    cta_param: b.ctaRoute === 'cat' && META.categories[b.ctaParam] ? b.ctaParam : ''
  }), r => !r.title ? 'Нужно название кружка' : !r.slide_title ? 'Нужен заголовок' : !r.slide_text ? 'Нужен текст' : !r.cta_label ? 'Нужен текст кнопки' : null);

  content('friends', 'admin_friends', b => ({
    nick: str(b.nick, 40), platform: str(b.platform, 30), idea: str(b.idea, 80), desc: str(b.desc, 200), link: httpUrl(b.link)
  }), r => !r.nick ? 'Нужен ник' : !r.idea ? 'Нужна идея подарка' : null);
}
