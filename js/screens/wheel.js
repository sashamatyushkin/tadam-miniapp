// ── Колесо фортуны ───────────────────────────────────────────────────
// Механика по ТЗ клиента: два колеса (№1 — бесплатным и «На праздник», №2 — «Навсегда»),
// повтор уже полученного приза честно превращается в +1 спин. Когда сервер доступен,
// розыгрыш и проверку повторов делает он (server/wheel.js), иначе — локально.
import { WHEEL, CATEGORIES, GUIDES, deepLink } from '../config.js?v=2609242324';
import { state, save, spin, applyServerSpin, spinsAvailable, track, redeemCategory, wheelSectors, wheelKind, catsForPrize, isFullPremium } from '../store.js?v=2609242324';
import { esc, mascot, sheet, toast } from '../ui.js?v=2609242324';
import { tg } from '../tg.js?v=2609242324';
import { go } from '../app.js?v=2609242324';
import { api, apiAvailable } from '../api.js?v=2609242324';

// Идемпотентный ключ на одну попытку — если запрос уйдёт повторно (двойной тап,
// обрыв связи и повтор), сервер вернёт тот же результат, а не разыграет заново.
async function doSpin() {
  if (apiAvailable()) {
    const r = await api.spin(crypto.randomUUID());
    if (r) return r.ok ? applyServerSpin(r) : null;       // r.ok===false — сервер честно сказал «спинов нет»
  }
  return spin();                                           // сервер недоступен — локальный режим
}

