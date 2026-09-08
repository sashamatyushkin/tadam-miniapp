// ── Квест, paywall, рефералы, UGC, друзья бренда, настройки, намёк ───
import { CONFIG, CATEGORIES, BRAND_FRIENDS, RECIPIENTS, INTERESTS, deepLink, TELEGRAM } from '../config.js?v=2609090130';
import { IDEAS, IDEAS_BY_CAT } from '../data/ideas.js?v=2609090130';
import {
  state, save, track, questSteps, questComplete, issueQuestReward,
  isPremium, accessLabel, grantAccess, activeDiscount, resetAll, resetTips,
  addToWishlist, defaultWishlist, inWishlist
} from '../store.js?v=2609090130';
import { esc, mascot, sheet, toast, confirmSheet, plural } from '../ui.js?v=2609090130';
import { tg } from '../tg.js?v=2609090130';
import { go } from '../app.js?v=2609090130';
import { openHint } from './hint.js?v=2609090130';
import { api, apiAvailable } from '../api.js?v=2609090130';

// ── «Заполни и получи» ───────────────────────────────────────────────
export function renderQuest() {
  const steps = questSteps();
  const done = questComplete();
  track('profile_quest_started', {});
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('alert', 'mascot--md')}
        <h1 class="bups" style="font-size:26px;color:var(--mango)">заполни и получи</h1>
        <p class="muted small">Заполни профиль — откроем бонус</p>
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
        if (k === 'dates') go('dates', {});
        if (k === 'wishlist') go('wishlist', {});
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
      <button class="btn" id="pay">Открыть за ${price} ₽ →</button>
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
        <h1 class="bups" style="font-size:26px;color:var(--mango)">открой все поводы</h1>
        <p class="muted small">13 категорий, все фильтры и безлимит</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        ${CONFIG.products.map(p => {
          const price = (p.id === 'holiday' && disc) ? p.promoRub : p.priceRub;
          return `<div class="plan" data-p="${p.id}">
            <div class="plan__top">
              <div>
                <div style="font-weight:800">${esc(p.title)}${p.best ? ' ⭐' : ''}</div>
                <div class="small muted">${esc(p.sub)}</div>
              </div>
              <div style="font-weight:800;white-space:nowrap">
                ${(p.id === 'holiday' && disc) ? `<span style="text-decoration:line-through;opacity:.5;font-weight:400">${p.priceRub} ₽</span> ` : ''}${price} ₽
              </div>
            </div>
          </div>`;
        }).join('')}
        ${disc ? '<p class="small center" style="color:var(--mango);font-weight:700">Скидка из колеса действует 24 часа 🎉</p>' : ''}
        <div class="card">
          <div style="font-weight:800">Что открывается</div>
          <ul class="small muted" style="margin:8px 0 0;padding-left:18px">
            <li>Все 13 категорий и все идеи в каждой</li>
            <li>Фильтры: кому, бюджет, интересы</li>
            <li>Безлимит вишлистов и напоминаний</li>
            <li>«Намекни» без ограничений</li>
          </ul>
        </div>
        <p class="small muted center">Оплата внутри Telegram — через Telegram Stars.<br>В этом прототипе оплата симулируется: деньги не списываются.</p>
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        track('product_selected', { id: b.dataset.p });
        payFlow(b.dataset.p);
      });
    }
  };
}

function payFlow(productId) {
  const p = CONFIG.products.find(x => x.id === productId);
  const price = (p.id === 'holiday' && activeDiscount()) ? p.promoRub : p.priceRub;
  sheet(`
    <div class="stack center">
      <h3 class="h2">${esc(p.title)} · ${price} ₽</h3>
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
  return {
    html: `
      <div class="wrap center" style="padding-top:14px">
        ${mascot('alert', 'mascot--md')}
        <h1 class="bups" style="font-size:27px;color:var(--mango)">та-дам!<br>всё открыто</h1>
        <p class="muted small">Premium активен · ${esc(accessLabel())}</p>
        <div class="card" style="text-align:left;margin-top:14px">
          <div style="font-weight:800;margin-bottom:6px">Теперь у тебя есть</div>
          <div class="small">✦ Все 13 категорий и все идеи</div>
          <div class="small">✦ Фильтры: кому, бюджет, интересы</div>
          <div class="small">✦ Безлимит вишлистов и напоминаний</div>
          <div class="small">✦ «Намекни» без ограничений</div>
        </div>
        <div class="spacer"></div>
        <button class="btn" id="go">Придумать подарок</button>
      </div>`,
    mount(app) {
      app.querySelector('#go').onclick = () => go('home', {}, true);
      // «Восстановить покупку» отсюда убрали: доступ пока хранится только на этом устройстве,
      // восстанавливать реально нечего — кнопка обещала то, чего приложение не умеет.
      // Появится вместе с backend и entitlements (см. отчёт аудита, пункт 2.9).
    }
  };
}

// ── Приглашения ──────────────────────────────────────────────────────
export function renderInvite() {
  const link = deepLink(state.referral.code);
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('bubble', 'mascot--md')}
        <h1 class="bups" style="font-size:26px;color:var(--mango)">зови друзей</h1>
        <p class="muted small">За каждого друга — дополнительный спин колеса</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        <div class="card small" style="word-break:break-all">${esc(link)}</div>
        <button class="btn" id="send">Отправить приглашение</button>
        <button class="btn btn--soft" id="copy">Скопировать ссылку</button>
        <div class="card">
          <div style="font-weight:800">Как это работает</div>
          <p class="small muted">Спин начисляется, когда друг впервые открыл приложение по твоей ссылке и прошёл первый шаг онбординга. Не больше ${CONFIG.limits.referralSpinsPerDay} в сутки. Самоприглашение не засчитывается.</p>
          <p class="small muted">Проверка рефералов выполняется на сервере — в прототипе счётчик демонстрационный.</p>
        </div>
        <div class="rows">
          <div class="row"><span class="row__ico">👥</span><span class="row__t">Приглашено друзей</span><span class="row__v">${state.referral.invited.length}</span></div>
          <div class="row"><span class="row__ico">💌</span><span class="row__t">Отправлено намёков</span><span class="row__v">${state.hints.length}</span></div>
        </div>
      </div>`,
    mount(app) {
      app.querySelector('#send').onclick = () => {
        track('referral_link_created', {});
        tg.share(link, 'Та-дам — и подарок готов. Помогает придумать подарок за пару секунд 🎁');
      };
      app.querySelector('#copy').onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch (e) { toast(link); }
      };
    }
  };
}

