// ── Подборка идей: фильтры, пагинация, paywall, пустое состояние ─────
import { CATEGORIES, RECIPIENTS, BUDGETS, INTERESTS, CONFIG } from '../config.js';
import { IDEAS, IDEAS_BY_CAT } from '../data/ideas.js';
import { state, isPremium, categoryOpen, track, inWishlist, addToWishlist, defaultWishlist, save } from '../store.js';
import { esc, mascot, sheet, toast, closeSheet } from '../ui.js';
import { tg } from '../tg.js';
import { go, back } from '../app.js';
import { openHint } from './hint.js';

let f = { rec: null, budget: null, interest: null };
let query = '';

const PAGE = 20;
let shown = PAGE;

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

function ideaRow(i, n) {
  const b = BUDGETS.find(x => x.id === i.budget);
  return `
    <div class="idea" data-idea="${i.id}">
      <div class="idea__num">${n}</div>
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
  if (!categoryOpen(cat)) return { html: '', mount: () => go('paywall', { from: 'category', cat: id }, true) };

  const all = IDEAS_BY_CAT[id] || [];
  const premium = isPremium();
  const limited = premium ? all : all.slice(0, CONFIG.limits.freeIdeasPerCategory);
  const list = apply(limited);
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
      <div class="wrap">
        ${list.length ? visible.map((i, n) => ideaRow(i, n + 1)).join('') : emptyBlock()}
        ${list.length > shown ? '<button class="btn btn--soft" id="more" style="margin-top:14px">Показать ещё</button>' : ''}
        ${(!premium && list.length) ? `
          <div class="info center" style="margin-top:18px">
            <div class="bups" style="font-size:20px;color:#173F63">та-дам! ещё ${Math.max(20, 40 - CONFIG.limits.freeIdeasPerCategory)} идей</div>
            <p class="small" style="margin:8px 0 14px">Ты посмотрел ${CONFIG.limits.freeIdeasPerCategory} бесплатных. Открой все идеи и фильтры.</p>
            <button class="btn" id="pw">Открыть за 149 ₽</button>
          </div>` : ''}
        <div class="spacer"></div>
      </div>`,
    mount: (app) => mountList(app, id, premium)
  };
}

export function renderSearch() {
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
  sheet(`
    <div class="stack">
      <div class="idea__tags">
        <span class="tag tag--budget">${esc(b.name)}</span>
        ${i.recipients.map(r => `<span class="tag">${esc(RECIPIENTS.find(x => x.id === r)?.name || r)}</span>`).join('')}
      </div>
      <h3 class="h1">${esc(i.title)}</h3>
      <p class="muted">${esc(i.desc)}</p>
      <button class="btn" id="fav">${inWishlist(i.id) ? 'Уже в вишлисте' : 'В вишлист 💖'}</button>
      <button class="btn btn--soft" id="hint">Намекнуть другу 💌</button>
    </div>`, (el, close) => {
    el.querySelector('#fav').onclick = () => {
      if (inWishlist(i.id)) return toast('Уже в вишлисте');
      addToWishlist(defaultWishlist(), { ideaId: i.id, title: i.title, desc: i.desc });
      tg.haptic('success'); toast('Та-дам! Идея в вишлисте 🎁'); close();
    };
    el.querySelector('#hint').onclick = () => { close(); openHint({ ideaId: i.id, title: i.title, desc: i.desc }); };
  });
}
