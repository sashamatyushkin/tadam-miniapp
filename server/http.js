// ── HTTP API (голый node:http — без Fastify, см. ADR в db.js) ────────
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db, upsertUser, getEntitlement, isPremiumRow, grantEntitlement } from './db.js';
import { verifyInitData, sendMessage, botCall } from './telegram.js';
import { spinsAvailable, spin } from './wheel.js';
import { PRODUCTS, LIMITS } from './config.js';

const WEBAPP = (process.env.WEBAPP_URL || 'https://sashamatyushkin.github.io/tadam-miniapp/').replace(/\/?$/, '/');

// Разрешённые источники: GitHub Pages (прод-фронтенд) и локальная разработка.
// Список сузится до одного домена, когда появится боевой хостинг.
// На боевом сервере список задаётся переменной ALLOWED_ORIGINS (через запятую) —
// туда вписывается только домен фронтенда. Значения ниже — для локальной разработки.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : ['https://sashamatyushkin.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:5173', 'http://127.0.0.1:5173']);
// Временные туннели cloudflared — только вне production
const ALLOW_TUNNELS = process.env.NODE_ENV !== 'production';
// Выдача premium без оплаты — только для тестов. На проде выключена, пока не подключены Stars.
const ALLOW_TEST_PAYMENTS = process.env.ALLOW_TEST_PAYMENTS === '1';
const MAX_BODY = 64 * 1024; // больше 64 КБ телу запроса у нас взяться неоткуда — отсекаем мусор

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || (ALLOW_TUNNELS && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) { req.destroy(); return {}; }
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return {}; }
}

// initData передаётся в заголовке Authorization: tma <initData> — формат,
// который сама официальная документация Telegram рекомендует для серверной проверки.
function authenticate(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('tma ')) return null;
  const session = verifyInitData(h.slice(4));
  if (!session) return null;
  upsertUser(session.user);
  return session.user;
}

const routes = [];
const on = (method, re, handler) => routes.push({ method, re, handler });

// ── auth ───────────────────────────────────────────────────────────
on('POST', /^\/api\/auth$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  json(res, 200, { ok: true, user: { id: user.id, firstName: user.first_name, username: user.username || null } });
});

// ── доступ ─────────────────────────────────────────────────────────
on('GET', /^\/api\/access$/, (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const ent = getEntitlement(user.id);
  json(res, 200, { ok: true, type: ent.type, until: ent.until, premium: isPremiumRow(ent) });
});

// Выдача доступа — пока имитация оплаты (Stars ещё не подключены), но теперь
// хотя бы честно централизована на сервере, а не только в client-side localStorage.
on('POST', /^\/api\/access\/grant-test$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  if (!ALLOW_TEST_PAYMENTS) return json(res, 403, { ok: false, error: 'test_payments_disabled' }); // иначе любой выдаст себе premium даром
  const { productId } = await readBody(req);
  const p = PRODUCTS[productId];
  if (!p) return json(res, 400, { ok: false, error: 'unknown_product' });
  const type = p.type;
  const until = Date.now() + p.days * 86400000;
  grantEntitlement(user.id, type, until, 'test_purchase:' + productId);
  json(res, 200, { ok: true, type, until });
});

// ── колесо ─────────────────────────────────────────────────────────
on('GET', /^\/api\/wheel\/available$/, (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  json(res, 200, { ok: true, available: spinsAvailable(user.id) });
});

on('POST', /^\/api\/wheel\/spin$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const { idempotencyKey } = await readBody(req);
  const key = idempotencyKey || (user.id + ':' + Date.now()); // клиент обязан прислать свой ключ; это — крайний случай
  const r = spin(user.id, key);
  if (!r.ok) return json(res, 409, r);
  json(res, 200, r);
});

// ── важные даты ────────────────────────────────────────────────────
on('GET', /^\/api\/dates$/, (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const rows = db.prepare('SELECT * FROM important_dates WHERE user_id = ? ORDER BY created_at').all(user.id);
  json(res, 200, { ok: true, dates: rows.map(r => ({ ...r, offsets: JSON.parse(r.offsets) })) });
});

