// ── Квест, paywall, рефералы, UGC, друзья бренда, настройки, намёк ───
import { CONFIG, CATEGORIES, BRAND_FRIENDS, RECIPIENTS, INTERESTS, SOCIAL, DEBUG, deepLink, TELEGRAM, WHEEL, DOCS } from '../config.js?v=2609242257';
import { IDEAS, IDEAS_BY_CAT } from '../data/ideas.js?v=2609242257';
import {
  state, save, track, questSteps, questComplete, issueQuestReward,
  isPremium, isFullPremium, accessLabel, grantAccess, resetAll, resetTips, foreverPrice, setConsent,
  addToWishlist, defaultWishlist, inWishlist, planId, profileFilled, redeemFriendCode
} from '../store.js?v=2609242257';
import { esc, mascot, sheet, toast, confirmSheet, plural } from '../ui.js?v=2609242257';
import { tg } from '../tg.js?v=2609242257';
import { go, back } from '../app.js?v=2609242257';
import { openHint } from './hint.js?v=2609242257';
import { api, apiAvailable } from '../api.js?v=2609242257';

// ── «Заполни и получи» ───────────────────────────────────────────────
export function renderQuest() {
  const steps = questSteps();
  const done = questComplete();
  track('profile_quest_started', {});
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('alert', 'mascot--md')}
        <h1 class="bups" style="font-size:32px;color:var(--mango)">заполни и получи</h1>
        <p class="muted small">Три шага — и premium-категория на 24 часа твоя</p>
      </div>
      <div class="wrap stack" style="margin-top:16px">
        ${steps.map((s, i) => `
          <div class="quest ${s.done ? 'quest--done' : 'quest--todo'}" data-step="${s.key}">
            <div class="quest__mark">${s.done ? '✓' : i + 1}</div>
            <div class="quest__t">${esc(s.title)}</div>
            <div>${s.done ? '✅' : '⭕'}</div>
          </div>`).join('')}
        <div class="info" style="margin-top:6px">
          🎁 Бонус за всё: premium-категория на выбор на 24 часа
        </div>
        ${done ? (state.quest.rewardIssued
          ? '<p class="center small muted">Награда уже выдана — смотри в «Мои награды»</p><button class="btn btn--soft" id="rew">Мои награды</button>'
          : '<button class="btn" id="claim">Забрать бонус</button>')
          : '<p class="center small muted">Осталось совсем немного ✨</p>'}
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
        const k = b.dataset.step;
        if (k === 'profile') go('me', {});
        if (k === 'dates') go('dates', {});
        if (k === 'dream') dreamSheet();
      });
      app.querySelector('#claim')?.addEventListener('click', () => {
        const r = issueQuestReward();
        tg.haptic('success');
        toast(r ? 'Та-дам! Бонус твой 🎁' : 'Бонус уже был выдан');
        go('rewards', {});
      });
      app.querySelector('#rew')?.addEventListener('click', () => go('rewards', {}));
    }
  };
}

