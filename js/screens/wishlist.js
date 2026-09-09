// ── Вишлисты: свой список, шеринг и намёки ───────────────────────────
import { state, save, track, createWishlist, removeItem, wishlistLimit, isPremium } from '../store.js?v=2609091153';
import { deepLink } from '../config.js?v=2609091153';
import { esc, mascot, sheet, toast, confirmSheet, plural } from '../ui.js?v=2609091153';
import { IDEAS } from '../data/ideas.js?v=2609091153';
import { cover } from './ideas.js?v=2609091153';
import { tg } from '../tg.js?v=2609091153';
import { go, back } from '../app.js?v=2609091153';
import { maybeShowTips } from './coach.js?v=2609091153';
import { openHint } from './hint.js?v=2609091153';
import { api, apiAvailable } from '../api.js?v=2609091153';


// Пустой вишлист показываем не голой надписью, а примерами: человек сразу видит,
// как список будет выглядеть, когда в нём появятся его желания.
const SAMPLE_IDS = ['birthday-7', 'anniv-6', 'birthday-6'];
function ghostList() {
  const samples = SAMPLE_IDS.map(id => IDEAS.find(i => i.id === id)).filter(Boolean);
  return `
    <div class="ghosts">
      <div class="ghosts__list">
        ${samples.map(i => `
          <div class="ghost">
            ${cover(i, 'cover--thumb')}
            <div class="ghost__t">
              <div class="ghost__name">${esc(i.title)}</div>
              <div class="ghost__sub">${esc(i.desc)}</div>
            </div>
            <span class="ghost__tag">ПРИМЕР</span>
          </div>`).join('')}
      </div>
      <div class="ghosts__cap">
        ${mascot('sleep', 'mascot--sm')}
        <h3 class="h2" style="margin-top:6px">Пока тут пусто</h3>
        <p class="muted small">Вот так список будет выглядеть, когда сохранишь первые идеи</p>
      </div>
    </div>`;
}

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
        : ghostList()}
        <div class="spacer"></div>
        <button class="btn" id="find">Найти первую идею</button>
        <div class="spacer"></div>
        <button class="btn btn--soft" id="new">Новый вишлист</button>
        <p class="small muted center" style="margin-top:8px">${isPremium() ? 'Premium: безлимит вишлистов' : `Осталось слотов: ${Math.max(0, wishlistLimit() - wls.length)} из ${wishlistLimit()}`}</p>
      </div>`,
    mount(app) {
      maybeShowTips('wishlist');
      app.querySelectorAll('[data-wl]').forEach(b => b.onclick = () => go('wl', { id: b.dataset.wl }));
      app.querySelector('#new').onclick = newWishlist;
      app.querySelector('#find')?.addEventListener('click', () => go('home', {}, true));
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
        : ghostList()}

        <div class="spacer"></div>
        <button class="btn" id="hintAll">💌 Намекнуть другу</button>
        <div class="spacer"></div>
        <button class="btn btn--soft" id="add">Добавить своё желание</button>
        <div class="spacer"></div>
        <button class="btn btn--ghost" id="share">${wl.shared ? 'Ссылка активна · управлять' : 'Поделиться ссылкой'}</button>
      </div>`,
    mount(app) {
      if (tab) maybeShowTips('wishlist');
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

// Текст, который увидит близкий. Не «мой вишлист №2», а нормальное человеческое сообщение.
export function shareText(wl) {
  const n = wl.items.length;
  const what = n ? `там уже ${n} ${plural(n, 'идея', 'идеи', 'идей')}` : 'загляни в подборку';
  return `Привет! Слушай, если не знаешь, что мне подарить — вот моя подборка, ${what} 🎁 Переходи и забирай любую`;
}

function shareSheet(wl) {
  const url = deepLink('w_' + wl.shareToken);
  const text = shareText(wl);
  sheet(`
    <div class="stack">
      <h3 class="h2">Поделиться вишлистом</h3>
      <p class="small muted">Вот такое сообщение уйдёт близкому:</p>
      <div class="chat">
        <div class="hintcard" style="margin:0">
          <div class="hintcard__brand">🎁 та-дам</div>
          <div class="hintcard__box">
            <div class="small">${esc(text)}</div>
            <div class="small muted" style="margin-top:6px;word-break:break-all">${esc(url)}</div>
          </div>
        </div>
      </div>
      <p class="small muted">${apiAvailable()
        ? 'Ссылка не раскрывает твой Telegram ID и в любой момент отзывается — старая перестаёт открываться.'
        : 'В этой тестовой сборке backend не запущен: ссылка откроется только у тебя самого. Для настоящей отправки нужен запущенный server (см. README).'}</p>
      <button class="btn" id="send">Отправить в Telegram</button>
      <button class="btn btn--soft" id="copy">Скопировать</button>
      <button class="btn btn--ghost" id="revoke">Отозвать и создать новую</button>
    </div>`, (el, close) => {
    // Публикуем на backend, чтобы ссылка реально открывала список у получателя,
    // а не заглушку. Без backend — просто честно предупреждаем в подписи ниже.
    const syncNow = () => { if (apiAvailable()) api.wishlistSync(wl.shareToken, wl.title, wl.items); };
    el.querySelector('#send').onclick = () => {
      wl.shared = true; save(); track('wishlist_shared', { wl: wl.id });
      syncNow();
      tg.share(url, text); close();
    };
    el.querySelector('#copy').onclick = async () => {
      syncNow();
      try { await navigator.clipboard.writeText(text + '\n' + url); toast('Скопировано'); } catch (e) { toast(url); }
    };
    el.querySelector('#revoke').onclick = () => {
      const oldToken = wl.shareToken;
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      wl.shareToken = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
      wl.shared = false; save(); track('share_link_revoked', { wl: wl.id });
      if (apiAvailable()) api.wishlistRevoke(oldToken); // старая ссылка перестаёт открываться и на сервере
      close(); toast('Старая ссылка больше не работает');
    };
  });
}