on('POST', /^\/api\/dates$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const b = await readBody(req);
  if (!b.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return json(res, 400, { ok: false, error: 'invalid_date' });
  const id = b.id || randomUUID();
  db.prepare(`
    INSERT INTO important_dates (id, user_id, name, date, relation, type, annual, note, offsets, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, date=excluded.date, relation=excluded.relation,
      type=excluded.type, annual=excluded.annual, note=excluded.note, offsets=excluded.offsets
  `).run(id, user.id, b.name, b.date, b.relation || '', b.type || 'birthday', b.annual === false ? 0 : 1,
         b.note || '', JSON.stringify(b.offsets || [14, 7, 3, 1]), Date.now());
  json(res, 200, { ok: true, id });
});

on('DELETE', /^\/api\/dates\/([\w-]+)$/, (req, res, m) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  db.prepare('DELETE FROM important_dates WHERE id = ? AND user_id = ?').run(m[1], user.id); // владельца проверяем — иначе IDOR
  json(res, 200, { ok: true });
});

// ── вишлисты: публичный просмотр решает проблему «намёк ведёт в пустышку» ──
on('POST', /^\/api\/wishlist\/sync$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const b = await readBody(req);
  if (!b.token || !Array.isArray(b.items)) return json(res, 400, { ok: false, error: 'invalid_payload' });

  const existing = db.prepare('SELECT owner_id FROM wishlists WHERE token = ?').get(b.token);
  if (existing && existing.owner_id !== user.id) return json(res, 403, { ok: false, error: 'not_owner' }); // чужой токен не перезаписать

  // Ссылку «где купить» пропускаем только http(s): её откроет чужой человек
  const safeLink = v => { try { const u = new URL(String(v || '')); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : ''; } catch (e) { return ''; } };
  const items = b.items.slice(0, 100).map(i => ({ title: String(i.title || '').slice(0, 80), desc: String(i.desc || '').slice(0, 200), link: safeLink(i.link) }));
  db.prepare(`
    INSERT INTO wishlists (token, owner_id, title, items_json, dream, revoked, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(token) DO UPDATE SET title=excluded.title, items_json=excluded.items_json, dream=excluded.dream, revoked=0, updated_at=excluded.updated_at
  `).run(b.token, user.id, String(b.title || 'Мой вишлист').slice(0, 60), JSON.stringify(items), String(b.dream || '').slice(0, 60), Date.now());
  json(res, 200, { ok: true });
});

on('POST', /^\/api\/wishlist\/revoke$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const { token } = await readBody(req);
  db.prepare('UPDATE wishlists SET revoked = 1 WHERE token = ? AND owner_id = ?').run(token, user.id);
  json(res, 200, { ok: true });
});

// Публичный — без initData: именно эту ссылку открывает получатель намёка,
// у которого своей сессии в Mini App может ещё не быть. Владелец не раскрывается.
on('GET', /^\/api\/wishlist\/([\w-]+)$/, (req, res, m) => {
  const row = db.prepare('SELECT title, items_json, dream, revoked FROM wishlists WHERE token = ?').get(m[1]);
  if (!row || row.revoked) return json(res, 404, { ok: false, error: 'not_found' });
  json(res, 200, { ok: true, title: row.title, items: JSON.parse(row.items_json), dream: row.dream || '' });
});

// ── профиль: данные о пользователе для продукта и понимания аудитории ──
on('POST', /^\/api\/profile$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const b = await readBody(req);
  const list = v => JSON.stringify((Array.isArray(v) ? v : []).map(String).slice(0, 10));
  const gender = ['f', 'm', 'x'].includes(b.gender) ? b.gender : null;
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(b.birthDate || '') ? b.birthDate : null;
  db.prepare(`UPDATE users SET profile_name = ?, gender = ?, birth_date = ?, give_to = ?, interests = ?, profile_updated_at = ? WHERE id = ?`)
    .run(String(b.name || '').slice(0, 30), gender, birth, list(b.giveTo), list(b.interests), Date.now(), user.id);
  json(res, 200, { ok: true });
});

// ── приглашения ─────────────────────────────────────────────────────
// Код генерирует клиент, но закрепляет за пользователем сервер: первый код
// остаётся навсегда, и с другого устройства клиент получит тот же.
on('POST', /^\/api\/referral\/register$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const { code } = await readBody(req);
  let row = db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').get(user.id);
  if (!row && /^r[a-f0-9]{8}$/.test(code || '')) {
    try { db.prepare('INSERT INTO referral_codes (code, user_id) VALUES (?, ?)').run(code, user.id); row = { code }; }
    catch (e) { /* код занят другим пользователем — вернём ошибку ниже */ }
  }
  if (!row) return json(res, 422, { ok: false, error: 'code_taken' });
  const invited = db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND qualified = 1').get(user.id).n;
  json(res, 200, { ok: true, code: row.code, invited });
});

