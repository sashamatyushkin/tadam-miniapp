// ── Админка: аналитика + управление контентом ──────────────────────────
// Один служебный раздел вместо отдельного сайта — меньше, что разворачивать
// и поддерживать. Доступ по HTTP Basic Auth (логин/пароль из .env), поэтому
// работает без cookie/сессий и без npm-зависимостей, как и весь остальной сервер.
//
// ВНИМАНИЕ: если ADMIN_USER/ADMIN_PASS не заданы, все /admin* маршруты отключены —
// умышленно, чтобы не оказаться развёрнутым с угадываемыми дефолтными паролем.
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { json, readBody } from './util.js';

const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const ADMIN_ENABLED = !!(ADMIN_USER && ADMIN_PASS);

// Дублирует подписи из js/config.js (RECIPIENTS/INTERESTS/CATEGORIES) — тот же
// осознанный компромисс, что и в server/config.js: сервер не импортирует
// браузерный ES-модуль фронтенда, поэтому список повторён здесь для форм и подписей.
const RECIPIENTS = [
  ['mom', 'Маме'], ['dad', 'Папе'], ['partner', 'Партнёру'],
  ['friend', 'Другу'], ['colleague', 'Коллеге'], ['child', 'Ребёнку']
];
const INTERESTS = [
  ['coffee', 'Кофе'], ['sport', 'Спорт'], ['books', 'Книги'],
  ['beauty', 'Красота'], ['tech', 'Техника'], ['home', 'Дом/уют'], ['travel', 'Путешествия']
];
const CATEGORIES = [
  ['birthday', 'День рождения'], ['newyear', 'Новый год'], ['justso', 'Просто так'],
  ['anniv', 'Годовщина'], ['feb23', '23 февраля'], ['mar8', '8 марта'], ['baby', 'Рождение ребёнка'],
  ['home', 'Новоселье'], ['school', 'Выпускной / 1 сентября'], ['wedding', 'Свадьба'],
  ['colleague', 'Коллеге по работе'], ['kid', 'Ребёнку'], ['jubilee', 'Юбилей']
];
const BUDGETS = [[1000, 'до 1 000 ₽'], [3000, 'до 3 000 ₽'], [5000, 'до 5 000 ₽'], [10000, 'до 10 000 ₽'], [99999, 'дороже 10 000 ₽']];
const STORY_BG = ['ny', 'mango', 'coffee', 'ice', 'purple', 'rose', 'gold'];

function safeList(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

// ── аналитика: считаем прямо из тех данных, что уже синхронизируются с телефонов ──
// Отдельного лога событий на сервере нет — это данные профиля, вишлистов и колеса,
// которые и так приходят в обычной работе приложения.
export function computeStats() {
  const now = Date.now();
  const users = db.prepare('SELECT id, gender, give_to, interests, dream_gift FROM users').all();
  const ents = new Map(db.prepare('SELECT user_id, type, until FROM entitlements').all().map(e => [e.user_id, e]));

  const plan = { free: 0, week: 0, year: 0, forever: 0 };
  const gender = { f: 0, m: 0, x: 0, unknown: 0 };
  const giveTo = {}, interests = {};
  const dreamCounts = {};

  for (const u of users) {
    const e = ents.get(u.id);
    const premium = e && (e.type === 'forever' || (e.until != null && now < e.until));
    plan[premium ? e.type : 'free'] = (plan[premium ? e.type : 'free'] || 0) + 1;
    gender[['f', 'm', 'x'].includes(u.gender) ? u.gender : 'unknown']++;
    for (const g of safeList(u.give_to)) giveTo[g] = (giveTo[g] || 0) + 1;
    for (const i of safeList(u.interests)) interests[i] = (interests[i] || 0) + 1;
    if (u.dream_gift?.trim()) dreamCounts[u.dream_gift.trim()] = (dreamCounts[u.dream_gift.trim()] || 0) + 1;
  }

  const wl = db.prepare('SELECT items_json, dream FROM wishlists WHERE revoked = 0').all();
  const itemCounts = {};
  for (const w of wl) {
    for (const it of safeList(w.items_json)) if (it.title) itemCounts[it.title] = (itemCounts[it.title] || 0) + 1;
    if (w.dream?.trim()) dreamCounts[w.dream.trim()] = (dreamCounts[w.dream.trim()] || 0) + 1;
  }

  const top = (obj, n = 15) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  const spins = db.prepare('SELECT reward_code, COUNT(*) n FROM spin_results GROUP BY reward_code').all();
  const referrals = db.prepare('SELECT COUNT(*) total, SUM(qualified) qualified FROM referrals').get();

  return {
    totalUsers: users.length,
    plan, gender,
    giveTo: top(giveTo), interests: top(interests),
    topDreams: top(dreamCounts), topItems: top(itemCounts),
    spins: Object.fromEntries(spins.map(s => [s.reward_code, s.n])),
    referrals: { total: referrals.total || 0, qualified: referrals.qualified || 0 },
    wishlistsActive: wl.length,
    datesTotal: db.prepare('SELECT COUNT(*) n FROM important_dates').get().n
  };
}

// ── HTTP Basic Auth ──────────────────────────────────────────────────
function checkAuth(req, res) {
  if (!ADMIN_ENABLED) { json(res, 503, { ok: false, error: 'admin_not_configured' }); return false; }
  const h = req.headers.authorization || '';
  const m = /^Basic (.+)$/.exec(h);
  const [u, p] = m ? Buffer.from(m[1], 'base64').toString('utf8').split(':') : [];
  if (u === ADMIN_USER && p === ADMIN_PASS) return true;
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="tadam-admin"', 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Нужен пароль администратора');
  return false;
}