function dreamSheet() {
  sheet(`
    <div class="stack">
      <h3 class="h2">Твой подарок мечты</h3>
      <p class="small muted">Пригодится, когда близкие спросят «что тебе подарить?»</p>
      <div class="field"><input id="d" value="${esc(state.profile.dreamGift)}" placeholder="Например, поездка в горы" maxlength="60"></div>
      <button class="btn" id="ok">Сохранить</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = () => {
      state.profile.dreamGift = el.querySelector('#d').value.trim();
      track('quest_step_completed', { step: 'dream' });
      save(); close(); go('quest', {}, true);
    };
  });
}

// ── Мой профиль: данные о человеке ────────────────────────────────────
// Нужны и продукту (подставить фильтры, поздравить в день рождения), и клиенту —
// понимать аудиторию. При запущенном backend сохраняются ещё и на сервер.
const GENDERS = [{ id: 'f', name: 'Женский' }, { id: 'm', name: 'Мужской' }, { id: 'x', name: 'Не скажу' }];

export function renderMe() {
  const pr = state.profile;
  const name = pr.name || tg.user()?.first_name || '';
  const chip = (list, sel, group) => list.map(i =>
    `<button type="button" class="chip ${sel.includes(i.id) ? 'chip--on' : ''}" data-g="${group}" data-v="${i.id}">${esc(i.name)}</button>`).join('');
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('think', 'mascot--sm')}
        <h1 class="bups" style="font-size:32px;color:var(--mango);margin-top:6px">мой профиль</h1>
        <p class="muted small">Минута — и подборки станут точнее</p>
      </div>
      <div class="wrap" style="margin-top:14px">
        <div class="field"><label>Как тебя зовут</label><input id="name" value="${esc(name)}" placeholder="Имя" maxlength="30"></div>
        <div class="field"><label>Пол</label><div class="chipset" id="gender">${chip(GENDERS, [pr.gender], 'gender')}</div></div>
        <div class="field"><label>Дата рождения</label><input id="bd" type="date" value="${esc(pr.birthDate)}" max="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field">
          <label>Кому чаще всего даришь подарки</label>
          <div class="chipset" id="giveTo">${chip(RECIPIENTS, pr.giveTo, 'giveTo')}</div>
        </div>
        <div class="field">
          <label>Что тебе интересно <span class="muted" style="font-weight:400">· по желанию</span></label>
          <div class="chipset" id="interests">${chip(INTERESTS, pr.interests, 'interests')}</div>
        </div>
        <div class="field"><label>Подарок мечты <span class="muted" style="font-weight:400">· по желанию</span></label>
          <input id="dream" value="${esc(pr.dreamGift)}" placeholder="Например, поездка в горы" maxlength="60"></div>
        <button class="btn" id="save">Сохранить</button>
        <p class="small muted center" style="margin-top:10px">Видно только тебе. Используем, чтобы подбирать идеи и поздравить тебя в твой день.</p>
      </div>`,
    mount(app) {
      // Пол — один вариант, остальное — несколько
      app.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        if (b.dataset.g === 'gender') app.querySelectorAll('[data-g="gender"]').forEach(x => x.classList.toggle('chip--on', x === b));
        else b.classList.toggle('chip--on');
        tg.haptic('light');
      });
      app.querySelector('#save').onclick = () => {
        const picked = g => [...app.querySelectorAll(`[data-g="${g}"].chip--on`)].map(x => x.dataset.v);
        const next = {
          name: app.querySelector('#name').value.trim(),
          gender: picked('gender')[0] || '',
          birthDate: app.querySelector('#bd').value,
          giveTo: picked('giveTo'),
          interests: picked('interests'),
          dreamGift: app.querySelector('#dream').value.trim()
        };
        if (!next.name || !next.gender || !next.birthDate || !next.giveTo.length)
          return toast('Заполни имя, пол, дату рождения и кому даришь');
        const wasFilled = profileFilled();
        Object.assign(state.profile, next);
        if (!wasFilled) track('profile_completed', { gender: next.gender, giveTo: next.giveTo.length });
        save();
        if (apiAvailable()) api.profileSave(next);
        tg.haptic('success'); toast('Профиль сохранён ✨');
        back();                                  // туда, откуда пришли: квест, профиль или главная
      };
    }
  };
}

// ── Тарифы: таблица как в «Та-дам тарифы.pdf» ──────────────────────
// Колонки: бесплатно (крючок) · на праздник (кофейная) · навсегда (манго, «выгодно»).
const PLAN_COLS = [
  { id: 'free', name: 'бесплатно', price: '0 ₽', sub: 'крючок' },
  { id: 'week', name: 'на праздник', price: '149 ₽', sub: 'доступ 7 дней' },
  { id: 'forever', name: 'навсегда', price: '490 ₽', sub: 'бессрочно', badge: 'выгодно' }
];
const GOOD = /^(✓|без лимита|полностью)$/;

function compareTable() {
  const cur = planId();
  const fp = foreverPrice();
  const price = c => c.id === 'forever' && fp < 490 ? `<s>490</s> ${fp} ₽` : c.price;
  return `
    <div class="tariff">
      <div class="tariff__row tariff__head">
        <div></div>
        ${PLAN_COLS.map(c => `<div class="tariff__col tariff__col--${c.id}">
          ${c.badge ? `<span class="tariff__badge">${c.badge}</span>` : ''}
          <div class="bups tariff__name">${c.name}</div>
          <div class="bups tariff__price">${price(c)}</div>
          <div class="tariff__sub">${c.sub}</div>
          ${c.id === cur ? '<span class="tariff__now">у тебя</span>' : ''}
        </div>`).join('')}
      </div>
      ${CONFIG.compare.map(([name, hint, ...vals]) => `
        <div class="tariff__row">
          <div class="tariff__label"><b>${esc(name)}</b>${hint ? `<span>${esc(hint)}</span>` : ''}</div>
          ${vals.map((v, k) => `<div class="tariff__cell tariff__cell--${PLAN_COLS[k].id} ${GOOD.test(v) ? 'tariff__cell--good' : ''}">${esc(v)}</div>`).join('')}
        </div>`).join('')}
      <div class="tariff__row tariff__foot">
        <div></div><div></div>
        <div class="tariff__cell tariff__cell--week"><span class="bups">149 ₽</span></div>
        <div class="tariff__cell tariff__cell--forever"><span class="bups">${fp} ₽</span></div>
      </div>
    </div>`;
}

