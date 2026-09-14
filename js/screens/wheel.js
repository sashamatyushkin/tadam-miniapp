// ── Колесо фортуны ───────────────────────────────────────────────────
// ПРОТОТИП: розыгрыш считается на клиенте (crypto.getRandomValues) по весам
// из config.js. В production результат приходит с backend (см. README, п. «Колесо»).
import { WHEEL, CATEGORIES, CONFIG } from '../config.js?v=2609141932';
import { state, save, spin, applyServerSpin, spinsAvailable, track, redeemCategory, isPremium } from '../store.js?v=2609141932';
import { esc, mascot, sheet, toast } from '../ui.js?v=2609141932';
import { tg } from '../tg.js?v=2609141932';
import { go } from '../app.js?v=2609141932';
import { api, apiAvailable } from '../api.js?v=2609141932';

// Идемпотентный ключ на одну попытку — если запрос уйдёт повторно (двойной тап,
// обрыв связи и повтор), сервер вернёт тот же результат, а не разыграет заново.
async function doSpin() {
  if (apiAvailable()) {
    const r = await api.spin(crypto.randomUUID());
    if (r) return r.ok ? applyServerSpin(r.reward) : null; // r.ok===false — сервер честно сказал «спинов нет»
  }
  return spin();                                            // сервер недоступен — локальный прототип-режим
}

const N = WHEEL.rewards.length;
const STEP = 360 / N;

