// ── Подборка идей: фильтры, пагинация, paywall, пустое состояние ─────
import { CATEGORIES, RECIPIENTS, BUDGETS, INTERESTS, CONFIG } from '../config.js?v=2609091241';
import { IDEAS, IDEAS_BY_CAT } from '../data/ideas.js?v=2609091241';
import { state, isPremium, categoryOpen, track, inWishlist, addToWishlist, defaultWishlist, save, totalWishlistItems } from '../store.js?v=2609091241';
import { esc, mascot, sheet, toast, closeSheet, plural } from '../ui.js?v=2609091241';
import { tg } from '../tg.js?v=2609091241';
import { go, back } from '../app.js?v=2609091241';
import { openHint } from './hint.js?v=2609091241';
import { maybeShowTips, maybeShowTips as _t } from './coach.js?v=2609091241';

// f/query/shown осознанно живут на уровне модуля — так они переживают повторный рендер
// одной и той же категории при клике по чипу фильтра. Но именно поэтому раньше они же
// «протекали» в другую категорию или в поиск: см. сброс по смене экрана ниже.
let f = { rec: null, budget: null, interest: null };
let query = '';
let lastCatId = null;         // какую категорию рендерили последней

const PAGE = 20;
let shown = PAGE;

// Мягкая персонализация: идеи по интересам профиля поднимаются наверх, но список
// не сужается — в отличие от чип-фильтров, тут нечего «снимать», если промахнулись.
function sortByProfile(list) {
  const my = state.profile.interests;
  if (!my.length) return list;
  return list.map((idea, i) => ({ idea, i, hit: idea.interests.some(x => my.includes(x)) ? 0 : 1 }))
    .sort((a, b) => a.hit - b.hit || a.i - b.i)
    .map(x => x.idea);
}

function apply(list) {
  return list.filter(i =>
    (!f.rec || i.recipients.includes(f.rec)) &&
    (!f.budget || i.budget <= f.budget) &&
    (!f.interest || i.interests.includes(f.interest)) &&
    (!query || (i.title + ' ' + i.desc).toLowerCase().includes(query.toLowerCase()))
  );
}

function chipRow(items, active, kind, locked) {
  return `<div class="chips">
    <button class="chip ${active ? '' : 'chip--on'}" data-f="${kind}:">Все</button>
    ${items.map(i => `<button class="chip ${active === i.id ? 'chip--on' : ''} ${locked ? 'chip--lock' : ''}" data-f="${kind}:${i.id}">${locked ? '🔒 ' : ''}${esc(i.name)}</button>`).join('')}
  </div>`;
}

export function cover(i, cls) {
  const c = CATEGORIES.find(x => x.id === i.cat);
  const bg = i.photo ? '#F2E6D5' : (c?.bg || 'linear-gradient(150deg,#F74101,#FF8A4C)');
  return `<div class="cover ${cls}" style="background:${bg}">${
    i.photo ? `<img src="${esc(i.photo)}" alt="" loading="lazy">` : i.icon
  }</div>`;
}

// Ссылка «где купить»: точная партнёрская, если задана в базе,
// иначе честный поиск по названию — партнёрские ссылки добавляются через админку.
export function buyLink(i) {
  return i.buy
    ? { url: i.buy, label: 'Где купить', exact: true }
    : { url: 'https://yandex.ru/search/?text=' + encodeURIComponent(i.title + ' купить'), label: 'Найти, где купить', exact: false };
}

function ideaRow(i, n) {
  const b = BUDGETS.find(x => x.id === i.budget);
  return `
    <div class="idea" data-idea="${i.id}">
      <div class="idea__num">${n}</div>
      ${cover(i, 'cover--thumb')}
      <div class="idea__body">
        <div class="idea__title">${esc(i.title)}</div>
        <div class="idea__desc">${esc(i.desc)}</div>
        <div class="idea__tags">
          <span class="tag tag--budget">${esc(b.name)}</span>
          ${i.interests.map(id => `<span class="tag tag--ice">${esc(INTERESTS.find(x => x.id === id)?.name || id)}</span>`).join('')}
        </div>
      </div>
      <button class="idea__fav" data-fav="${i.id}">${inWishlist(i.id) ? '❤️' : '🤍'}</button>
    </div>`;
}

function emptyBlock() {
  return `
    <div class="empty">
      ${mascot('sleep', 'mascot--lg')}
      <h3 class="h2">Ой, тут пока пусто</h3>
      <p class="muted small">Давай расширим поиск?</p>
      <div class="spacer"></div>
      <button class="btn" id="reset">Сбросить фильтры</button>
    </div>`;
}