// «Кому 149 ₽ / Кому 490 ₽» — карточки из тарифной сетки клиента
function whoCards() {
  return `<div class="whocards">${CONFIG.products.map(p => `
    <div class="whocard whocard--${p.id}">
      <div class="bups whocard__t">кому ${p.priceRub} ₽</div>
      <p>${esc(p.who)}</p>
    </div>`).join('')}</div>`;
}

// ── Замок повода: сначала объясняем, что внутри, потом ведём на оплату ──
export function openLockSheet(catId) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) return go('paywall', { from: 'category' });
  const list = IDEAS_BY_CAT[catId] || [];
  const teaser = list.slice(0, 3);
  track('locked_category_sheet', { cat: catId });

  sheet(`
    <div class="stack">
      <div class="lockhead" style="background:${cat.bg}">
        <div class="lockhead__emoji">${cat.emoji}</div>
        <div class="bups lockhead__name">${esc(cat.name).replace(/\n/g, ' ')}</div>
        <div class="lockhead__lock">🔒</div>
      </div>
      <p class="muted small center">Внутри ${list.length} ${plural(list.length, 'вау-идея', 'вау-идеи', 'вау-идей')} под этот повод. Вот три из них:</p>
      <div class="peek">
        ${teaser.map(i => `
          <div class="peek__row">
            <div class="peek__ico">${i.icon}</div>
            <div class="peek__t">
              <div class="peek__name">${esc(i.title)}</div>
              <div class="peek__desc">${esc(i.desc)}</div>
            </div>
            <span class="peek__lock">🔒</span>
          </div>`).join('')}
      </div>
      <div class="card">
        <div style="font-weight:800;margin-bottom:6px">Что откроется</div>
        <div class="small">✦ Все 13 поводов и по 40 идей в каждом</div>
        <div class="small">✦ Фильтры: кому, бюджет, интересы</div>
        <div class="small">✦ Безлимит вишлистов, намёков и напоминаний</div>
      </div>
      <button class="btn" id="pay">Открыть за 149 ₽ на 7 дней →</button>
      <p class="small muted center" style="margin-top:-4px">или навсегда — ${foreverPrice()} ₽</p>
      <button class="btn btn--ghost" id="later">Может, позже</button>
    </div>`, (el, close) => {
    el.querySelector('#pay').onclick = () => { close(); go('paywall', { from: 'lock_sheet', cat: catId }); };
    el.querySelector('#later').onclick = close;
  });
}

// ── Paywall и оплата ─────────────────────────────────────────────────
export function renderPaywall({ from } = {}) {
  track('paywall_viewed', { from: from || 'direct' });
  if (isFullPremium()) return renderAccess();
  const fp = foreverPrice();
  return {
    html: `
      <div class="wrap" style="padding-top:6px">
        <div class="eyebrow">та-дам · тарифы</div>
        <h1 class="bups" style="font-size:34px;line-height:1.02;color:var(--coffee);margin-top:6px">что входит<br>в каждый тариф</h1>
        <p class="small" style="font-weight:700;margin-top:8px">Оба платных тарифа открывают весь premium. Разница — в сроке доступа и в том, насколько раскрываются функции «на дистанции».</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        ${compareTable()}
        ${whoCards()}
        ${fp < 490 ? `<p class="small center" style="color:var(--mango);font-weight:800">🎉 Твоя скидка: «Навсегда» за ${fp} ₽ вместо 490 ₽</p>` : ''}
        ${isPremium() ? '' : '<button class="btn btn--coffee" data-p="week">На праздник · 149 ₽</button>'}
        <button class="btn" data-p="forever">Навсегда · ${fp} ₽</button>
        <button class="linkbtn" id="promo">Есть промокод от друга?</button>
        <p class="small muted center">Оплата прямо в Telegram. Доступ открывается сразу после оплаты.</p>
      </div>`,
    mount(app) {
      bindPlans(app);
      app.querySelector('#promo').onclick = () => promoSheet();
    }
  };
}

function bindPlans(app) {
  app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    track('product_selected', { id: b.dataset.p });
    payFlow(b.dataset.p);
  });
}

