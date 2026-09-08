// ── Вишлисты: свой список, шеринг и намёки ───────────────────────────
import { state, save, track, createWishlist, removeItem, wishlistLimit, isPremium } from '../store.js';
import { deepLink } from '../config.js';
import { esc, mascot, sheet, toast, confirmSheet } from '../ui.js';
import { tg } from '../tg.js';
import { go, back } from '../app.js';
import { openHint } from './hint.js';

export function render() {
  const wls = state.wishlists;
  if (wls.length === 1) return renderOne({ id: wls[0].id, tab: true });

  return {
    tab: 'wishlist',
    html: `
      <div class="wrap center" style="padding-top:10px">
        ${mascot('heart', 'mascot--md')}
        <h1 class="bups" style="font-size:26px;color:var(--mango)">мой вишлист</h1>
        <p class="muted small">Собери желания и намекни близким</p>
      </div>
      <div class="wrap" style="margin-top:16px">
        ${wls.length ? `<div class="rows">${wls.map(w => `
          <button class="row" data-wl="${w.id}">
            <span class="row__ico">💖</span>
            <span class="row__t">${esc(w.title)}</span>
            <span class="row__v">${w.items.length}</span>
            <span class="row__chev">›</span>
          </button>`).join('')}</div>`
        : `<div class="empty">${mascot('sleep', 'mascot--lg')}<h3 class="h2">Тут пока пусто</h3><p class="muted small">Сохрани первую идею из подборки</p></div>`}
        <div class="spacer"></div>
        <button class="btn btn--soft" id="new">Новый вишлист</button>
        <p class="small muted center" style="margin-top:8px">${isPremium() ? 'Premium: безлимит вишлистов' : `Осталось слотов: ${Math.max(0, wishlistLimit() - wls.length)} из ${wishlistLimit()}`}</p>
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-wl]').forEach(b => b.onclick = () => go('wl', { id: b.dataset.wl }));
      app.querySelector('#new').onclick = newWishlist;
    }
  };
}

function newWishlist() {
  if (state.wishlists.length >= wishlistLimit()) {
    track('premium_limit_reached', { kind: 'wishlists' });
    return go('paywall', { from: 'wishlist_limit' });
  }
  sheet(`
    <div class="stack">
      <h3 class="h2">Новый вишлист</h3>
      <div class="field"><label>Название</label><input id="t" placeholder="Например, на день рождения" maxlength="40"></div>
      <button class="btn" id="ok">Создать</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = () => {
      const t = el.querySelector('#t').value.trim() || 'Мой вишлист';
      const wl = createWishlist(t);
      close(); go('wl', { id: wl.id });
    };
  });
}

export function renderOne({ id, tab }) {
  const wl = state.wishlists.find(w => w.id === id);
  if (!wl) return { html: '<div class="wrap"><p>Вишлист не найден</p></div>' };

  return {
    tab: tab ? 'wishlist' : undefined,
    html: `
      <div class="wrap center" style="padding-top:10px">
        ${mascot('heart', 'mascot--md')}
        <h1 class="bups" style="font-size:26px;color:var(--mango)">${esc(wl.title)}</h1>
        <p class="muted small">Собери желания и намекни близким</p>
      </div>
      <div class="wrap" style="margin-top:14px">
        ${wl.items.length ? `<div class="rows">${wl.items.map(it => `
          <div class="row" data-item="${it.id}">
            <span class="row__ico">🎁</span>
            <span class="row__t">${esc(it.title)}<div class="small muted" style="font-weight:400">${esc(it.desc || '')}</div></span>
            <button class="idea__fav" data-hint="${it.id}">💌</button>
            <button class="idea__fav" data-del="${it.id}">✕</button>
          </div>`).join('')}</div>`
        : `<div class="empty">${mascot('sleep', 'mascot--md')}<h3 class="h2">Пока пусто</h3><p class="muted small">Добавь своё желание или сохрани идею из подборки</p></div>`}

        <div class="spacer"></div>
        <button class="btn" id="hintAll">💌 Намекнуть другу</button>
        <div class="spacer"></div>
        <button class="btn btn--soft" id="add">Добавить своё желание</button>
        <div class="spacer"></div>
        <button class="btn btn--ghost" id="share">${wl.shared ? 'Ссылка активна · управлять' : 'Поделиться ссылкой'}</button>
      </div>`,
    mount(app) {
      app.querySelector('#add').onclick = () => addOwn(wl);
      app.querySelector('#hintAll').onclick = () => {
        const first = wl.items[0];
        if (!first) return toast('Сначала добавь хотя бы одно желание');
        openHint({ ideaId: first.ideaId, title: first.title, desc: first.desc, wishlistId: wl.id });
      };
      app.querySelector('#share').onclick = () => shareSheet(wl);
      app.querySelectorAll('[data-del]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        confirmSheet('Удалить желание?', 'Его больше не будет в списке', 'Удалить', () => {
          removeItem(wl, b.dataset.del); go('wl', { id: wl.id }, true);
        });
      });
      app.querySelectorAll('[data-hint]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const it = wl.items.find(x => x.id === b.dataset.hint);
        openHint({ ideaId: it.ideaId, title: it.title, desc: it.desc, wishlistId: wl.id });
      });
    }
  };
}

function addOwn(wl) {
  sheet(`
    <div class="stack">
      <h3 class="h2">Своё желание</h3>
      <div class="field"><label>Что хочешь?</label><input id="t" placeholder="Плёночный фотоаппарат" maxlength="60"></div>
      <div class="field"><label>Уточнение</label><input id="d" placeholder="Можно модель или цвет" maxlength="80"></div>
      <button class="btn" id="ok">Добавить</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = () => {
      const t = el.querySelector('#t').value.trim();
      if (!t) return toast('Напиши, что хочешь');
      wl.items.push({ id: Math.random().toString(36).slice(2, 10), title: t, desc: el.querySelector('#d').value.trim(), addedAt: Date.now() });
      track('own_wish_added', { wl: wl.id });
      save(); close(); tg.haptic('success'); go('wl', { id: wl.id }, true);
    };
  });
}

function shareSheet(wl) {
  const url = deepLink('w_' + wl.shareToken);
  sheet(`
    <div class="stack">
      <h3 class="h2">Ссылка на вишлист</h3>
      <p class="small muted">Ссылка не раскрывает твой Telegram ID. Её можно отозвать в любой момент — старая перестанет открываться.</p>
      <div class="card small" style="word-break:break-all">${esc(url)}</div>
      <button class="btn" id="send">Отправить в Telegram</button>
      <button class="btn btn--soft" id="copy">Скопировать</button>
      <button class="btn btn--ghost" id="revoke">Отозвать и создать новую</button>
    </div>`, (el, close) => {
    el.querySelector('#send').onclick = () => {
      wl.shared = true; save(); track('wishlist_shared', { wl: wl.id });
      tg.share(url, `Мой вишлист в Та-дам: ${wl.title} 🎁`); close();
    };
    el.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('Скопировано'); } catch (e) { toast(url); }
    };
    el.querySelector('#revoke').onclick = () => {
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      wl.shareToken = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
      wl.shared = false; save(); track('share_link_revoked', { wl: wl.id });
      close(); toast('Старая ссылка больше не работает');
    };
  });
}
