// ── Важные даты и напоминания ────────────────────────────────────────
import { state, save, addDate, daysUntil, datesLimit, isPremium, track } from '../store.js';
import { RELATIONS, REMINDER_TYPES, CONFIG } from '../config.js';
import { esc, mascot, toast, confirmSheet, plural, fmtDate } from '../ui.js';
import { tg } from '../tg.js';
import { go } from '../app.js';

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
        <div class="card" style="margin-top:16px">
          <div style="font-weight:800">Когда напоминаем</div>
          <p class="small muted">За ${CONFIG.reminders.defaultOffsets.join(', ')} ${plural(CONFIG.reminders.defaultOffsets.at(-1), 'день', 'дня', 'дней')} до события — сообщением от бота с готовой подборкой.</p>
          <p class="small muted">Напоминания: ${state.settings.reminders ? 'включены' : 'выключены'} · изменить в «Настройках»</p>
          <p class="small muted">В прототипе даты сохраняются, но сообщения шлёт бот на сервере (см. README).</p>
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
      app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        confirmSheet('Удалить дату?', 'Напоминания по ней больше не придут', 'Удалить', () => {
          state.dates = state.dates.filter(d => d.id !== b.dataset.del);
          track('important_date_removed', {}); save(); go('dates', {}, true);
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
