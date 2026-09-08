// ── Онбординг: привет → кому дарим → первая дата ─────────────────────
import { state, save, track, addDate } from '../store.js?v=2609081709';
import { CATEGORIES, RELATIONS, REMINDER_TYPES } from '../config.js?v=2609081709';
import { mascot, esc, toast } from '../ui.js?v=2609081709';
import { tg } from '../tg.js?v=2609081709';
import { go } from '../app.js?v=2609081709';

let step = 0;
let picked = null;

const dots = i => `<div class="dots">${[0, 1, 2].map(n => `<i class="${n === i ? 'on' : ''}"></i>`).join('')}</div>`;

export function render() {
  track('onboarding_step_viewed', { step });
  if (step === 0) return hello();
  if (step === 1) return occasion();
  return firstDate();
}

function hello() {
  return {
    hideNav: true, hideBack: true,
    html: `
      <div class="onb">
        <div class="onb__body">
          ${mascot('wave', 'mascot--lg')}
          <h1 class="bups hero-title" style="color:var(--mango)">привет!<br>я та-дам</h1>
          <p class="muted" style="max-width:280px">Помогу придумать подарок, от которого загорятся глаза. Даже если идей совсем нет.</p>
        </div>
        ${dots(0)}
        <button class="btn" id="go">Поехали</button>
        <button class="btn btn--ghost" id="skip">Уже есть аккаунт</button>
      </div>`,
    mount(app) {
      app.querySelector('#go').onclick = () => {
        track('onboarding_started', {});
        tg.haptic('light'); step = 1; go('onboarding', {}, true);
      };
      app.querySelector('#skip').onclick = () => finish(true);
    }
  };
}

function occasion() {
  return {
    hideNav: true, hideBack: true,
    html: `
      <div class="onb">
        <div class="onb__body" style="justify-content:flex-start;padding-top:8px">
          ${mascot('think', 'mascot--md')}
          <h2 class="bups" style="font-size:26px;color:var(--mango)">кому дарим?</h2>
          <p class="muted small">Выбери повод — покажу идеи прямо сейчас</p>
          <div class="cats" style="width:100%;margin-top:12px">
            ${CATEGORIES.filter(c => c.free).map(c => `
              <button class="cat" data-cat="${c.id}" style="background:${c.bg}">
                <div class="cat__emoji">${c.emoji}</div>
                <div class="cat__name">${esc(c.name).replace(/\n/g, '<br>')}</div>
              </button>`).join('')}
          </div>
        </div>
        ${dots(1)}
        <button class="btn" id="next" disabled>Дальше</button>
        <!-- держим место второй кнопки: «Дальше» встаёт на тот же уровень, что «Поехали» -->
        <div class="btn btn--ghost" aria-hidden="true" style="visibility:hidden">.</div>
      </div>`,
    mount(app) {
      const next = app.querySelector('#next');
      app.querySelectorAll('[data-cat]').forEach(b => {
        b.onclick = () => {
          picked = b.dataset.cat;
          app.querySelectorAll('[data-cat]').forEach(x => x.style.outline = '');
          b.style.outline = '3px solid var(--coffee)';
          b.style.outlineOffset = '2px';
          next.disabled = false;
          tg.haptic('light');
          track('first_occasion_selected', { cat: picked });
        };
      });
      next.onclick = () => { step = 2; go('onboarding', {}, true); };
    }
  };
}

function firstDate() {
  return {
    hideNav: true, hideBack: true,
    html: `
      <div class="onb">
        <div class="onb__body" style="justify-content:flex-start;padding-top:8px">
          ${mascot('notes', 'mascot--md')}
          <h2 class="bups" style="font-size:26px;color:var(--mango)">первая дата</h2>
          <p class="muted small">Добавь день рождения близкого — напомним заранее, чтобы не бежать за подарком в последний вечер</p>
          <div style="width:100%;text-align:left;margin-top:14px">
            <div class="field"><label>Кого поздравляем</label><input id="n" placeholder="Например, мама Аня" maxlength="40"></div>
            <div class="field"><label>Кем приходится</label>
              <select id="rel">${RELATIONS.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Дата</label><input id="d" type="date"></div>
            <div class="field"><label>Повод</label>
              <select id="t">${REMINDER_TYPES.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select>
            </div>
          </div>
        </div>
        ${dots(2)}
        <button class="btn" id="save">Сохранить и начать</button>
        <button class="btn btn--ghost" id="later">Позже</button>
      </div>`,
    mount(app) {
      app.querySelector('#save').onclick = () => {
        const name = app.querySelector('#n').value.trim();
        const d = app.querySelector('#d').value;
        if (!name || !d) return toast('Заполни имя и дату — так напоминание будет точным');
        addDate({ name, date: d, relation: app.querySelector('#rel').value, type: app.querySelector('#t').value, annual: true, note: '' });
        track('first_date_added', {});
        tg.haptic('success');
        finish();
      };
      app.querySelector('#later').onclick = () => { track('onboarding_skipped', { step: 2 }); finish(); };
    }
  };
}

function finish(skipped) {
  state.onboarded = true;
  save();
  track('onboarding_completed', { skipped: !!skipped });
  step = 0;
  if (picked && !skipped) go('cat', { id: picked }, true);
  else go('home', {}, true);
}
