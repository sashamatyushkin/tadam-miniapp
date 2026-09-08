// ── Обучающие подсказки: «куда я попал и что тут можно» ──────────────
// Показываются один раз: общая по нижнему меню + по одной на Главной,
// в Вишлисте и в Профиле. Факт показа хранится в состоянии пользователя.
import { tipSeen, markTip, track } from '../store.js';
import { $, mascot, esc } from '../ui.js';
import { tg } from '../tg.js';

const TIPS = {
  menu: {
    mascot: 'wave', spot: true, title: 'привет! это та-дам',
    sub: 'Помогаю придумать подарок за пару секунд. Внизу — четыре раздела:',
    items: [
      ['🏠', 'Главная', 'Поводы и идеи подарков. Отсюда всё начинается'],
      ['💖', 'Вишлист', 'Твои желания и намёки близким'],
      ['🎡', 'Колесо', 'Бесплатный спин раз в день — бонусы и скидки'],
      ['👤', 'Профиль', 'Важные даты, доступ, награды и настройки']
    ]
  },
  home: {
    mascot: 'search', title: 'как искать подарок',
    sub: 'Повод — главная дверь. Дальше всё за пару касаний:',
    items: [
      ['🎂', 'Выбери повод', 'Три открыты сразу, остальные — под замком'],
      ['🎛️', 'Сузь фильтрами', 'Кому, бюджет, интересы'],
      ['🤍', 'Жми на сердечко', 'Идея улетает в твой вишлист'],
      ['🔍', 'Или ищи словом', 'Например «кофе» или «плед»']
    ]
  },
  wishlist: {
    mascot: 'heart', title: 'зачем вишлист',
    sub: 'Это список желаний — твоих и для близких:',
    items: [
      ['💖', 'Копи идеи', 'Сохраняй из подборок или добавляй свои'],
      ['💌', 'Намекни', 'Карточка-намёк уходит близкому прямо в Telegram'],
      ['🔗', 'Поделись ссылкой', 'Её видно только тем, кому отправил — и можно отозвать']
    ]
  },
  profile: {
    mascot: 'notes', title: 'что в профиле',
    sub: 'Всё, что возвращает тебя вовремя:',
    items: [
      ['📅', 'Важные даты', 'Добавь дни рождения — напомним заранее'],
      ['⭐', 'Мой доступ', 'Что открыто сейчас и как открыть остальное'],
      ['🎁', 'Награды', 'Бонусы из колеса и за заполненный профиль'],
      ['✅', 'Заполни и получи', 'Три шага — и открываем категорию на 24 часа']
    ]
  }
};

let showing = false;

export function showTip(key, onDone) {
  const t = TIPS[key];
  if (!t || showing) return onDone?.();
  showing = true;
  track('coach_viewed', { key });

  const bg = document.createElement('div');
  bg.className = 'coach-bg';
  const box = document.createElement('div');
  box.className = 'coach' + (t.spot ? '' : ' coach--center');
  box.innerHTML = `
    <div class="coach__card">
      ${mascot(t.mascot, 'coach__mascot')}
      <div class="coach__title">${esc(t.title)}</div>
      <div class="coach__sub">${esc(t.sub)}</div>
      <div class="coach__list">
        ${t.items.map(([ico, name, desc]) => `
          <div class="coach__item">
            <div class="coach__ico">${ico}</div>
            <div><div class="coach__t">${esc(name)}</div><div class="coach__d">${esc(desc)}</div></div>
          </div>`).join('')}
      </div>
      <button class="btn" data-ok>Понятно</button>
    </div>`;

  const bar = $('#tabbar');
  if (t.spot) bar?.classList.add('tabbar--spot');
  document.body.append(bg, box);
  tg.haptic('light');

  const close = () => {
    bar?.classList.remove('tabbar--spot');
    bg.remove(); box.remove();
    showing = false;
    markTip(key);
    onDone?.();
  };
  box.querySelector('[data-ok]').onclick = close;
  bg.onclick = close;
}

// Показывает нужные подсказки для экрана — по одной, очередью.
export function maybeShowTips(screen) {
  const queue = (screen === 'home' ? ['menu', 'home'] : [screen]).filter(k => !tipSeen(k));
  if (!queue.length) return;
  const next = () => { const k = queue.shift(); if (k) showTip(k, next); };
  setTimeout(next, 420);           // даём экрану отрисоваться
}

export function tipsList() { return Object.keys(TIPS); }
