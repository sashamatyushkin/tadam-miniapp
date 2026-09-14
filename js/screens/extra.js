// ── Квест, paywall, рефералы, UGC, друзья бренда, настройки, намёк ───
import { CONFIG, CATEGORIES, BRAND_FRIENDS, RECIPIENTS, INTERESTS, SOCIAL, deepLink, TELEGRAM } from '../config.js?v=2609141746';
import { IDEAS, IDEAS_BY_CAT } from '../data/ideas.js?v=2609141746';
import {
  state, save, track, questSteps, questComplete, issueQuestReward,
  isPremium, accessLabel, grantAccess, activeDiscount, resetAll, resetTips,
  addToWishlist, defaultWishlist, inWishlist, planId, profileFilled
} from '../store.js?v=2609141746';
import { esc, mascot, sheet, toast, confirmSheet, plural } from '../ui.js?v=2609141746';
import { tg } from '../tg.js?v=2609141746';
import { go, back } from '../app.js?v=2609141746';
import { openHint } from './hint.js?v=2609141746';
import { api, apiAvailable } from '../api.js?v=2609141746';

// ── «Заполни и получи» ───────────────────────────────────────────────
export function renderQuest() {
  const steps = questSteps();
  const done = questComplete();
  track('profile_quest_started', {});
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('alert', 'mascot--md')}
        <h1 class="bups" style="font-size:30px;color:var(--mango)">заполни и получи</h1>
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
        <h1 class="bups" style="font-size:30px;color:var(--mango);margin-top:6px">мой профиль</h1>
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

// ── Сравнение тарифов ────────────────────────────────────────────────
function compareTable() {
  const cur = planId();
  const head = [['free', 'Бесплатно'], ['week', '149 ₽<br>неделя'], ['year', '599 ₽<br>год']];
  return `
    <div class="cmp">
      <div class="cmp__row cmp__head">
        <div class="cmp__name"></div>
        ${head.map(([id, t]) => `<div class="cmp__cell ${id === cur ? 'cmp__cell--cur' : ''} ${id === 'year' ? 'cmp__cell--best' : ''}"><div>${t}${id === cur ? '<span class="cmp__now">у тебя</span>' : ''}</div></div>`).join('')}
      </div>
      ${CONFIG.compare.map(([name, ...vals]) => `
        <div class="cmp__row">
          <div class="cmp__name">${esc(name)}</div>
          ${vals.map((v, k) => `<div class="cmp__cell ${head[k][0] === cur ? 'cmp__cell--cur' : ''} ${head[k][0] === 'year' ? 'cmp__cell--best' : ''}">${esc(v)}</div>`).join('')}
        </div>`).join('')}
    </div>`;
}

// ── Замок повода: сначала объясняем, что внутри, потом ведём на оплату ──
export function openLockSheet(catId) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) return go('paywall', { from: 'category' });
  const list = IDEAS_BY_CAT[catId] || [];
  const teaser = list.slice(0, 3);
  const disc = activeDiscount();
  const price = disc ? CONFIG.products[0].promoRub : CONFIG.products[0].priceRub;
  track('locked_category_sheet', { cat: catId });

  sheet(`
    <div class="stack">
      <div class="lockhead" style="background:${cat.bg}">
        <div class="lockhead__emoji">${cat.emoji}</div>
        <div class="bups lockhead__name">${esc(cat.name).replace(/\n/g, ' ')}</div>
        <div class="lockhead__lock">🔒</div>
      </div>
      <p class="muted small center">Внутри ${list.length} ${plural(list.length, 'идея', 'идеи', 'идей')} под этот повод. Вот три из них:</p>
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
        <div class="small">✦ Все 13 поводов, а не три</div>
        <div class="small">✦ Фильтры: кому, бюджет, интересы</div>
        <div class="small">✦ Безлимит вишлистов, дат и намёков</div>
      </div>
      <button class="btn" id="pay">Открыть за ${price} ₽ в неделю →</button>
      <p class="small muted center" style="margin-top:-4px">или полный premium на год — 599 ₽</p>
      ${disc ? '<p class="small center" style="color:var(--mango);font-weight:700">Скидка из колеса действует 24 часа 🎉</p>' : ''}
      <button class="btn btn--ghost" id="later">Может, позже</button>
    </div>`, (el, close) => {
    el.querySelector('#pay').onclick = () => { close(); go('paywall', { from: 'lock_sheet', cat: catId }); };
    el.querySelector('#later').onclick = close;
  });
}