// Промокод из колеса друга: G… — 3 дня premium, D… — скидка на «Навсегда»
export function promoSheet(prefill = '') {
  sheet(`
    <div class="stack">
      <h3 class="h2">Промокод от друга</h3>
      <p class="small muted">Друг мог выиграть его в колесе и подарить тебе: 3 дня premium или скидку на «Навсегда».</p>
      <div class="field"><input id="code" value="${esc(prefill)}" placeholder="Например, G1A2B3C4" maxlength="8" autocapitalize="characters"></div>
      <button class="btn" id="ok">Активировать</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = async () => {
      const r = await redeemFriendCode(el.querySelector('#code').value);
      if (!r.ok) return toast({
        bad_code: 'Такого промокода нет — проверь буквы', self: 'Это твой собственный код — отправь его другу',
        used: 'Этот промокод уже активирован', has_forever: 'У тебя уже доступ навсегда ✨'
      }[r.error] || 'Не получилось активировать');
      close(); tg.haptic('success');
      toast(r.kind === 'friend_gift' ? `Та-дам! ${WHEEL.friendGiftDays} дня premium твои 🎁` : `Скидка активна: «Навсегда» за ${WHEEL.friendDiscountRub} ₽`);
      go(r.kind === 'friend_gift' ? 'access' : 'paywall', {}, true);
    };
  });
}

function payFlow(productId) {
  const p = CONFIG.products.find(x => x.id === productId);
  const price = p.id === 'forever' ? foreverPrice() : p.priceRub;
  sheet(`
    <div class="stack center">
      ${mascot('cool', 'mascot--sm')}
      <h3 class="h2">Premium · ${esc(p.title.toLowerCase())}</h3>
      <p class="muted">${p.id === 'forever' ? 'Все поводы, идеи, фильтры и напоминания — без срока' : 'Все поводы, идеи и фильтры на 7 дней'}</p>
      <div class="bups" style="font-size:36px;color:var(--mango)">${price} ₽</div>
      <label class="check">
        <input type="checkbox" id="offer">
        <span>Принимаю условия <button type="button" class="linkbtn" data-doc="offer">публичной оферты</button> и&nbsp;согласен на обработку данных для оплаты по <button type="button" class="linkbtn" data-doc="privacy">политике</button></span>
      </label>
      <button class="btn" id="pay" disabled>Оплатить ${price} ₽</button>
      <p class="small muted" style="margin-top:-6px">Доступ открывается сразу после оплаты, поэтому возврат после этого не предусмотрен (п. 5.7 оферты).</p>
      <button class="btn btn--ghost" id="no">Отмена</button>
    </div>`, (el, close) => {
    const cb = el.querySelector('#offer'), pay = el.querySelector('#pay');
    cb.onchange = () => { pay.disabled = !cb.checked; };
    el.querySelectorAll('[data-doc]').forEach(b => b.onclick = e => { e.preventDefault(); close(); go('doc', { id: b.dataset.doc }); });
    el.querySelector('#no').onclick = close;
    pay.onclick = () => {
      if (!cb.checked) return;
      setConsent('offer', true);
      // ВНИМАНИЕ: до подключения платёжной системы доступ выдаётся без списания —
      // это закрывается на сервере (invoice → pre_checkout_query → successful_payment).
      track('payment_started', { id: productId, price, demo: true });
      close();
      setTimeout(() => {
        grantAccess(productId, 'demo');
        track('payment_success', { id: productId, price, demo: true });
        tg.haptic('success');
        go('access', {}, true);
      }, 400);
    };
  });
}

export function renderAccess() {
  const full = isFullPremium();
  return {
    html: `
      <div class="wrap center" style="padding-top:14px">
        ${mascot('alert', 'mascot--md')}
        <h1 class="bups" style="font-size:33px;color:var(--mango)">та-дам!<br>всё открыто</h1>
        <p class="muted small">Premium активен · ${esc(accessLabel())}</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        ${compareTable()}
        ${full ? '' : `
          <div class="info">
            <div style="font-weight:800">Хочешь, чтобы всё работало круглый год?</div>
            <div class="small" style="margin-top:4px">«Навсегда» — один раз заплатил и забыл: напоминания о датах близких весь год, календарь праздников полностью и отдельное колесо с подарками для друзей.</div>
          </div>
          <button class="btn" data-p="forever">Навсегда · ${foreverPrice()} ₽</button>`}
        <button class="btn ${full ? '' : 'btn--soft'}" id="go">Придумать подарок</button>
      </div>`,
    mount(app) {
      app.querySelector('#go').onclick = () => go('home', {}, true);
      bindPlans(app);
    }
  };
}

// ── Приглашения ──────────────────────────────────────────────────────
// Текст приглашения. В Telegram он уходит вместе с карточкой-логотипом (через backend),
// без backend — обычным сообщением со ссылкой.
export const INVITE_TEXT = 'Держи бот с вау-идеями на любой повод и для кого угодно 🎁 А ещё можно собирать вишлисты и намекать, что тебе подарить 😏';

export function renderInvite() {
  const link = deepLink(state.referral.code);
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('bubble', 'mascot--md')}
        <h1 class="bups" style="font-size:32px;color:var(--mango)">зови друзей</h1>
        <p class="muted small">За каждого друга — дополнительный спин колеса</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        <div class="card small" style="word-break:break-all">${esc(link)}</div>
        <button class="btn" id="send">Отправить приглашение</button>
        <button class="btn btn--soft" id="copy">Скопировать ссылку</button>
        <div class="card">
          <div style="font-weight:800">Как это работает</div>
          <p class="small muted">Друг открывает Та-дам по твоей ссылке впервые и проходит первый шаг знакомства — тебе приходит сообщение от бота и дополнительный спин. До ${CONFIG.limits.referralSpinsPerDay} друзей в сутки. Если открыть свою же ссылку, спин не начислится.</p>
        </div>
        <div class="rows">
          <div class="row"><span class="row__ico">👥</span><span class="row__t">Приглашено друзей</span><span class="row__v" id="invCount">${state.referral.invitedCount || 0}</span></div>
          <div class="row"><span class="row__ico">💌</span><span class="row__t">Отправлено намёков</span><span class="row__v">${state.hints.length}</span></div>
        </div>
      </div>`,
    mount(app) {
      app.querySelector('#send').onclick = async () => {
        track('referral_link_created', {});
        // С backend: готовое сообщение с логотипом и кнопкой (Bot API savePreparedInlineMessage).
        // Без него или на старом Telegram — обычный выбор чата с текстом и ссылкой.
        if (apiAvailable() && tg.raw?.shareMessage) {
          const r = await api.shareInvite(link);
          if (r && r.ok) return tg.raw.shareMessage(r.id);
        }
        tg.share(link, INVITE_TEXT);
      };
      app.querySelector('#copy').onclick = async () => {
        try { await navigator.clipboard.writeText(INVITE_TEXT + '\n' + link); toast('Приглашение скопировано'); } catch (e) { toast(link); }
      };
      // Счётчик друзей ведёт сервер — подтягиваем свежий
      if (apiAvailable()) api.referralRegister(state.referral.code).then(r => {
        if (!r || !r.ok) return;
        state.referral.invitedCount = r.invited || 0; save();
        const el = app.querySelector('#invCount'); if (el) el.textContent = state.referral.invitedCount;
      });
    }
  };
}

