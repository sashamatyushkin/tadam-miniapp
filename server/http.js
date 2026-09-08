// ── HTTP API (голый node:http — без Fastify, см. ADR в db.js) ────────
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { db, upsertUser, getEntitlement, isPremiumRow, grantEntitlement } from './db.js';
import { verifyInitData } from './telegram.js';
import { spinsAvailable, spin } from './wheel.js';
import { PRODUCTS } from './config.js';

// Разрешённые источники: GitHub Pages (прод-фронтенд) и локальная разработка.
// Список сузится до одного домена, когда появится боевой хостинг.
const ALLOWED_ORIGINS = [
  'https://sashamatyushkin.github.io',
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'http://localhost:5173', 'http://127.0.0.1:5173'
];

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin))) {
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
  for await (const c of req) chunks.push(c);
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
  const { productId } = await readBody(req);
  const p = PRODUCTS[productId];
  if (!p) return json(res, 400, { ok: false, error: 'unknown_product' });
  const type = p.days === null ? 'forever' : 'holiday';
  const until = p.days === null ? null : Date.now() + p.days * 86400000;
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

  const items = b.items.slice(0, 100).map(i => ({ title: String(i.title || '').slice(0, 80), desc: String(i.desc || '').slice(0, 200) }));
  db.prepare(`
    INSERT INTO wishlists (token, owner_id, title, items_json, revoked, updated_at) VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(token) DO UPDATE SET title=excluded.title, items_json=excluded.items_json, revoked=0, updated_at=excluded.updated_at
  `).run(b.token, user.id, String(b.title || 'Мой вишлист').slice(0, 60), JSON.stringify(items), Date.now());
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
  const row = db.prepare('SELECT title, items_json, revoked FROM wishlists WHERE token = ?').get(m[1]);
  if (!row || row.revoked) return json(res, 404, { ok: false, error: 'not_found' });
  json(res, 200, { ok: true, title: row.title, items: JSON.parse(row.items_json) });
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