function wheelSvg() {
  const r = 100, c = 105;
  const arc = (i) => {
    const a0 = (i * STEP - 90) * Math.PI / 180, a1 = ((i + 1) * STEP - 90) * Math.PI / 180;
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    return `M ${c} ${c} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  };
  // Подпись идёт вдоль радиуса и центрируется в секторе: по радиусу — между ступицей
  // и краем, поперёк — по середине угла. На левой половине колеса текст разворачиваем
  // на 180°, иначе он читался бы вверх ногами (так было со «Скидка», «+спин», «+слот»).
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
    ${WHEEL.rewards.map((w, i) => `<path d="${arc(i)}" fill="${w.color}" stroke="#FFFCF6" stroke-width="1.5"/>`).join('')}
    ${WHEEL.rewards.map((w, i) => label(i, w)).join('')}
  </svg>`;
}

export function render() {
  const left = spinsAvailable();
  track('wheel_viewed', { left });
  return {
    tab: 'wheel',
    html: `
      <div class="wrap center" style="padding-top:8px">
        <h1 class="bups" style="font-size:33px;color:var(--mango)">колесо фортуны</h1>
      </div>
      <div class="wheel-wrap" id="ww">
        ${wheelSvg()}
        <div class="wheel-hub"></div>
      </div>
      <div class="wrap center" style="margin-top:18px">
        <p class="small" style="font-weight:700">Один бесплатный спин каждый день</p>
        <p class="small muted" style="margin-top:4px">${isPremium()
          ? 'У тебя premium, поэтому в розыгрыше то, что тебе пригодится: эксклюзивная подборка идей, дополнительный слот вишлиста или ещё один спин.'
          : 'Можно выиграть: любую закрытую категорию на 24 часа, эксклюзивную подборку идей, дополнительный слот вишлиста, ещё один спин или скидку на неделю premium.'}</p>
        <div class="spacer"></div>
        <button class="btn" id="spin" ${left ? '' : 'disabled'}>${left ? 'Крутить 🎲' : 'Спин будет завтра'}</button>
        <p class="small muted" style="margin-top:10px">${left ? `Доступно спинов: ${left}` : 'Ещё спин — пригласи друга'}</p>
        <button class="btn btn--ghost" id="inv">Пригласить друга → +1 спин</button>
        ${state.rewards.filter(r => !r.redeemed).length ? `<button class="btn btn--soft" id="rew">Мои награды (${state.rewards.filter(r => !r.redeemed).length})</button>` : ''}
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
        setTimeout(() => { tg.haptic('success'); showResult(res.reward); }, 4700);
      };
      app.querySelector('#inv').onclick = () => go('invite', {});
      // Спины за приглашённых друзей начисляет сервер — подтягиваем их в локальный счётчик
      if (apiAvailable()) api.spinsAvailable().then(r => {
        if (!r || !r.ok || r.available <= spinsAvailable()) return;
        state.wheel.bonusSpins += r.available - spinsAvailable();
        save(); go('wheel', {}, true);
      });
      app.querySelector('#rew')?.addEventListener('click', () => go('rewards', {}));
    }
  };
}

function showResult(reward) {
  const empty = reward.code === 'empty';
  sheet(`
    <div class="center stack">
      ${mascot(empty ? 'sleep' : 'wow', 'mascot--md')}
      <h3 class="bups" style="font-size:32px;color:var(--mango)">${empty ? 'почти!' : 'та-дам!'}</h3>
      <p style="font-weight:800;font-size:17px">${esc(reward.title)}</p>
      <p class="muted small">${hintFor(reward.code)}</p>
      ${reward.code === 'category' ? '<button class="btn" id="use">Выбрать категорию</button>' : ''}
      ${reward.code === 'discount' ? '<button class="btn" id="pw">Забрать неделю за 99 ₽</button>' : ''}
      <button class="btn ${reward.code === 'category' || reward.code === 'discount' ? 'btn--ghost' : ''}" id="ok">Понятно</button>
    </div>`, (el, close) => {
    el.querySelector('#ok').onclick = () => { close(); go('wheel', {}, true); };
    el.querySelector('#use')?.addEventListener('click', () => { close(); go('rewards', {}); });
    el.querySelector('#pw')?.addEventListener('click', () => { close(); go('paywall', { from: 'wheel_discount' }); });
  });
}

function hintFor(code) {
  return {
    empty: 'Завтра будет новый спин — заглядывай',
    set: 'Подборка сохранена в «Мои награды»',
    category: 'Открой любую платную категорию на 24 часа',
    slot: 'Теперь вишлистов можно на один больше',
    spin: 'Крути ещё раз прямо сейчас',
    discount: 'Скидка действует 24 часа'
  }[code] || '';
}

export function renderRewards() {
  const list = state.rewards.slice().reverse();
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">мои награды</h1></div>
      <div class="wrap">
        ${list.length ? `<div class="rows">${list.map(r => `
          <div class="row">
            <span class="row__ico">${r.redeemed ? '✅' : '🎁'}</span>
            <span class="row__t">${esc(r.title)}
              <div class="small muted" style="font-weight:400">${r.redeemed ? 'использована' : (r.expiresAt ? 'до ' + new Date(r.expiresAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')}</div>
            </span>
            ${(!r.redeemed && r.code === 'category24') ? `<button class="btn btn--sm" data-use="${r.id}">Выбрать</button>` : ''}
          </div>`).join('')}</div>`
          : `<div class="empty">${mascot('search', 'mascot--md')}<h3 class="h2">Наград пока нет</h3><p class="muted small">Крути колесо раз в день</p></div>`}
      </div>`,
    mount(app) {
      app.querySelectorAll('[data-use]').forEach(b => b.onclick = () => pickCategory(b.dataset.use));
    }
  };
}

function pickCategory(rewardId) {
  const cats = CATEGORIES.filter(c => !c.free);
  sheet(`
    <div class="stack">
      <h3 class="h2">Какую категорию открыть на 24 часа?</h3>
      <div class="cats">
        ${cats.map(c => `<button class="cat" data-c="${c.id}" style="background:${c.bg}">
          <div class="cat__emoji">${c.emoji}</div>
          <div class="cat__name">${esc(c.name).replace(/\n/g, '<br>')}</div></button>`).join('')}
      </div>
    </div>`, (el, close) => {
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      redeemCategory(rewardId, b.dataset.c);
      close(); tg.haptic('success'); toast('Категория открыта на 24 часа ✨');
      go('home', {}, true);
    });
  });
}