export function render({ id }) {
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat) return { html: '<div class="wrap"><p>Повод не найден</p></div>' };
  if (!categoryOpen(cat)) return {
    html: '', hideNav: false,
    mount: () => { go('home', {}, true); import('./extra.js?v=2609091241').then(m => m.openLockSheet(id)); }
  };

  // Другая категория (или пришли из поиска) — старые фильтры и поисковый запрос не тащим за собой.
  if (id !== lastCatId) {
    f = { rec: null, budget: null, interest: null };
    query = ''; shown = PAGE;
    // Подставляем «кому обычно даришь» из профиля как стартовый фильтр — только premium:
    // у free-пользователя чипы фильтров заблокированы, и молча сузить список без
    // возможности снять фильтр было бы нечестно.
    if (isPremium() && state.profile.giveTo[0] && RECIPIENTS.some(r => r.id === state.profile.giveTo[0])) {
      f.rec = state.profile.giveTo[0];
    }
  }
  lastCatId = id;

  const all = IDEAS_BY_CAT[id] || [];
  const premium = isPremium();
  const limited = premium ? all : all.slice(0, CONFIG.limits.freeIdeasPerCategory);
  // Считаем из фактических данных категории, а не из константы — так «ещё N» никогда
  // не наврёт. Когда появится БД, `all.length` будет приходить уже оттуда.
  const hiddenCount = premium ? 0 : Math.max(0, all.length - limited.length);
  const list = sortByProfile(apply(limited));
  const visible = list.slice(0, shown);
  track('category_impression', { cat: id, count: list.length });
  if (!list.length) track('no_results', { cat: id, filters: f });

  return {
    html: `
      <div class="cat-header">
        <button class="iconbtn" data-back>←</button>
        <div class="bups">${cat.emoji} ${esc(cat.name).replace(/\n/g, ' ')}</div>
      </div>
      ${chipRow(RECIPIENTS, f.rec, 'rec', !premium)}
      ${chipRow(BUDGETS, f.budget, 'budget', !premium)}
      ${chipRow(INTERESTS, f.interest, 'interest', !premium)}
      <div class="wrap" id="ideaList">
        ${list.length ? visible.map((i, n) => ideaRow(i, n + 1)).join('') : emptyBlock()}
        ${list.length > shown ? '<button class="btn btn--soft" id="more" style="margin-top:14px">Показать ещё</button>' : ''}
        ${(!premium && hiddenCount > 0) ? `
          <div class="info center" style="margin-top:18px">
            <div class="bups" style="font-size:20px;color:#173F63">та-дам! ещё ${hiddenCount} ${plural(hiddenCount, 'идея', 'идеи', 'идей')}</div>
            <p class="small" style="margin:8px 0 14px">Ты посмотрел ${limited.length} бесплатных. Открой все идеи и фильтры.</p>
            <button class="btn" id="pw">Открыть за 149 ₽</button>
          </div>` : ''}
        <div class="spacer"></div>
      </div>`,
    mount: (app) => mountList(app, id, premium)
  };
}

export function renderSearch() {
  lastCatId = null;             // возврат в любую категорию после поиска начнётся с чистых фильтров
  const premium = isPremium();
  const openCats = CATEGORIES.filter(c => categoryOpen(c)).map(c => c.id);
  const pool = IDEAS.filter(i => openCats.includes(i.cat) && (premium || i.order < CONFIG.limits.freeIdeasPerCategory));
  const list = query ? apply(pool) : [];

  return {
    html: `
      <div class="topbar">
        <button class="iconbtn" data-back>←</button>
        <div class="search" style="flex:1"><span>🔍</span><input id="q" value="${esc(query)}" placeholder="Найти идею подарка…" autofocus></div>
      </div>
      <div class="wrap" id="res">
        ${!query ? `<p class="muted small center" style="margin-top:24px">Напиши, что ищешь: «кофе», «плед», «фотосессия»</p>`
          : (list.length ? list.slice(0, 30).map((i, n) => ideaRow(i, n + 1)).join('') : emptyBlock())}
      </div>`,
    mount(app) {
      const inp = app.querySelector('#q');
      const res = app.querySelector('#res');
      const redraw = () => {
        const premium2 = isPremium();
        const openCats2 = CATEGORIES.filter(c => categoryOpen(c)).map(c => c.id);
        const pool2 = IDEAS.filter(i => openCats2.includes(i.cat) && (premium2 || i.order < CONFIG.limits.freeIdeasPerCategory));
        const l = query ? apply(pool2) : [];
        res.innerHTML = !query
          ? `<p class="muted small center" style="margin-top:24px">Напиши, что ищешь: «кофе», «плед», «фотосессия»</p>`
          : (l.length ? l.slice(0, 30).map((i, n) => ideaRow(i, n + 1)).join('') : emptyBlock());
        res.querySelector('#reset')?.addEventListener('click', () => { query = ''; inp.value = ''; redraw(); });
        bindCommon(app);
      };
      let t = null;
      inp.oninput = () => { query = inp.value; clearTimeout(t); t = setTimeout(() => { track('search_used', { len: query.length }); redraw(); }, 180); };
      inp.focus();
      bindCommon(app);
    }
  };
}

