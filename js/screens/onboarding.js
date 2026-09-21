// ── Онбординг: привет → кому дарим → первая дата ─────────────────────
import { state, save, track, addDate, claimReferral, setConsent, consentsGiven } from '../store.js?v=2609211121';
import { CATEGORIES, RELATIONS, REMINDER_TYPES } from '../config.js?v=2609211121';
import { mascot, esc, toast, sheet } from '../ui.js?v=2609211121';
import { tg } from '../tg.js?v=2609211121';
import { go } from '../app.js?v=2609211121';

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
        ${consentBoxes()}
        <button class="btn" id="go" ${consentsGiven() ? '' : 'disabled'}>Поехали</button>
        <button class="btn btn--ghost" id="skip" ${consentsGiven() ? '' : 'disabled'}>Пропустить знакомство</button>
      </div>`,
    mount(app) {
      bindConsents(app, ok => { app.querySelector('#go').disabled = !ok; app.querySelector('#skip').disabled = !ok; });
      app.querySelector('#go').onclick = () => {
        track('onboarding_started', {});
        claimReferral();                       // пришёл по приглашению — засчитываем другу спин
        tg.haptic('light'); step = 1; go('onboarding', {}, true);
      };
      app.querySelector('#skip').onclick = () => finish(true);
    }
  };
}

// ── Согласия при первом входе (152-ФЗ: обработка ПД; 38-ФЗ: рассылки — отдельно и по желанию)
function consentBoxes() {
  return `<div class="consents">
    <label class="check"><input type="checkbox" id="c-pd" ${state.consents.pd ? 'checked' : ''}>
      <span>Принимаю <button type="button" class="linkbtn" data-doc="privacy">политику</button> и даю <button type="button" class="linkbtn" data-doc="pd-consent">согласие на обработку персональных данных</button></span></label>
    <label class="check"><input type="checkbox" id="c-ads" ${state.consents.ads ? 'checked' : ''}>
      <span>Хочу получать новости и акции — <button type="button" class="linkbtn" data-doc="ads-consent">согласие на рассылки</button> <span class="muted">(по желанию)</span></span></label>
  </div>`;
}
function bindConsents(root, onChange) {
  const pd = root.querySelector('#c-pd'), ads = root.querySelector('#c-ads');
  pd.onchange = () => { setConsent('pd', pd.checked); onChange(pd.checked); };
  ads.onchange = () => setConsent('ads', ads.checked);
  root.querySelectorAll('[data-doc]').forEach(b => b.onclick = e => { e.preventDefault(); go('doc', { id: b.dataset.doc }); });
}

// Для тех, кто познакомился с приложением до появления документов: спрашиваем один раз при входе
export function askConsentsIfNeeded() {
  if (consentsGiven()) return;
  sheet(`
    <div class="stack">
      ${mascot('notes', 'mascot--sm')}
      <h3 class="h2 center">Пара формальностей</h3>
      <p class="small muted center">По закону нам нужно твоё согласие, чтобы хранить профиль, вишлисты и даты близких.</p>
      ${consentBoxes()}
      <button class="btn" id="ok" disabled>Продолжить</button>
    </div>`, (el, close) => {
    bindConsents(el, ok => { el.querySelector('#ok').disabled = !ok; });
    el.querySelectorAll('[data-doc]').forEach(b => b.onclick = e => { e.preventDefault(); close(); go('doc', { id: b.dataset.doc }); });
    el.querySelector('#ok').onclick = () => close();
  }, { locked: true });
}

const stepBack = to => () => { step = to; go('onboarding', {}, true); };

function occasion() {
  return {
    hideNav: true, hideBack: true, onBack: stepBack(0),
    html: `
      <div class="onb">
        <div class="onb__body">
          ${mascot('think', 'mascot--md')}
          <h2 class="bups" style="font-size:32px;color:var(--mango)">кому дарим?</h2>
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
          app.querySelectorAll('[data-cat]').forEach(x => x.classList.remove('cat--on'));
          b.classList.add('cat--on');
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
    hideNav: true, hideBack: true, onBack: stepBack(1),
    html: `
      <div class="onb">
        <div class="onb__body onb__body--compact">
          ${mascot('notes', 'mascot--sm')}
          <h2 class="bups" style="font-size:28px;color:var(--mango);margin:2px 0 0">первая дата</h2>
          <p class="muted small" style="margin:0">Добавь день рождения близкого — напомним заранее</p>
          <div class="field-stack">
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
  import('../app.js?v=2609211121').then(m => m.offerPendingPromo());
}