export function mountAdmin(on) {
  const guarded = handler => (req, res, m) => { if (checkAuth(req, res)) return handler(req, res, m); };

  on('GET', /^\/admin\/api\/stats$/, guarded((req, res) => json(res, 200, { ok: true, stats: computeStats() })));

  on('GET', /^\/admin\/api\/ideas$/, guarded((req, res) => {
    const rows = db.prepare('SELECT * FROM admin_ideas ORDER BY created_at DESC').all();
    json(res, 200, { ok: true, items: rows.map(r => ({ ...r, recipients: safeList(r.recipients), interests: safeList(r.interests) })) });
  }));
  on('POST', /^\/admin\/api\/ideas$/, guarded(async (req, res) => {
    const b = await readBody(req);
    if (!b.cat || !b.title || !b.budget) return json(res, 400, { ok: false, error: 'missing_fields' });
    const id = b.id || 'admin-' + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO admin_ideas (id, cat, title, desc, long_desc, budget, recipients, interests, photo, buy, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET cat=excluded.cat, title=excluded.title, desc=excluded.desc, long_desc=excluded.long_desc,
        budget=excluded.budget, recipients=excluded.recipients, interests=excluded.interests, photo=excluded.photo, buy=excluded.buy
    `).run(id, b.cat, b.title, b.desc || '', b.long || b.desc || '', +b.budget,
      JSON.stringify(b.recipients || []), JSON.stringify(b.interests || []), b.photo || '', b.buy || '', Date.now());
    json(res, 200, { ok: true, id });
  }));
  on('DELETE', /^\/admin\/api\/ideas\/([\w-]+)$/, guarded((req, res, m) => {
    db.prepare('DELETE FROM admin_ideas WHERE id = ?').run(m[1]);
    json(res, 200, { ok: true });
  }));

  on('GET', /^\/admin\/api\/stories$/, guarded((req, res) => {
    json(res, 200, { ok: true, items: db.prepare('SELECT * FROM admin_stories ORDER BY created_at DESC').all() });
  }));
  on('POST', /^\/admin\/api\/stories$/, guarded(async (req, res) => {
    const b = await readBody(req);
    if (!b.title || !b.slideTitle || !b.slideText || !b.ctaLabel) return json(res, 400, { ok: false, error: 'missing_fields' });
    const id = b.id || 'admin-' + randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO admin_stories (id, title, emoji, bg, mascot, slide_title, slide_text, cta_label, cta_route, cta_param, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, emoji=excluded.emoji, bg=excluded.bg, mascot=excluded.mascot,
        slide_title=excluded.slide_title, slide_text=excluded.slide_text, cta_label=excluded.cta_label,
        cta_route=excluded.cta_route, cta_param=excluded.cta_param
    `).run(id, b.title, b.emoji || '✨', b.bg || 'mango', b.mascot || 'wow', b.slideTitle, b.slideText,
      b.ctaLabel, b.ctaRoute || 'home', b.ctaParam || '', Date.now());
    json(res, 200, { ok: true, id });
  }));
  on('DELETE', /^\/admin\/api\/stories\/([\w-]+)$/, guarded((req, res, m) => {
    db.prepare('DELETE FROM admin_stories WHERE id = ?').run(m[1]);
    json(res, 200, { ok: true });
  }));

  on('GET', /^\/admin$/, guarded((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPage());
  }));
}