// ── Награды (переиспользуем экран колеса) ────────────────────────────
export { renderRewards } from './wheel.js?v=2609242257';

// ── Друзья бренда ────────────────────────────────────────────────────
export function renderFriends() {
  track('brand_friends_viewed', {});
  return {
    html: `
      <div class="cat-header" style="background:#702720">
        <div>
          <div class="bups">друзья бренда</div>
          <div class="small" style="opacity:.85">Блогеры и их вау-идеи для подарков</div>
        </div>
      </div>
      <div class="wrap">
        ${BRAND_FRIENDS.length ? '' : `
          <div class="empty" style="padding-bottom:8px">
            ${mascot('peek', 'mascot--md')}
            <h3 class="bups" style="font-size:32px;color:var(--mango);margin-top:8px">упс, пока тут пусто</h3>
            <p class="muted">Станешь первым другом?</p>
          </div>`}
        ${BRAND_FRIENDS.map(f => `
          <div class="friend">
            <div class="friend__ava">${esc(f.nick[1].toUpperCase())}</div>
            <div style="flex:1">
              <div style="font-weight:800">${esc(f.nick)}</div>
              <div class="small muted">${esc(f.idea)}</div>
            </div>
            <span class="badge100">100K+</span>
          </div>`).join('')}
        <p class="small muted center" style="margin-top:${BRAND_FRIENDS.length ? 18 : 0}px">Сними ролик, набери 100 тысяч просмотров —<br>и попади сюда со своей идеей ✨</p>
        <div class="spacer"></div>
        <button class="btn" id="ugc">Участвовать</button>
      </div>`,
    mount(app) { app.querySelector('#ugc').onclick = () => go('ugc', {}); }
  };
}

// ── UGC-программа ────────────────────────────────────────────────────
const UGC_LABEL = {
  submitted: 'Заявка отправлена · ждёт проверки',
  under_review: 'На проверке у модератора',
  approved_basic: 'Одобрено · premium на год',
  approved_100k: 'Одобрено 100 000+ · premium навсегда',
  rejected: 'Отклонено'
};