function mountList(app, catId, premium) {
  maybeShowTips('ideas');
  app.querySelectorAll('[data-f]').forEach(b => {
    b.onclick = () => {
      if (!premium) { track('locked_filter_clicked', {}); tg.haptic('warning'); return go('paywall', { from: 'filters' }); }
      const [kind, val] = b.dataset.f.split(':');
      f[kind] = val ? (kind === 'budget' ? +val : val) : null;
      shown = PAGE;
      track('filter_applied', { kind, val });
      tg.haptic('light');
      go('cat', { id: catId }, true);
    };
  });
  app.querySelector('#more')?.addEventListener('click', () => { shown += PAGE; go('cat', { id: catId }, true); });
  app.querySelector('#pw')?.addEventListener('click', () => go('paywall', { from: 'catalog_limit', cat: catId }));
  app.querySelector('#reset')?.addEventListener('click', () => {
    f = { rec: null, budget: null, interest: null }; query = '';
    track('filter_reset', {});
    go('cat', { id: catId }, true);
  });
  bindCommon(app);
}

function bindCommon(app) {
  app.querySelector('[data-back]')?.addEventListener('click', () => back());
  app.querySelectorAll('[data-fav]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const idea = IDEAS.find(i => i.id === b.dataset.fav);
      const wl = defaultWishlist();
      if (inWishlist(idea.id)) return toast('Уже в вишлисте');
      addToWishlist(wl, { ideaId: idea.id, title: idea.title, desc: idea.desc });
      b.textContent = '❤️';
      tg.haptic('success');
      toast('Та-дам! Идея в вишлисте 🎁');
      if (totalWishlistItems() === 1) maybeShowTips('firstsave');   // первое желание — объясняем, что дальше
    };
  });
  app.querySelectorAll('[data-idea]').forEach(row => {
    row.onclick = () => openIdea(row.dataset.idea);
  });
}

export function openIdea(ideaId) {
  const i = IDEAS.find(x => x.id === ideaId);
  if (!i) return;
  track('gift_idea_opened', { id: i.id });
  const b = BUDGETS.find(x => x.id === i.budget);
  const buy = buyLink(i);
  sheet(`
    <div class="stack">
      ${cover(i, 'cover--big')}
      <div class="idea__tags">
        <span class="tag tag--budget">${esc(b.name)}</span>
        ${i.recipients.map(r => `<span class="tag">${esc(RECIPIENTS.find(x => x.id === r)?.name || r)}</span>`).join('')}
        ${i.interests.map(id => `<span class="tag tag--ice">${esc(INTERESTS.find(x => x.id === id)?.name || id)}</span>`).join('')}
      </div>
      <h3 class="h1">${esc(i.title)}</h3>
      <p class="muted">${esc(i.long || i.desc)}</p>
      <button class="btn" id="fav">${inWishlist(i.id) ? 'Уже в вишлисте' : 'В вишлист 💖'}</button>
      <button class="btn btn--soft" id="hint">Намекнуть другу 💌</button>
      <button class="btn btn--ghost" id="buy">${esc(buy.label)} →</button>
      ${buy.exact ? '' : '<div class="buyline">🔎 откроем поиск по названию</div>'}
    </div>`, (el, close) => {
    el.querySelector('#fav').onclick = () => {
      if (inWishlist(i.id)) return toast('Уже в вишлисте');
      addToWishlist(defaultWishlist(), { ideaId: i.id, title: i.title, desc: i.desc });
      tg.haptic('success'); toast('Та-дам! Идея в вишлисте 🎁'); close();
      if (totalWishlistItems() === 1) maybeShowTips('firstsave');
    };
    el.querySelector('#hint').onclick = () => { close(); openHint({ ideaId: i.id, title: i.title, desc: i.desc }); };
    el.querySelector('#buy').onclick = () => {
      track('buy_link_opened', { id: i.id, exact: buy.exact });
      if (tg.raw?.openLink) tg.raw.openLink(buy.url); else window.open(buy.url, '_blank');
    };
  });
}