function wheelSvg() {
  const SECTORS = wheelSectors();
  const STEP = 360 / SECTORS.length;
  const r = 100, c = 105;
  const arc = (i) => {
    const a0 = (i * STEP - 90) * Math.PI / 180, a1 = ((i + 1) * STEP - 90) * Math.PI / 180;
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    return `M ${c} ${c} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  };
  // Подпись идёт вдоль радиуса и центрируется в секторе: по радиусу — между ступицей
  // и краем, поперёк — по середине угла. На левой половине колеса текст разворачиваем
  // на 180°, иначе он читался бы вверх ногами (так было со «Скидка» и «+спин»).
  const label = (i, w) => {
    const ang = i * STEP + STEP / 2 - 90;              // 0° — вправо, как в SVG
    const flip = ang > 90 && ang < 270;
    const rot = flip ? ang + 180 : ang;
    const x = flip ? c - 61 : c + 61;
    const lines = w.short.split('\n');
    const size = lines.some(l => l.length > 10) ? 7.6 : 9.5;
    const lh = size * 1.18;
    const y0 = c - (lines.length - 1) * lh / 2;
    return `<text fill="${w.text}" font-size="${size}" font-weight="800" font-family="Nunito, sans-serif"
      transform="rotate(${rot} ${c} ${c})" text-anchor="middle" dominant-baseline="central">
      ${lines.map((l, k) => `<tspan x="${x}" y="${(y0 + k * lh).toFixed(2)}">${esc(l)}</tspan>`).join('')}</text>`;
  };
  return `<svg class="wheel" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg">
    ${SECTORS.map((w, i) => `<path d="${arc(i)}" fill="${w.color}" stroke="#FFFCF6" stroke-width="1.5"/>`).join('')}
    ${SECTORS.map((w, i) => label(i, w)).join('')}
  </svg>`;
}

const PRIZE_TEXT = {
  free: 'Можно выиграть: гайд «12 вау-букетов», гайд с таймкодами для записок, любую закрытую категорию на сутки, ещё один спин или скидку на «Навсегда» — 300 ₽ вместо 490.',
  premium: 'Твоё колесо — для щедрых: гайды, ещё один спин, скидка для друга и подарок другу — 3 дня premium.'
};

export function render() {
  const left = spinsAvailable();
  const kind = wheelKind();
  const STEP = 360 / wheelSectors().length;
  const unused = state.rewards.filter(r => !r.redeemed).length;
  track('wheel_viewed', { left, kind });
  return {
    tab: 'wheel',
    html: `
      <div class="wrap center" style="padding-top:8px">
        <h1 class="bups" style="font-size:33px;color:var(--mango)">колесо фортуны</h1>
        ${kind === 'premium' ? '<span class="pill">колесо «Навсегда»</span>' : ''}
      </div>
      <div class="wheel-wrap" id="ww">
        ${wheelSvg()}
        <div class="wheel-hub"></div>
      </div>
      <div class="wrap center" style="margin-top:18px">
        <p class="small" style="font-weight:700">Один бесплатный спин каждый день + по спину за каждого друга</p>
        <p class="small muted" style="margin-top:4px">${PRIZE_TEXT[kind]}</p>
        <p class="small muted" style="margin-top:4px">Уже полученный приз не повторяется — вместо него сразу даём ещё спин.</p>
        <div class="spacer"></div>
        <button class="btn" id="spin" ${left ? '' : 'disabled'}>${left ? 'Крутить 🎲' : 'Спин будет завтра'}</button>
        <p class="small muted" style="margin-top:10px">${left ? `Доступно спинов: ${left}` : 'Ещё спин — пригласи друга'}</p>
        <button class="btn btn--ghost" id="inv">Пригласить друга → +1 спин</button>
        <button class="btn btn--soft" id="rew">Мои награды${unused ? ` (${unused})` : ''}</button>
      </div>
      <div class="spacer"></div>`,
    mount(app) {
      const svg = app.querySelector('.wheel');
      let turns = 0;
      app.querySelector('#spin').onclick = async () => {
        const btn = app.querySelector('#spin');
        btn.disabled = true;
        track('spin_started', {});
        const res = await doSpin();                // ← результат известен ДО анимации (сервер или локально)
        if (!res) { toast('Спины закончились. Возвращайся завтра ✨'); btn.disabled = false; return; }
        turns += 5;
        const target = turns * 360 - (res.index * STEP + STEP / 2);
        svg.style.transform = `rotate(${target}deg)`;
        tg.haptic('medium');
        setTimeout(() => { tg.haptic('success'); showResult(res); }, 4700);
      };
      app.querySelector('#inv').onclick = () => go('invite', {});
      app.querySelector('#rew').onclick = () => go('rewards', {});
      // Спины за приглашённых друзей начисляет сервер — подтягиваем их в локальный счётчик
      if (apiAvailable()) api.spinsAvailable().then(r => {
        if (!r || !r.ok || r.available <= spinsAvailable()) return;
        state.wheel.bonusSpins += r.available - spinsAvailable();
        save(); go('wheel', {}, true);
      });
    }
  };
}

function showResult({ reward, converted, friendCode }) {
  const code = reward.code;
  const empty = code === 'empty';
  const guide = GUIDES[code];
  const title = converted ? 'Ещё один спин!' : reward.title;
  const hint = converted ? convertedText(code) : {
    empty: 'Завтра будет новый спин — заглядывай',
    spin: 'Крути ещё раз прямо сейчас',
    category: 'Выбери любую закрытую категорию — она откроется на сутки',
    discount: 'Скидка закреплена за тобой — активируй, когда захочешь',
    friend_discount: 'Отправь промокод другу — «Навсегда» для него будет стоить 300 ₽',
    friend_gift: 'Отправь код другу — он получит 3 дня полного доступа',
    guide_bouquets: 'Гайд сохранён в «Мои награды» — открывай когда угодно',
    guide_timecodes: 'Гайд сохранён в «Мои награды» — открывай когда угодно'
  }[code];
  const primary = converted ? '<button class="btn" id="again">Крутить ещё</button>'
    : guide ? '<button class="btn" id="guide">Открыть гайд</button>'
    : code === 'category' ? '<button class="btn" id="use">Выбрать категорию</button>'
    : code === 'discount' ? '<button class="btn" id="pw">Забрать «Навсегда» за 300 ₽</button>'
    : friendCode ? '<button class="btn" id="share">Отправить другу</button>'
    : code === 'spin' ? '<button class="btn" id="again">Крутить ещё</button>' : '';
  sheet(`
    <div class="center stack">
      ${mascot(empty ? 'sleep' : 'wow', 'mascot--md')}
      <h3 class="bups" style="font-size:32px;color:var(--mango)">${empty ? 'почти!' : 'та-дам!'}</h3>
      ${converted ? `<p class="small muted">Выпало: ${esc(reward.title)}</p>` : ''}
      <p style="font-weight:800;font-size:17px">${esc(title)}</p>
      ${friendCode ? `<div class="promocode">${esc(friendCode)}</div>` : ''}
      <p class="muted small">${hint}</p>
      ${primary}
      <button class="btn ${primary ? 'btn--ghost' : ''}" id="ok">${primary ? 'Позже' : 'Понятно'}</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = () => { close(); go('wheel', {}, true); };
    el.querySelector('#again')?.addEventListener('click', () => { close(); go('wheel', {}, true); });
    el.querySelector('#guide')?.addEventListener('click', () => { close(); openGuide(code); });
    el.querySelector('#use')?.addEventListener('click', () => { close(); go('rewards', {}); });
    el.querySelector('#pw')?.addEventListener('click', () => { close(); go('paywall', { from: 'wheel_discount' }); });
    el.querySelector('#share')?.addEventListener('click', () => { close(); shareFriendCode(code, friendCode); });
  });
}