export function renderUgc() {
  track('ugc_program_viewed', {});
  const u = state.ugc;
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('run', 'mascot--md')}
        <h1 class="bups" style="font-size:31px;color:var(--mango)">твори с та-дам</h1>
        <p class="muted small">Снимаешь ролик с упоминанием — получаешь доступ и место в разделе «Друзья бренда»</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        <div class="card">
          <div style="font-weight:800">Уровень 1 — упоминание</div>
          <p class="small muted">Ролик с упоминанием ${SOCIAL.nick ? esc(SOCIAL.nick) : 'Та-дам'} → бонусный premium-доступ на год и репост в наших соцсетях.</p>
        </div>
        <div class="card">
          <div style="font-weight:800">Уровень 2 — 100 000 просмотров</div>
          <p class="small muted">Premium навсегда, твой ник и идея подарка в разделе «Друзья бренда».</p>
        </div>
        ${u ? `<div class="info"><b>Статус:</b> ${esc(UGC_LABEL[u.status] || u.status)}<div class="small">${esc(u.link)}</div></div>`
            : '<button class="btn" id="apply">Подать заявку</button>'}
        <p class="small muted center">Проверку делает администратор вручную. Просмотры подтверждаются скриншотом и ссылкой.</p>
      </div>`,
    mount(app) {
      app.querySelector('#apply')?.addEventListener('click', ugcForm);
      // Решение принимает админ — подтягиваем актуальный статус заявки
      if (apiAvailable() && u) api.ugcStatus().then(r => {
        const a = r?.application;
        if (!a || a.status === state.ugc?.status) return;
        state.ugc = { ...state.ugc, status: a.status }; save(); go('ugc', {}, true);
      });
    }
  };
}

function ugcForm() {
  sheet(`
    <div class="stack">
      <h3 class="h2">Заявка в программу</h3>
      <div class="field"><label>Платформа</label>
        <select id="pl"><option>Reels</option><option>TikTok</option><option>YouTube Shorts</option><option>VK Клипы</option></select></div>
      <div class="field"><label>Ссылка на ролик</label><input id="link" placeholder="https://"></div>
      <div class="field"><label>Твой ник</label><input id="nick" placeholder="@nickname" maxlength="40"></div>
      <div class="field"><label>Просмотров сейчас</label><input id="views" type="number" inputmode="numeric" placeholder="0"></div>
      <button class="btn" id="ok">Отправить</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = () => {
      const link = el.querySelector('#link').value.trim();
      const nick = el.querySelector('#nick').value.trim();
      if (!link || !nick) return toast('Нужны ссылка и ник');
      state.ugc = {
        platform: el.querySelector('#pl').value, link, nick,
        views: +el.querySelector('#views').value || 0,
        status: 'submitted', submittedAt: Date.now()
      };
      track('ugc_submission_created', { platform: state.ugc.platform });
      if (apiAvailable()) api.ugcSubmit(state.ugc);   // заявка уходит в админку
      save(); close(); tg.haptic('success'); go('ugc', {}, true);
    };
  });
}

// ── Полученный намёк на одну идею (открыт по ссылке h_<idea>) ────────
export function renderHint({ id }) {
  track('hint_opened', { id });
  const idea = IDEAS.find(i => i.id === id);
  return {
    hideNav: true, hideBack: true,
    html: `
      <div class="wrap center" style="padding-top:22px">
        ${mascot('bubble', 'mascot--md')}
        <h1 class="bups" style="font-size:32px;color:var(--mango)">тебе намекнули 💌</h1>
        <div class="card" style="text-align:left;margin-top:14px">
          <div class="small muted">Идея из вишлиста близкого человека</div>
          <div style="font-weight:800;font-size:18px;margin-top:6px">${esc(idea ? idea.title : 'Подарок-сюрприз')}</div>
          <div class="small muted">${esc(idea ? idea.desc : 'Открой Та-дам и подбери идею сам')}</div>
        </div>
        <div class="spacer"></div>
        ${idea ? '<button class="btn" id="fav">Сохранить себе 💖</button>' : ''}
        <div class="spacer"></div>
        <button class="btn btn--soft" id="open">Открыть Та-дам</button>
        <p class="small muted" style="margin-top:12px">Личные данные отправителя не показываются</p>
      </div>`,
    mount(app) {
      app.querySelector('#fav')?.addEventListener('click', () => {
        if (!idea) return;
        if (inWishlist(idea.id)) return toast('Уже в вишлисте');
        addToWishlist(defaultWishlist(), { ideaId: idea.id, title: idea.title, desc: idea.desc });
        track('recipient_converted', { idea: idea.id });
        tg.haptic('success'); toast('Сохранили в твой вишлист 🎁');
      });
      app.querySelector('#open').onclick = () => {
        track('recipient_app_opened', {});
        go(state.onboarded ? 'home' : 'onboarding', {}, true);
      };
    }
  };
}

