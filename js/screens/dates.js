// ── Важные даты и напоминания ────────────────────────────────────────
import { state, save, addDate, removeDate, daysUntil, datesLimit, isPremium, isFullPremium, reminderOffsets, track } from '../store.js?v=2609242257';
import { RELATIONS, REMINDER_TYPES, CONFIG, CATEGORIES } from '../config.js?v=2609242257';
import { esc, mascot, toast, confirmSheet, plural, fmtDate } from '../ui.js?v=2609242257';
import { tg } from '../tg.js?v=2609242257';
import { go } from '../app.js?v=2609242257';
import { apiAvailable } from '../api.js?v=2609242257';

export function render() {
  const list = state.dates.slice().sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">важные даты</h1></div>
      <div class="wrap">
        ${list.length ? `<div class="rows">${list.map(d => {
          const n = daysUntil(d.date);
          return `<div class="row">
            <span class="row__ico">🎂</span>
            <span class="row__t">${esc(d.name)}
              <div class="small muted" style="font-weight:400">${fmtDate(d.date)} · через ${n} ${plural(n, 'день', 'дня', 'дней')}</div>
            </span>
            <button class="idea__fav" data-del="${d.id}">✕</button>
          </div>`;
        }).join('')}</div>`
        : `<div class="empty">${mascot('notes', 'mascot--md')}<h3 class="h2">Дат пока нет</h3><p class="muted small">Добавь день рождения близкого — напомним заранее</p></div>`}
        <div class="spacer"></div>
        <button class="btn" id="add">Добавить дату</button>
        <button class="btn btn--soft" id="cal">📅 Календарь праздников</button>
        <div class="card" style="margin-top:16px">
          <div style="font-weight:800">Когда напоминаем</div>
          <p class="small muted">За ${reminderOffsets().join(', ')} ${plural(reminderOffsets().at(-1), 'день', 'дня', 'дней')} до события — сообщением от бота с готовой подборкой.</p>
          ${isFullPremium() ? '' : isPremium()
            ? `<p class="small muted">Сейчас — безлимит дат на время доступа «На праздник». С тарифом «Навсегда» напоминания работают весь год.</p>`
            : `<p class="small muted">Бесплатно — ${CONFIG.limits.freeDates} ${plural(CONFIG.limits.freeDates, 'дата', 'даты', 'дат')} с напоминанием. С premium — безлимит дат и напоминания за ${CONFIG.reminders.defaultOffsets.join(', ')} ${plural(CONFIG.reminders.defaultOffsets.at(-1), 'день', 'дня', 'дней')}.</p>`}
          <p class="small muted">Напоминания: ${state.settings.reminders ? 'включены' : 'выключены'} · изменить в «Настройках»</p>
          <p class="small muted">Напоминание придёт от бота Та-дам в 12:00 по Москве, даже если приложение закрыто.</p>
        </div>
      </div>`,
    mount(app) {
      app.querySelector('#add').onclick = () => {
        if (state.dates.length >= datesLimit()) {
          track('premium_limit_reached', { kind: 'dates' });
          return go('paywall', { from: 'dates_limit' });
        }
        go('dateform', {});
      };
      app.querySelector('#cal').onclick = () => go('calendar', {});
      app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        confirmSheet('Удалить дату?', 'Напоминания по ней больше не придут', 'Удалить', () => {
          removeDate(b.dataset.del);
          go('dates', {}, true);
        });
      });
    }
  };
}

export function renderForm() {
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">новая дата</h1></div>
      <div class="wrap">
        <div class="field"><label>Кого поздравляем</label><input id="n" placeholder="Мама Аня" maxlength="40"></div>
        <div class="field"><label>Кем приходится</label><select id="rel">${RELATIONS.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
        <div class="field"><label>Дата</label><input id="d" type="date"></div>
        <div class="field"><label>Повод</label><select id="t">${REMINDER_TYPES.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select></div>
        <div class="field"><label>Заметка</label><input id="note" placeholder="Любит керамику и кофе" maxlength="80"></div>
        <button class="btn" id="save">Сохранить</button>
      </div>`,
    mount(app) {
      app.querySelector('#save').onclick = () => {
        const name = app.querySelector('#n').value.trim();
        const d = app.querySelector('#d').value;
        if (!name || !d) return toast('Нужны имя и дата');
        addDate({
          name, date: d, relation: app.querySelector('#rel').value,
          type: app.querySelector('#t').value, note: app.querySelector('#note').value.trim(), annual: true
        });
        tg.haptic('success'); toast('Дата сохранена · напомним заранее ✨');
        go('dates', {}, true);
      };
    }
  };
}