// Приглашённый прошёл первый шаг онбординга. Засчитываем, только если:
// код существует, это не сам пригласивший, человек новый (появился в базе не раньше
// суток назад) и ещё ни разу не был засчитан, а у пригласившего не больше 5 друзей за сутки.
on('POST', /^\/api\/referral\/claim$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const { code } = await readBody(req);
  const owner = db.prepare('SELECT user_id FROM referral_codes WHERE code = ?').get(code || '');
  if (!owner) return json(res, 422, { ok: false, error: 'unknown_code' });
  if (owner.user_id === user.id) return json(res, 422, { ok: false, error: 'self' });
  if (db.prepare('SELECT 1 FROM referrals WHERE user_id = ?').get(user.id)) return json(res, 422, { ok: false, error: 'already_claimed' });
  const me = db.prepare('SELECT created_at FROM users WHERE id = ?').get(user.id);
  if (!me || Date.now() - me.created_at > 86400000) return json(res, 422, { ok: false, error: 'not_new_user' });
  const dayAgo = Date.now() - 86400000;
  const today = db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND qualified = 1 AND created_at > ?').get(owner.user_id, dayAgo).n;
  const qualified = today < LIMITS.referralSpinsPerDay ? 1 : 0;

  db.prepare('INSERT INTO referrals (user_id, referrer_id, qualified, created_at) VALUES (?, ?, ?, ?)').run(user.id, owner.user_id, qualified, Date.now());
  if (qualified) {
    db.prepare(`
      INSERT INTO wheel_state (user_id, bonus_spins) VALUES (?, 1)
      ON CONFLICT(user_id) DO UPDATE SET bonus_spins = bonus_spins + 1
    `).run(owner.user_id);
    const name = user.first_name ? user.first_name : 'Друг';
    sendMessage(owner.user_id, `${name} присоединился к Та-дам по твоей ссылке 🎉\nДержи дополнительный спин колеса 🎲`,
      { inline_keyboard: [[{ text: '🎡 Крутить колесо', web_app: { url: WEBAPP } }]] });
  }
  json(res, 200, { ok: true, qualified: !!qualified });
});

// ── приглашение с логотипом ─────────────────────────────────────────
// shareMessage в Mini App умеет отправлять только заранее подготовленное ботом
// сообщение (Bot API 8.0 savePreparedInlineMessage) — так в чат уходит карточка
// с логотипом, текстом и кнопкой, а не голая ссылка.
const INVITE_TEXT = 'Держи бот с вау-идеями на любой повод и для кого угодно 🎁 А ещё можно собирать вишлисты и намекать, что тебе подарить 😏';
on('POST', /^\/api\/share\/invite$/, async (req, res) => {
  const user = authenticate(req);
  if (!user) return json(res, 401, { ok: false, error: 'invalid_init_data' });
  const { link } = await readBody(req);
  if (!/^https:\/\/t\.me\/[\w/]+\?start(app)?=r[a-f0-9]{8}$/.test(link || '')) return json(res, 400, { ok: false, error: 'bad_link' });
  const r = await botCall('savePreparedInlineMessage', {
    user_id: user.id,
    allow_user_chats: true, allow_group_chats: true, allow_channel_chats: false,
    result: {
      type: 'photo', id: 'invite-' + randomUUID().slice(0, 8),
      photo_url: WEBAPP + 'assets/img/share-invite.jpg', thumbnail_url: WEBAPP + 'assets/img/share-invite.jpg',
      caption: INVITE_TEXT,
      reply_markup: { inline_keyboard: [[{ text: '🎁 Открыть Та-дам', url: link }]] }
    }
  });
  if (!r.ok) return json(res, 502, { ok: false, error: r.description || 'telegram_error' });
  json(res, 200, { ok: true, id: r.result.id });
});

on('GET', /^\/(api\/health)?$/, (req, res) => json(res, 200, { ok: true, service: 'tadam-server' }));

export function startHttp(port) {
  const server = createServer(async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!route) return json(res, 404, { ok: false, error: 'not_found' });
    try {
      await route.handler(req, res, url.pathname.match(route.re));
    } catch (e) {
      console.error('[http] handler error', e);
      json(res, 500, { ok: false, error: 'internal' });
    }
  });
  server.listen(port, () => console.log(`[http] API слушает на http://localhost:${port}`));
  return server;
}