// ── Paywall и «оплата» ───────────────────────────────────────────────
export function renderPaywall({ from } = {}) {
  track('paywall_viewed', { from: from || 'direct' });
  if (isPremium()) return renderAccess();
  const disc = activeDiscount();

  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('cool', 'mascot--md')}
        <h1 class="bups" style="font-size:30px;color:var(--mango)">открой все поводы</h1>
        <p class="muted small">Неделя — чтобы быстро найти подарок. Год — полный premium.</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        ${planCards(disc)}
        ${disc ? '<p class="small center" style="color:var(--mango);font-weight:700">Скидка на неделю из колеса действует 24 часа 🎉</p>' : ''}
        <div class="section-title" style="margin:6px 0 0">Что входит</div>
        ${compareTable()}
        <p class="small muted center">Оплата внутри Telegram — через Telegram Stars.<br>В этом прототипе оплата симулируется: деньги не списываются.</p>
      </div>`,
    mount(app) { bindPlans(app); }
  };
}

// Год стоит как ~4 недельных тарифа, но действует в 52 раза дольше — это и есть
// понятная на глаз выгода, а не абстрактный процент. Считаем от реальных цен,
// а не хардкодим — если цены в CONFIG поменяются, подпись пересчитается сама.
function yearValueNote() {
  const week = CONFIG.products.find(p => p.id === 'week');
  const year = CONFIG.products.find(p => p.id === 'year');
  if (!week || !year) return '';
  const weeksWorth = Math.round(year.priceRub / week.priceRub);
  return `Платишь как за ${weeksWorth} ${plural(weeksWorth, 'неделю', 'недели', 'недель')} — а premium действует весь год`;
}

function planCards(disc, only) {
  return CONFIG.products.filter(p => !only || only.includes(p.id)).map(p => {
    const price = (p.id === 'week' && disc) ? p.promoRub : p.priceRub;
    const best = !!p.best;
    return `<div class="plan ${best ? 'plan--best' : ''}" data-p="${p.id}">
      ${best ? '<span class="plan__ribbon">✦ выбор большинства</span>' : ''}
      <div class="plan__top">
        <div>
          <div style="font-weight:800">${esc(p.title)}</div>
          <div class="small muted">${esc(p.sub)}</div>
        </div>
        <div style="font-weight:800;white-space:nowrap;text-align:right">
          ${(p.id === 'week' && disc) ? `<span style="text-decoration:line-through;opacity:.5;font-weight:400">${p.priceRub} ₽</span> ` : ''}${price} ₽
          <div class="small muted" style="font-weight:600">за ${p.per}</div>
        </div>
      </div>
      ${best ? `<div class="plan__value">🔥 ${esc(yearValueNote())}</div>` : ''}
    </div>`;
  }).join('');
}

function bindPlans(app) {
  app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    track('product_selected', { id: b.dataset.p });
    payFlow(b.dataset.p);
  });
}

function payFlow(productId) {
  const p = CONFIG.products.find(x => x.id === productId);
  const price = (p.id === 'week' && activeDiscount()) ? p.promoRub : p.priceRub;
  sheet(`
    <div class="stack center">
      <h3 class="h2">${esc(p.title)} · ${price} ₽ за ${p.per}</h3>
      <p class="small muted">В боевой версии здесь откроется счёт Telegram Stars: invoice → pre_checkout_query → successful_payment, и доступ выдаст backend.<br><br>Сейчас это прототип: подтверди, чтобы посмотреть, как выглядит premium.</p>
      <button class="btn" id="pay">Открыть доступ (демо)</button>
      <button class="btn btn--ghost" id="no">Отмена</button>
    </div>`, (el, close) => {
    el.querySelector('#no').onclick = close;
    el.querySelector('#pay').onclick = () => {
      track('payment_started', { id: productId, demo: true });
      close();
      setTimeout(() => {
        grantAccess(productId, 'demo');
        track('payment_success', { id: productId, demo: true });
        tg.haptic('success');
        go('access', {}, true);
      }, 400);
    };
  });
}

export function renderAccess() {
  const full = planId() === 'year';
  return {
    html: `
      <div class="wrap center" style="padding-top:14px">
        ${mascot('alert', 'mascot--md')}
        <h1 class="bups" style="font-size:31px;color:var(--mango)">та-дам!<br>всё открыто</h1>
        <p class="muted small">Premium активен · ${esc(accessLabel())}</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        ${compareTable()}
        ${full ? '' : `
          <div class="info">
            <div style="font-weight:800">Хочешь, чтобы мы напоминали о датах заранее?</div>
            <div class="small" style="margin-top:4px">В годовом premium — безлимит важных дат и напоминания за 14, 7, 3 и 1 день с подборкой идей.</div>
          </div>
          ${planCards(false, ['year'])}`}
        <button class="btn ${full ? '' : 'btn--soft'}" id="go">Придумать подарок</button>
      </div>`,
    mount(app) {
      app.querySelector('#go').onclick = () => go('home', {}, true);
      bindPlans(app);
      // «Восстановить покупку» отсюда убрали: доступ пока хранится только на этом устройстве,
      // восстанавливать реально нечего — кнопка обещала то, чего приложение не умеет.
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
        <h1 class="bups" style="font-size:30px;color:var(--mango)">зови друзей</h1>
        <p class="muted small">За каждого друга — дополнительный спин колеса</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        <div class="card small" style="word-break:break-all">${esc(link)}</div>
        <button class="btn" id="send">Отправить приглашение</button>
        <button class="btn btn--soft" id="copy">Скопировать ссылку</button>
        <div class="card">
          <div style="font-weight:800">Как это работает</div>
          <p class="small muted">Друг открывает Та-дам по твоей ссылке впервые и проходит первый шаг знакомства — тебе приходит сообщение от бота и дополнительный спин. До ${CONFIG.limits.referralSpinsPerDay} друзей в сутки. Если открыть свою же ссылку, спин не начислится.</p>
          ${apiAvailable() ? '' : '<p class="small muted">Сейчас сервер приложения не запущен, поэтому друзья пока не засчитываются. Всё заработает, как только приложение разместим на хостинге.</p>'}
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
export { renderRewards } from './wheel.js?v=2609141746';

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
            <h3 class="bups" style="font-size:30px;color:var(--mango);margin-top:8px">упс, пока тут пусто</h3>
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
        <h1 class="bups" style="font-size:29px;color:var(--mango)">твори с та-дам</h1>
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
    mount(app) { app.querySelector('#apply')?.addEventListener('click', ugcForm); }
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
        <h1 class="bups" style="font-size:30px;color:var(--mango)">тебе намекнули 💌</h1>
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
        <h1 class="bups" style="font-size:30px;color:var(--mango)">с тобой поделились вишлистом 🎁</h1>
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
        body.innerHTML = `<div class="small muted">В этой тестовой сборке backend не запущен, поэтому список не открывается по ссылке — только у отправителя в приложении. Расскажи ему лично, что он хотел подарить 🙂</div>`;
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
          <button class="row" data-me><span class="row__ico">🙋</span><span class="row__t">Мой профиль</span><span class="row__chev">›</span></button>
          <button class="row" id="tips"><span class="row__ico">💡</span><span class="row__t">Показать подсказки заново</span><span class="row__chev">›</span></button>
          <button class="row" data-go="terms"><span class="row__ico">📄</span><span class="row__t">Условия и приватность</span><span class="row__chev">›</span></button>
        </div>

        <div class="spacer"></div>
        <button class="btn btn--ghost" id="reset" style="color:#B3341A">Удалить мои данные</button>
        <div class="spacer"></div>
        <div class="card" style="border-style:dashed">
          <div style="font-weight:800">🧪 Режим тестирования</div>
          <p class="small muted">Одна кнопка — приложение возвращается к самому первому запуску: онбординг, три бесплатных повода, пустые вишлисты и даты, доступный спин и подсказки заново.</p>
          <button class="btn btn--soft" id="testreset">Сбросить всё до первого запуска</button>
        </div>
        <p class="small muted center">Версия ${esc(CONFIG.version)}</p>
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
        const k = b.dataset.t;
        state.settings[k] = !state.settings[k];
        if (k === 'reminders' && !state.settings[k]) track('notifications_disabled', {});
        save(); go('settings', {}, true);
      });
      app.querySelector('[data-go]').onclick = () => go('terms', {});
      app.querySelector('#tips').onclick = () => { resetTips(); toast('Подсказки вернулись — загляни на Главную'); go('home', {}, true); };
      app.querySelector('[data-me]').onclick = () => go('me', {});
      app.querySelector('#testreset').onclick = () => {
        resetAll();                                   // чистим и локальное, и облачное состояние
        track('test_reset', {});
        tg.haptic('success');
        toast('Всё сброшено — начинаем с нуля 🧪');
        go('onboarding', {}, true);
      };
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
          <p class="small muted">Напиши нам в Telegram — ответим и починим. По вопросам оплаты используй команду /paysupport в боте.</p>
        </div>
        <button class="btn" id="w">Написать в поддержку</button>
        <button class="btn btn--ghost" id="t">Условия и приватность</button>
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

export function renderTerms() {
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">условия</h1></div>
      <div class="wrap stack small">
        <div class="card">
          <b>Что мы храним</b>
          <p class="muted">Твои вишлисты, важные даты и настройки. В этом прототипе данные лежат в Telegram CloudStorage и в памяти твоего устройства, на наш сервер не уходят.</p>
        </div>
        <div class="card">
          <b>Приватность</b>
          <p class="muted">Даты близких и желания видны только тебе. Публичная ссылка открывается лишь тем, кому ты её отправил, и может быть отозвана.</p>
        </div>
        <div class="card">
          <b>Оплата</b>
          <p class="muted">Premium — цифровой доступ. В боевой версии оплата проходит через Telegram Stars, доступ выдаётся после подтверждённого платежа. В прототипе оплата симулируется.</p>
        </div>
        <div class="card">
          <b>Колесо</b>
          <p class="muted">Это не лотерея и не азартная игра: спины бесплатны, деньгами не оплачиваются. Вероятности задаются в конфигурации и раскрываются по запросу.</p>
        </div>
        <button class="btn btn--ghost" id="del">Удалить мои данные</button>
      </div>`,
    mount(app) {
      app.querySelector('#del').onclick = () => confirmSheet('Удалить все данные?', 'Действие необратимо', 'Удалить',
        () => { resetAll(); go('onboarding', {}, true); });
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