// ── Полученный вишлист (открыт по ссылке w_<token>) ───────────────────
// Раньше токен терялся ещё в роутинге (app.js) и сюда никогда не доходил —
// получатель всегда видел заглушку «Подарок-сюрприз», даже если отправитель
// честно ждал, что откроется настоящий список. Теперь запрашиваем его с backend;
// без backend честно говорим об этом, а не показываем то же самое молча.
export function renderSharedWishlist({ wl }) {
  track('hint_opened', { wl });
  return {
    hideNav: true, hideBack: true,
    html: `
      <div class="wrap center" style="padding-top:22px" id="wlBox">
        ${mascot('heart', 'mascot--md')}
        <h1 class="bups" style="font-size:32px;color:var(--mango)">с тобой поделились вишлистом 🎁</h1>
        <div class="card" style="text-align:left;margin-top:14px" id="wlBody">
          <div class="small muted">Загружаем список…</div>
        </div>
        <div class="spacer"></div>
        <button class="btn btn--soft" id="open">Открыть Та-дам</button>
        <p class="small muted" style="margin-top:12px">Личные данные отправителя не показываются</p>
      </div>`,
    async mount(app) {
      app.querySelector('#open').onclick = () => {
        track('recipient_app_opened', {});
        go(state.onboarded ? 'home' : 'onboarding', {}, true);
      };
      const body = app.querySelector('#wlBody');
      if (!apiAvailable()) {
        body.innerHTML = `<div class="small muted">Не получилось загрузить список. Попробуй открыть ссылку чуть позже.</div>`;
        return;
      }
      const r = await api.wishlistPublic(wl);
      if (!r || !r.ok) {
        body.innerHTML = `<div class="small muted">Эта ссылка больше не работает — отправитель мог её отозвать.</div>`;
        return;
      }
      body.innerHTML = `
        <div class="small muted">${esc(r.title)}</div>
        ${r.dream ? `<div class="dream" style="margin-top:8px"><span class="dream__ico">🌟</span><div><div class="dream__label">Подарок мечты</div><div class="dream__t">${esc(r.dream)}</div></div></div>` : ''}
        <div class="stack" style="margin-top:8px;gap:8px">
          ${r.items.length ? r.items.map(i => `
            <div style="padding:8px 0;border-bottom:1px solid var(--line)">
              <div style="font-weight:800;font-size:15px">${esc(i.title)}</div>
              ${i.desc ? `<div class="small muted">${esc(i.desc)}</div>` : ''}
              ${/^https?:\/\//.test(i.link || '') ? `<a class="wl__link" href="${esc(i.link)}" target="_blank" rel="noopener">🔗 Где купить</a>` : ''}
            </div>`).join('')
            : '<div class="small muted">Список пока пуст</div>'}
        </div>`;
    }
  };
}

// ── Настройки, поддержка, правила, 404 ───────────────────────────────
export function renderSettings() {
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">настройки</h1></div>
      <div class="wrap">
        <div class="rows">
          <button class="row" data-t="reminders"><span class="row__ico">🔔</span><span class="row__t">Напоминания о датах</span><span class="row__v">${state.settings.reminders ? 'вкл' : 'выкл'}</span></button>
          <button class="row" data-t="analytics"><span class="row__ico">📊</span><span class="row__t">Аналитика использования</span><span class="row__v">${state.settings.analytics ? 'вкл' : 'выкл'}</span></button>
          <button class="row" id="ads"><span class="row__ico">📨</span><span class="row__t">Новости и акции от Та-дам</span><span class="row__v">${state.consents.ads ? 'вкл' : 'выкл'}</span></button>
          <button class="row" data-me><span class="row__ico">🙋</span><span class="row__t">Мой профиль</span><span class="row__chev">›</span></button>
          <button class="row" id="tips"><span class="row__ico">💡</span><span class="row__t">Показать подсказки заново</span><span class="row__chev">›</span></button>
          <button class="row" data-go="terms"><span class="row__ico">📄</span><span class="row__t">Документы и приватность</span><span class="row__chev">›</span></button>
        </div>

        <div class="spacer"></div>
        <button class="btn btn--ghost" id="reset" style="color:#B3341A">Удалить мои данные</button>
        <div class="spacer"></div>
        ${DEBUG ? `<div class="card" style="border-style:dashed">
          <div style="font-weight:800">Для тестирования</div>
          <p class="small muted">Приложение вернётся к самому первому запуску: знакомство, пустые вишлисты и даты, доступный спин и подсказки.</p>
          <button class="btn btn--soft" id="testreset">Сбросить всё до первого запуска</button>
        </div>` : ''}
        <p class="small muted center">Та-дам · версия ${esc(CONFIG.version)}</p>
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
        const k = b.dataset.t;
        state.settings[k] = !state.settings[k];
        if (k === 'reminders' && !state.settings[k]) track('notifications_disabled', {});
        save(); go('settings', {}, true);
      });
      app.querySelector('[data-go]').onclick = () => go('terms', {});
      // Согласие на рассылки — отдельное и добровольное (38-ФЗ «О рекламе», ст. 18): его можно отозвать в один тап
      app.querySelector('#ads').onclick = () => {
        if (state.consents.ads) { setConsent('ads', false); toast('Больше не будем присылать новости и акции'); return go('settings', {}, true); }
        confirmSheet('Присылать новости и акции?', 'Не чаще раза в день: новые подборки, скидки и розыгрыши. Отписаться можно здесь же.', 'Согласен',
          () => { setConsent('ads', true); go('settings', {}, true); });
      };
      app.querySelector('#tips').onclick = () => { resetTips(); toast('Подсказки вернулись — загляни на Главную'); go('home', {}, true); };
      app.querySelector('[data-me]').onclick = () => go('me', {});
      app.querySelector('#testreset')?.addEventListener('click', () => {
        resetAll();                                   // чистим и локальное, и облачное состояние
        track('test_reset', {});
        tg.haptic('success');
        toast('Всё сброшено — начинаем с нуля');
        go('onboarding', {}, true);
      });
      app.querySelector('#reset').onclick = () => confirmSheet(
        'Удалить все данные?', 'Вишлисты, даты и награды исчезнут навсегда', 'Удалить',
        () => { resetAll(); toast('Данные удалены'); go('onboarding', {}, true); }
      );
    }
  };
}