// ── Награды (переиспользуем экран колеса) ────────────────────────────
export { renderRewards } from './wheel.js?v=2609090130';

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
        ${BRAND_FRIENDS.map(f => `
          <div class="friend">
            <div class="friend__ava">${esc(f.nick[1].toUpperCase())}</div>
            <div style="flex:1">
              <div style="font-weight:800">${esc(f.nick)}</div>
              <div class="small muted">${esc(f.idea)}</div>
            </div>
            <span class="badge100">100K+</span>
          </div>`).join('')}
        <p class="small muted center" style="margin-top:18px">Сними ролик, набери 100k —<br>попади сюда со своей идеей ✨</p>
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
  approved_basic: 'Одобрено · бонусный premium',
  approved_100k: 'Одобрено 100k+ · пожизненный premium',
  rejected: 'Отклонено'
};

export function renderUgc() {
  track('ugc_program_viewed', {});
  const u = state.ugc;
  return {
    html: `
      <div class="wrap center" style="padding-top:6px">
        ${mascot('run', 'mascot--md')}
        <h1 class="bups" style="font-size:25px;color:var(--mango)">твори с та-дам</h1>
        <p class="muted small">Снимаешь ролик с упоминанием — получаешь доступ и место в разделе «Друзья бренда»</p>
      </div>
      <div class="wrap stack" style="margin-top:14px">
        <div class="card">
          <div style="font-weight:800">Уровень 1 — упоминание</div>
          <p class="small muted">Ролик с упоминанием @Та-дам → бонусный premium-доступ и репост в нашем канале.</p>
        </div>
        <div class="card">
          <div style="font-weight:800">Уровень 2 — 100 000 просмотров</div>
          <p class="small muted">Пожизненный premium, ник и твоя идея подарка в разделе «Друзья бренда».</p>
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
        <h1 class="bups" style="font-size:26px;color:var(--mango)">тебе намекнули 💌</h1>
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
        <h1 class="bups" style="font-size:26px;color:var(--mango)">с тобой поделились вишлистом 🎁</h1>
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
        <div class="stack" style="margin-top:8px;gap:8px">
          ${r.items.length ? r.items.map(i => `
            <div style="padding:8px 0;border-bottom:1px solid var(--line)">
              <div style="font-weight:800;font-size:15px">${esc(i.title)}</div>
              ${i.desc ? `<div class="small muted">${esc(i.desc)}</div>` : ''}
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
          <button class="row" id="tips"><span class="row__ico">💡</span><span class="row__t">Показать подсказки заново</span><span class="row__chev">›</span></button>
          <button class="row" data-go="terms"><span class="row__ico">📄</span><span class="row__t">Условия и приватность</span><span class="row__chev">›</span></button>
        </div>
        <div class="spacer"></div>
        <div class="field"><label>Как тебя звать</label><input id="name" value="${esc(state.profile.name)}" placeholder="Имя" maxlength="30"></div>
        <div class="field"><label>Подарок мечты</label><input id="dream" value="${esc(state.profile.dreamGift)}" placeholder="Что бы ты хотел?" maxlength="60"></div>
        <div class="field">
          <label>Кому обычно даришь</label>
          <p class="small muted" style="margin:0 0 8px">Подставим этот фильтр в подборках заранее — менять можно всегда</p>
          <div class="chipset" id="giveTo">
            ${RECIPIENTS.map(r => `<button type="button" class="chip ${state.profile.giveTo.includes(r.id) ? 'chip--on' : ''}" data-v="${r.id}">${esc(r.name)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Интересы</label>
          <p class="small muted" style="margin:0 0 8px">Такие идеи будем поднимать выше в списке</p>
          <div class="chipset" id="interests">
            ${INTERESTS.map(i => `<button type="button" class="chip ${state.profile.interests.includes(i.id) ? 'chip--on' : ''}" data-v="${i.id}">${esc(i.name)}</button>`).join('')}
          </div>
        </div>
        <button class="btn btn--soft" id="saveP">Сохранить</button>
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
      // Множественный выбор чипов: переключаем класс на лету, не перерисовывая экран —
      // иначе фокус с полей слетал бы при каждом тапе.
      app.querySelectorAll('#giveTo [data-v], #interests [data-v]').forEach(b => {
        b.onclick = () => { b.classList.toggle('chip--on'); tg.haptic('light'); };
      });
      app.querySelector('#saveP').onclick = () => {
        state.profile.name = app.querySelector('#name').value.trim();
        state.profile.dreamGift = app.querySelector('#dream').value.trim();
        state.profile.giveTo = [...app.querySelectorAll('#giveTo .chip--on')].map(b => b.dataset.v);
        state.profile.interests = [...app.querySelectorAll('#interests .chip--on')].map(b => b.dataset.v);
        save(); toast('Сохранили — учтём в подборках');
      };
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