// ── Календарь праздников ─────────────────────────────────────────────
// По тарифной сетке: бесплатно — закрыт, «На праздник» — частично (ближайшие 2 месяца),
// «Навсегда» — весь год. Каждый праздник ведёт в подходящий повод с идеями.
const nthSunday = (y, m, n) => { const d = new Date(y, m, 1); d.setDate(1 + (7 - d.getDay()) % 7 + (n - 1) * 7); return d; };
const lastSunday = (y, m) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - d.getDay()); return d; };
function holidays(y) {
  return [
    [new Date(y, 0, 7), 'Рождество', '⭐', 'newyear'],
    [new Date(y, 0, 25), 'Татьянин день · День студента', '🎓', 'school'],
    [new Date(y, 1, 14), 'День всех влюблённых', '💘', 'anniv'],
    [new Date(y, 1, 23), '23 февраля', '🛡️', 'feb23'],
    [new Date(y, 2, 8), '8 марта', '🌷', 'mar8'],
    [new Date(y, 3, 1), 'День смеха', '😄', 'justso'],
    [new Date(y, 5, 1), 'День защиты детей', '🧸', 'kid'],
    [new Date(y, 5, 25), 'Выпускные', '🎓', 'school'],
    [new Date(y, 6, 8), 'День семьи, любви и верности', '💞', 'anniv'],
    [new Date(y, 8, 1), 'День знаний', '📚', 'school'],
    [new Date(y, 8, 27), 'День воспитателя', '🍎', 'colleague'],
    [new Date(y, 9, 5), 'День учителя', '🍎', 'colleague'],
    [nthSunday(y, 9, 3), 'День отца', '👔', 'justso'],
    [new Date(y, 9, 31), 'Хэллоуин', '🎃', 'justso'],
    [lastSunday(y, 10), 'День матери', '💐', 'justso'],
    [new Date(y, 11, 31), 'Новый год', '🎄', 'newyear']
  ];
}

export function renderCalendar() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  // ближайшие 12 месяцев: праздники этого года, что ещё впереди, + уже прошедшие — в следующем году
  const list = [...holidays(y), ...holidays(y + 1)]
    .filter(([d]) => d >= today && d - today < 366 * 86400000)
    .map(([d, name, emoji, cat]) => ({ d, name, emoji, cat, n: Math.round((d - today) / 86400000) }));
  // Личные даты близких — тоже в календарь
  for (const x of state.dates) {
    const n = daysUntil(x.date);
    list.push({ d: new Date(today.getTime() + n * 86400000), name: x.name, emoji: '🎂', cat: x.type === 'anniv' ? 'anniv' : 'birthday', n, mine: true });
  }
  list.sort((a, b) => a.n - b.n);
  const full = isFullPremium(), part = isPremium() && !full;
  const open = h => full || (part && h.n <= 60) || h.mine;
  const months = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  let lastM = -1;
  track('calendar_viewed', { plan: full ? 'full' : part ? 'part' : 'free' });
  return {
    html: `
      <div class="topbar"><h1 class="topbar__title bups" style="color:var(--mango)">календарь праздников</h1></div>
      <div class="wrap">
        ${full ? '' : `<div class="info" style="margin-bottom:14px">
          <div style="font-weight:800">${part ? 'Открыты ближайшие 2 месяца' : 'Календарь — в premium'}</div>
          <div class="small" style="margin-top:4px">${part ? 'С тарифом «Навсегда» — все поводы года и напоминания о каждом.' : 'Подсветим все поводы года и подскажем идеи заранее. Твои личные даты видны всегда.'}</div>
          <button class="btn btn--sm" id="pw" style="margin-top:10px">${part ? 'Открыть весь год' : 'Смотреть тарифы'}</button>
        </div>`}
        ${list.map(h => {
          const m = h.d.getMonth();
          const head = m !== lastM ? `<div class="section-title" style="margin:14px 0 6px">${months[m]}</div>` : '';
          lastM = m;
          const o = open(h);
          return head + `<button class="calrow ${o ? '' : 'calrow--lock'} ${h.mine ? 'calrow--mine' : ''}" data-cat="${o ? h.cat : ''}">
            <span class="calrow__day"><b>${h.d.getDate()}</b></span>
            <span class="calrow__t">${h.emoji} ${esc(h.name)}<small>${h.n === 0 ? 'сегодня' : `через ${h.n} ${plural(h.n, 'день', 'дня', 'дней')}`}</small></span>
            <span class="calrow__go">${o ? '›' : '🔒'}</span>
          </button>`;
        }).join('')}
        <div class="spacer"></div>
      </div>`,
    mount(app) {
      app.querySelector('#pw')?.addEventListener('click', () => go('paywall', { from: 'calendar' }));
      app.querySelectorAll('.calrow').forEach(b => b.onclick = () => {
        if (!b.dataset.cat) { tg.haptic('warning'); return go('paywall', { from: 'calendar' }); }
        const cat = CATEGORIES.find(c => c.id === b.dataset.cat);
        go('cat', { id: cat.id });
      });
    }
  };
}