// Опции для <select multiple>/чипов в формах — рисуем один раз в разметке страницы.
const opts = (list, name) => list.map(([id, label]) =>
  `<label class="chip"><input type="checkbox" name="${name}" value="${id}"><span>${label}</span></label>`).join('');
const selectOpts = list => list.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');

function renderPage() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Та-дам · админка</title>
<style>
:root{--mango:#F74101;--mango-dark:#D93700;--oat:#FBF3E8;--coffee:#702720;--ice:#CBE5FE;--surface:#fff;--line:#EADDCB;--muted:#8a6f61}
*{box-sizing:border-box}
body{margin:0;background:var(--oat);color:var(--coffee);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:0 0 60px}
h1{font-size:22px;margin:0}
h2{font-size:16px;margin:0 0 12px}
header{background:linear-gradient(160deg,#F74101,#FF7A3D);color:#fff;padding:20px 20px 26px}
header p{margin:4px 0 0;opacity:.9;font-size:13px}
.wrap{max-width:960px;margin:-14px auto 0;padding:0 16px}
.tabs{display:flex;gap:8px;margin-bottom:16px}
.tab{background:var(--surface);color:var(--coffee);border:1px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer;font-weight:700;font-size:13px}
.tab.on{background:var(--mango);color:#fff;border-color:var(--mango)}
.panel{display:none}.panel.on{display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px}
.card .num{font-size:28px;font-weight:800;color:var(--mango-dark)}
.card .lbl{font-size:12px;color:var(--muted);margin-top:2px}
.bars{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:14px}
.bar-row{display:grid;grid-template-columns:110px 1fr 46px;align-items:center;gap:8px;margin:7px 0;font-size:13px}
.bar-row .track{background:#F2E6D5;border-radius:6px;height:14px;overflow:hidden}
.bar-row .fill{background:var(--mango);height:100%;border-radius:6px}
.bar-row .n{text-align:right;color:var(--muted);font-size:12px}
.empty-note{color:var(--muted);font-size:13px}
form.card{display:grid;gap:8px;margin-bottom:16px}
form.card input[type=text],form.card input[type=number],form.card input[type=url],form.card textarea,form.card select{
  width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;background:#fff}
form.card label.lbl{font-size:12px;font-weight:700;color:var(--muted);margin-top:4px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;background:#fff}
.chip input{margin-right:4px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
button{background:var(--mango-dark);color:#fff;border:0;border-radius:8px;padding:9px 16px;cursor:pointer;font:inherit;font-weight:700}
button.tab{background:var(--surface);color:var(--coffee);border:1px solid var(--line);border-radius:999px;font-size:13px}
button.tab.on{background:var(--mango);color:#fff;border-color:var(--mango)}
.list-item{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;margin-bottom:8px}
.list-item .t{flex:1;min-width:0}
.list-item .t b{display:block;font-size:13px}
.list-item .t span{font-size:12px;color:var(--muted)}
.list-item button{background:#F2E6D5;color:#B3341A;padding:6px 10px;font-size:12px}
</style></head><body>
<header><h1>🎁 Та-дам · админка</h1><p>Аналитика и контент, без выхода из этого окна</p></header>
<div class="wrap">
  <div class="tabs">
    <button class="tab on" data-tab="stats">Аналитика</button>
    <button class="tab" data-tab="ideas">Идеи подарков</button>
    <button class="tab" data-tab="stories">Сторис</button>
  </div>

  <div class="panel on" id="p-stats"><div id="statsBody">Загрузка…</div></div>

  <div class="panel" id="p-ideas">
    <form class="card" id="ideaForm">
      <h2>Добавить идею подарка</h2>
      <input type="hidden" name="id">
      <label class="lbl">Повод</label><select name="cat" required>${selectOpts(CATEGORIES)}</select>
      <div class="row2">
        <div><label class="lbl">Название</label><input type="text" name="title" required maxlength="80"></div>
        <div><label class="lbl">Бюджет</label><select name="budget" required>${selectOpts(BUDGETS)}</select></div>
      </div>
      <label class="lbl">Короткое описание</label><input type="text" name="desc" maxlength="140">
      <label class="lbl">Подробное описание (в карточке идеи)</label><textarea name="long" rows="2"></textarea>
      <label class="lbl">Кому</label><div class="chips">${opts(RECIPIENTS, 'recipients')}</div>
      <label class="lbl">Интересы</label><div class="chips">${opts(INTERESTS, 'interests')}</div>
      <div class="row2">
        <div><label class="lbl">Фото (URL, необязательно)</label><input type="url" name="photo"></div>
        <div><label class="lbl">Ссылка «где купить» (необязательно)</label><input type="url" name="buy"></div>
      </div>
      <button type="submit">Добавить идею</button>
    </form>
    <div id="ideasList"></div>
  </div>

  <div class="panel" id="p-stories">
    <form class="card" id="storyForm">
      <h2>Добавить сторис</h2>
      <input type="hidden" name="id">
      <div class="row2">
        <div><label class="lbl">Название (в кружке, коротко)</label><input type="text" name="title" required maxlength="30"></div>
        <div><label class="lbl">Эмодзи кружка</label><input type="text" name="emoji" maxlength="4" value="✨"></div>
      </div>
      <div class="row2">
        <div><label class="lbl">Фон</label><select name="bg">${selectOpts(STORY_BG.map(b => [b, b]))}</select></div>
        <div><label class="lbl">Маскот</label><select name="mascot">${selectOpts(['wave', 'think', 'heart', 'notes', 'wow', 'cool', 'sleep', 'search', 'run', 'bubble', 'alert', 'peek'].map(m => [m, m]))}</select></div>
      </div>
      <label class="lbl">Заголовок слайда</label><input type="text" name="slideTitle" required maxlength="60">
      <label class="lbl">Текст слайда</label><textarea name="slideText" rows="3" required></textarea>
      <div class="row2">
        <div><label class="lbl">Текст кнопки</label><input type="text" name="ctaLabel" required maxlength="30"></div>
        <div><label class="lbl">Куда ведёт (повод, если «Открыть повод»)</label>
          <select name="ctaRoute"><option value="cat">Открыть повод</option><option value="wishlist">Вишлист</option><option value="wheel">Колесо</option><option value="paywall">Premium</option><option value="me">Профиль</option><option value="home">Главная</option></select>
        </div>
      </div>
      <label class="lbl">Id повода (если выбрано «Открыть повод»)</label><select name="ctaParam">${selectOpts(CATEGORIES)}</select>
      <button type="submit">Добавить сторис</button>
    </form>
    <div id="storiesList"></div>
  </div>
</div>
<script>
// location.origin — без логина/пароля: если админка открыта ссылкой вида https://user:pass@..., относительный fetch в Chrome падает
const API = location.origin;
const RCP = ${JSON.stringify(Object.fromEntries(RECIPIENTS))};
const INT = ${JSON.stringify(Object.fromEntries(INTERESTS))};
const CAT = ${JSON.stringify(Object.fromEntries(CATEGORIES))};

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); document.getElementById('p-' + t.dataset.tab).classList.add('on');
});

function bar(label, n, max) {
  const w = max ? Math.round(n / max * 100) : 0;
  return '<div class="bar-row"><div>' + label + '</div><div class="track"><div class="fill" style="width:' + w + '%"></div></div><div class="n">' + n + '</div></div>';
}
function barsBlock(title, entries, labelMap) {
  if (!entries.length) return '<div class="bars"><h2>' + title + '</h2><div class="empty-note">Пока нет данных</div></div>';
  const max = Math.max(...entries.map(e => e[1]));
  return '<div class="bars"><h2>' + title + '</h2>' + entries.map(([k, n]) => bar(labelMap ? (labelMap[k] || k) : k, n, max)).join('') + '</div>';
}

async function loadStats() {
  const r = await fetch(API + '/admin/api/stats').then(x => x.json());
  const s = r.stats;
  const planLabel = { free: 'Бесплатно', week: 'Неделя', year: 'Год', forever: 'Навсегда' };
  const genderLabel = { f: 'Женский', m: 'Мужской', x: 'Не указал', unknown: 'Не заполнено' };
  document.getElementById('statsBody').innerHTML =
    '<div class="grid">' +
      '<div class="card"><div class="num">' + s.totalUsers + '</div><div class="lbl">Пользователей</div></div>' +
      '<div class="card"><div class="num">' + (s.plan.week + s.plan.year + s.plan.forever) + '</div><div class="lbl">С premium</div></div>' +
      '<div class="card"><div class="num">' + s.wishlistsActive + '</div><div class="lbl">Активных вишлистов</div></div>' +
      '<div class="card"><div class="num">' + s.referrals.qualified + '</div><div class="lbl">Приглашённых друзей</div></div>' +
    '</div>' +
    barsBlock('Тариф', Object.entries(s.plan).filter(e => e[1] > 0), planLabel) +
    barsBlock('Кому чаще всего дарят', s.giveTo, RCP) +
    barsBlock('Интересы получателей', s.interests, INT) +
    barsBlock('Пол пользователей', Object.entries(s.gender).filter(e => e[1] > 0), genderLabel) +
    barsBlock('Что чаще всего добавляют в вишлист', s.topItems) +
    barsBlock('Подарки мечты (что хотят себе)', s.topDreams) +
    barsBlock('Призы колеса', Object.entries(s.spins));
}

async function loadIdeas() {
  const r = await fetch(API + '/admin/api/ideas').then(x => x.json());
  document.getElementById('ideasList').innerHTML = r.items.map(i =>
    '<div class="list-item"><div class="t"><b>' + esc(i.title) + '</b><span>' + esc(CAT[i.cat] || i.cat) + ' · до ' + i.budget + ' ₽</span></div><button data-del-idea="' + i.id + '">Удалить</button></div>'
  ).join('') || '<div class="empty-note">Пока нет ни одной идеи из админки</div>';
  document.querySelectorAll('[data-del-idea]').forEach(b => b.onclick = async () => {
    if (!confirm('Удалить идею?')) return;
    await fetch(API + '/admin/api/ideas/' + b.dataset.delIdea, { method: 'DELETE' });
    loadIdeas();
  });
}
async function loadStories() {
  const r = await fetch(API + '/admin/api/stories').then(x => x.json());
  document.getElementById('storiesList').innerHTML = r.items.map(s =>
    '<div class="list-item"><div class="t"><b>' + esc(s.emoji) + ' ' + esc(s.title) + '</b><span>' + esc(s.slide_title) + '</span></div><button data-del-story="' + s.id + '">Удалить</button></div>'
  ).join('') || '<div class="empty-note">Пока нет ни одной сторис из админки</div>';
  document.querySelectorAll('[data-del-story]').forEach(b => b.onclick = async () => {
    if (!confirm('Удалить сторис?')) return;
    await fetch(API + '/admin/api/stories/' + b.dataset.delStory, { method: 'DELETE' });
    loadStories();
  });
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.getElementById('ideaForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    cat: f.get('cat'), title: f.get('title'), budget: +f.get('budget'),
    desc: f.get('desc') || '', long: f.get('long') || '',
    recipients: f.getAll('recipients'), interests: f.getAll('interests'),
    photo: f.get('photo') || '', buy: f.get('buy') || ''
  };
  await fetch(API + '/admin/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  e.target.reset(); loadIdeas();
};
document.getElementById('storyForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    title: f.get('title'), emoji: f.get('emoji') || '✨', bg: f.get('bg'), mascot: f.get('mascot'),
    slideTitle: f.get('slideTitle'), slideText: f.get('slideText'),
    ctaLabel: f.get('ctaLabel'), ctaRoute: f.get('ctaRoute'), ctaParam: f.get('ctaRoute') === 'cat' ? f.get('ctaParam') : ''
  };
  await fetch(API + '/admin/api/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  e.target.reset(); loadStories();
};

loadStats(); loadIdeas(); loadStories();
</script>
</body></html>`;
}