export function renderSupport() {
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">поддержка</h1></div>
      <div class="wrap stack">
        ${mascot('search', 'mascot--sm')}
        <div class="card">
          <div style="font-weight:800">Что-то пошло не так?</div>
          <p class="small muted">Напиши нам в Telegram или на ta-damapp@yandex.ru — ответим и починим. С вопросами по оплате — туда же.</p>
        </div>
        <button class="btn" id="w">Написать в поддержку</button>
        <button class="btn btn--ghost" id="t">Документы и приватность</button>
      </div>`,
    mount(app) {
      app.querySelector('#w').onclick = () => {
        const u = TELEGRAM.botUsername ? `https://t.me/${TELEGRAM.botUsername}` : TELEGRAM.supportUrl;
        tg.raw?.openTelegramLink ? tg.raw.openTelegramLink(u) : window.open(u, '_blank');
      };
      app.querySelector('#t').onclick = () => go('terms', {});
    }
  };
}

// Юридические документы клиента: оферта, политика, два согласия.
// Тексты лежат в docs/*.html и подгружаются только при открытии — не тянем 40 КБ на старте.
export function renderTerms() {
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">документы</h1></div>
      <div class="wrap stack">
        <div class="rows">
          ${Object.entries(DOCS).map(([id, t]) => `<button class="row" data-doc="${id}"><span class="row__ico">📄</span><span class="row__t">${esc(t)}</span><span class="row__chev">›</span></button>`).join('')}
        </div>
        <div class="card small">
          <b>Коротко</b>
          <p class="muted">Даты близких и желания видны только тебе. Публичная ссылка на вишлист открывается лишь тем, кому ты её отправил. Колесо — не лотерея: спины бесплатные и не продаются.</p>
        </div>
        <p class="small muted center">ИП Кудеярова Ангелина Сергеевна · ИНН 645294829078<br>ОГРНИП 325645700116523 · ta-damapp@yandex.ru</p>
        <button class="btn btn--ghost" id="del">Удалить мои данные</button>
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => go('doc', { id: b.dataset.doc }));
      app.querySelector('#del').onclick = () => confirmSheet('Удалить все данные?', 'Действие необратимо', 'Удалить',
        () => { resetAll(); go('onboarding', {}, true); });
    }
  };
}

export function renderDoc({ id }) {
  const title = DOCS[id];
  if (!title) return renderNotFound();
  return {
    hideNav: !state.onboarded,              // до знакомства таб-бар не показываем: иначе онбординг можно проскочить
    html: `<div class="wrap doc"><div id="doc"><p class="muted small center" style="margin-top:40px">Загружаем документ…</p></div>
      <button class="btn btn--soft" id="docback" style="margin-top:18px">Понятно, назад</button></div>`,
    mount(app) {
      app.querySelector('#docback').onclick = () => back();
      fetch(`docs/${id}.html?v=2609242257`).then(r => r.ok ? r.text() : Promise.reject())
        .then(html => { app.querySelector('#doc').innerHTML = html; })
        .catch(() => { app.querySelector('#doc').innerHTML = '<p class="muted center" style="margin-top:40px">Не удалось загрузить документ. Проверь интернет и попробуй ещё раз.</p>'; });
    }
  };
}

export function renderNotFound() {
  return {
    html: `<div class="wrap empty">${mascot('sleep', 'mascot--lg')}
      <h3 class="h2">Тут ничего нет</h3>
      <p class="muted small">Кажется, мы свернули не туда</p>
      <div class="spacer"></div>
      <button class="btn" id="h">На главную</button></div>`,
    mount(app) { app.querySelector('#h').onclick = () => go('home', {}, true); }
  };
}