function convertedText(code) {
  if (code.startsWith('guide_')) return 'Этот гайд у тебя уже есть — поэтому дарим ещё один спин.';
  if (code === 'category') return 'Все категории, которые может открыть колесо, у тебя уже открыты — держи ещё спин.';
  if (code === 'discount') return 'Скидка на «Навсегда» у тебя уже есть — вместо неё ещё один спин.';
  return 'Лимит подарков друзьям на этот месяц исчерпан — вместо него ещё один спин.';
}

// Полноэкранный просмотр гайда (картинка 9:16 от клиента)
export function openGuide(code) {
  const g = GUIDES[code];
  if (!g) return;
  track('guide_opened', { code });
  const root = document.createElement('div');
  root.className = 'guide';
  root.innerHTML = `<div class="guide__top"><span class="bups">${esc(g.title)}</span><button class="stv__x" type="button" aria-label="Закрыть">✕</button></div>
    <div class="guide__scroll"><img src="${esc(g.img)}?v=2609242324" alt="${esc(g.title)}"></div>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  const close = () => { root.remove(); document.body.style.overflow = ''; tg.popBack(close); };
  tg.pushBack(close);
  root.querySelector('.stv__x').onclick = close;
}

function shareFriendCode(kind, code) {
  const url = deepLink('f_' + code);
  const text = kind === 'friend_gift'
    ? `Дарю тебе 3 дня premium в Та-дам — боте с вау-идеями подарков 🎁 Промокод: ${code}`
    : `Держи скидку на Та-дам — бот с вау-идеями подарков: «Навсегда» за 300 ₽ вместо 490 🎁 Промокод: ${code}`;
  track('friend_code_shared', { kind });
  tg.share(url, text);
}

export function renderRewards() {
  const list = state.rewards.slice().reverse();
  const cats = catsForPrize();
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">мои награды</h1></div>
      <div class="wrap">
        ${list.length ? `<div class="rows">${list.map(r => {
          const g = GUIDES[r.code];
          const expired = r.expiresAt && r.expiresAt < Date.now() && !r.redeemed;
          const status = r.code === 'discount' ? (state.prizes.discountUsed || isFullPremium() ? 'использована' : 'действует, пока не купишь «Навсегда»')
            : r.friendCode ? `код ${r.friendCode}` : g ? 'твой навсегда' : r.redeemed ? 'использована' : expired ? 'срок выбора истёк'
            : r.expiresAt ? 'выбрать до ' + new Date(r.expiresAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          const btn = g ? `<button class="btn btn--sm" data-guide="${r.code}">Открыть</button>`
            : (r.code === 'category24' && !r.redeemed && !expired && cats.length) ? `<button class="btn btn--sm" data-use="${r.id}">Выбрать</button>`
            : (r.code === 'discount' && !state.prizes.discountUsed && !isFullPremium()) ? '<button class="btn btn--sm" data-pw>Забрать</button>'
            : r.friendCode ? `<button class="btn btn--sm" data-share="${r.code}:${r.friendCode}">Отправить</button>` : '';
          return `<div class="row">
            <span class="row__ico">${g ? g.emoji : r.redeemed ? '✅' : '🎁'}</span>
            <span class="row__t">${esc(r.title)}<div class="small muted" style="font-weight:400">${esc(status)}</div></span>
            ${btn}
          </div>`;
        }).join('')}</div>`
          : `<div class="empty">${mascot('search', 'mascot--md')}<h3 class="h2">Наград пока нет</h3><p class="muted small">Крути колесо раз в день</p></div>`}
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-use]').forEach(b => b.onclick = () => pickCategory(b.dataset.use));
      app.querySelectorAll('[data-guide]').forEach(b => b.onclick = () => openGuide(b.dataset.guide));
      app.querySelector('[data-pw]')?.addEventListener('click', () => go('paywall', { from: 'rewards' }));
      app.querySelectorAll('[data-share]').forEach(b => b.onclick = () => { const [k, c] = b.dataset.share.split(':'); shareFriendCode(k, c); });
    }
  };
}

function pickCategory(rewardId) {
  // При повторе — только те категории, что колесо ещё не открывало (ТЗ, раздел 02)
  const cats = catsForPrize();
  sheet(`
    <div class="stack">
      <h3 class="h2">Какую категорию открыть на сутки?</h3>
      <div class="cats">
        ${cats.map(c => `<button class="cat" data-c="${c.id}" style="background:${c.bg}">
          <div class="cat__emoji">${c.emoji}</div>
          <div class="cat__name">${esc(c.name).replace(/\n/g, '<br>')}</div></button>`).join('')}
      </div>
    </div>`, (el, close) => {
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      redeemCategory(rewardId, b.dataset.c);
      close(); tg.haptic('success'); toast('Категория открыта на сутки ✨');
      go('cat', { id: b.dataset.c }, true);
    });
  });
}
