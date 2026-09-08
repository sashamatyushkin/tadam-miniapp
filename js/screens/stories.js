// ── Сторис на главной (как в банковских приложениях) ────────────────
// Подборка под ситуацию: сезон, ближайшая дата близкого, механики.
// Каждая сторис ведёт в конкретный повод, вишлист или механику.
import { state, save, track, daysUntil, isPremium, questComplete } from '../store.js?v=2609081709';
import { CATEGORIES } from '../config.js?v=2609081709';
import { esc, mascot, plural } from '../ui.js?v=2609081709';
import { tg } from '../tg.js?v=2609081709';
import { go } from '../app.js?v=2609081709';

const G = {
  ny:     'linear-gradient(160deg,#1F7A55,#54B183)',
  mango:  'linear-gradient(160deg,#F74101,#FF8A4C)',
  coffee: 'linear-gradient(160deg,#702720,#9E4034)',
  ice:    'linear-gradient(160deg,#3E9BD6,#8FCDF2)',
  purple: 'linear-gradient(160deg,#6C4FD1,#A98BF0)',
  rose:   'linear-gradient(160deg,#C74B78,#EE86AB)',
  gold:   'linear-gradient(160deg,#C9861E,#F5C95C)'
};

// Сезонная сторис — по месяцу (в проде период задаёт админка)
function seasonal(month) {
  if (month === 10 || month === 11 || month === 0) return {
    id: 'ny', title: 'Скоро\nНовый год', emoji: '🎄', bg: G.ny,
    slides: [
      { bg: G.ny, mascot: 'run', title: 'до нового года\nсовсем чуть-чуть', text: 'Хорошие подарки разбирают в декабре. Соберём идеи сейчас — вручим спокойно.' },
      { bg: G.ny, mascot: 'wow', title: '20 идей\nпод ёлку', text: 'От адвент-календаря ручной работы до тура выходного дня. Бюджет — от тысячи.' }
    ],
    cta: { label: 'Открыть идеи к Новому году', route: 'cat', params: { id: 'newyear' } }
  };
  if (month === 1) return {
    id: 'feb23', title: '23 февраля\nблизко', emoji: '🛡️', bg: G.ice,
    slides: [
      { bg: G.ice, mascot: 'think', title: 'мужчинам —\nбез носков', text: 'Гриль-набор, картинг, барбершоп или полёт на симуляторе. Двенадцать живых идей.' }
    ],
    cta: { label: 'Посмотреть идеи', route: 'cat', params: { id: 'feb23' } }
  };
  if (month === 2) return {
    id: 'mar8', title: '8 марта\nна носу', emoji: '🌷', bg: G.rose,
    slides: [
      { bg: G.rose, mascot: 'heart', title: 'не только\nцветы', text: 'Спа на двоих, подписка на букеты, украшение с камнем месяца — выбирай под человека.' }
    ],
    cta: { label: 'Открыть идеи к 8 марта', route: 'cat', params: { id: 'mar8' } }
  };
  if (month === 7 || month === 8) return {
    id: 'school', title: 'Скоро\n1 сентября', emoji: '🎓', bg: G.purple,
    slides: [
      { bg: G.purple, mascot: 'notes', title: 'собираем\nк школе', text: 'Рюкзак с ортопедической спинкой, наушники с шумодавом, курс по робототехнике.' }
    ],
    cta: { label: 'Открыть идеи', route: 'cat', params: { id: 'school' } }
  };
  return {
    id: 'justso', title: 'Порадовать\nбез повода', emoji: '💫', bg: G.purple,
    slides: [
      { bg: G.purple, mascot: 'bubble', title: 'подарок\nсреди недели', text: 'Работает сильнее праздничного — именно потому, что повода нет. Двадцать идей от тысячи рублей.' }
    ],
    cta: { label: 'Показать идеи', route: 'cat', params: { id: 'justso' } }
  };
}

// Персональная сторис — если у близкого скоро дата
function personal() {
  const soon = state.dates
    .map(d => ({ d, n: daysUntil(d.date) }))
    .filter(x => x.n <= 30)
    .sort((a, b) => a.n - b.n)[0];
  if (!soon) return null;
  const name = soon.d.name;
  const when = soon.n === 0 ? 'сегодня' : `через ${soon.n} ${plural(soon.n, 'день', 'дня', 'дней')}`;
  const occasion = { birthday: 'день рождения', anniv: 'годовщина', newyear: 'Новый год' }[soon.d.type] || 'праздник';
  return {
    id: 'soon-' + soon.d.id, title: `${name}\n${when}`, emoji: '🎂', bg: G.mango,
    slides: [{
      bg: G.mango, mascot: 'alert', title: `${name} —\n${when}`,
      text: `Скоро ${occasion}. Подкинуть идей? Соберём подборку под этот повод, а лучшее сохраним в вишлист.`
    }],
    cta: { label: 'Подкинуть идей', route: 'cat', params: { id: soon.d.type === 'anniv' ? 'anniv' : 'birthday' } }
  };
}

export function buildStories() {
  const list = [];
  const p = personal();
  if (p) list.push(p);
  list.push(seasonal(new Date().getMonth()));
  list.push({
    id: 'hint', title: 'Намекни\nблизким', emoji: '💌', bg: G.coffee,
    slides: [
      { bg: G.coffee, mascot: 'bubble', title: 'намёк вместо\nнеловкого разговора', text: 'Собери вишлист и отправь карточку-намёк в Telegram. Близкий увидит идею и поймёт без слов.' },
      { bg: G.coffee, mascot: 'heart', title: 'или поделись\nвсем списком', text: 'Одна ссылка — и родные выбирают сами. Её видит только тот, кому ты отправил.' }
    ],
    cta: { label: 'Открыть вишлист', route: 'wishlist', params: {} }
  });
  list.push({
    id: 'wheel', title: 'Спин\nкаждый день', emoji: '🎡', bg: G.gold,
    slides: [{ bg: G.gold, mascot: 'wow', title: 'бесплатный спин\nраз в сутки', text: 'Категория на 24 часа, эксклюзивная подборка, дополнительный слот вишлиста или скидка на premium.' }],
    cta: { label: 'Крутить колесо', route: 'wheel', params: {} }
  });
  if (!questComplete()) list.push({
    id: 'quest', title: 'Заполни\nи получи', emoji: '🎁', bg: G.mango,
    slides: [{ bg: G.mango, mascot: 'alert', title: 'три шага —\nи бонус твой', text: 'Добавь три важные даты, собери первый вишлист и укажи подарок мечты. Откроем premium-категорию на 24 часа.' }],
    cta: { label: 'Пройти', route: 'quest', params: {} }
  });
  if (!isPremium()) list.push({
    id: 'premium', title: 'Все 13\nповодов', emoji: '✦', bg: G.ice,
    slides: [{ bg: G.ice, mascot: 'cool', title: 'открыть\nвсё сразу', text: 'Все категории, все фильтры, безлимит вишлистов и напоминаний. На праздник — 149 ₽, навсегда — 490 ₽.' }],
    cta: { label: 'Посмотреть доступ', route: 'paywall', params: { from: 'story' } }
  });
  return list;
}

// ── лента кружков ────────────────────────────────────────────────────
export function storiesRow() {
  const list = buildStories();
  return `<div class="stories">${list.map(s => `
    <button class="story ${state.storiesSeen?.[s.id] ? 'story--seen' : ''}" data-story="${esc(s.id)}">
      <span class="story__ring"><span class="story__circle" style="background:${s.bg}">${s.emoji}</span></span>
      <span class="story__cap">${esc(s.title).replace(/\n/g, '<br>')}</span>
    </button>`).join('')}</div>`;
}

export function bindStories(root) {
  const list = buildStories();
  root.querySelectorAll('[data-story]').forEach(b => {
    b.onclick = () => {
      const idx = list.findIndex(s => s.id === b.dataset.story);
      if (idx >= 0) openStories(list, idx);
    };
  });
}

// ── просмотрщик ──────────────────────────────────────────────────────
const DUR = 6000;

export function openStories(list, index) {
  let si = index, sl = 0, timer = null, start = 0;

  const root = document.createElement('div');
  root.className = 'stv';
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';

  function close() {
    clearTimeout(timer);
    root.remove();
    document.body.style.overflow = '';
  }

  function seen(id) {
    state.storiesSeen = state.storiesSeen || {};
    state.storiesSeen[id] = Date.now();
    save();
  }

  function nextSlide() {
    const st = list[si];
    if (sl + 1 < st.slides.length) { sl++; return render(); }
    seen(st.id);
    if (si + 1 < list.length) { si++; sl = 0; return render(); }
    close();
  }
  function prevSlide() {
    if (sl > 0) { sl--; return render(); }
    if (si > 0) { si--; sl = list[si].slides.length - 1; return render(); }
    render();
  }

  function render() {
    const st = list[si], s = st.slides[sl];
    track('story_viewed', { id: st.id, slide: sl });
    root.innerHTML = `
      <div class="stv__screen" style="background:${s.bg}">
        <div class="stv__bars">${st.slides.map((_, k) =>
          `<i class="${k < sl ? 'done' : ''}">${k === sl ? '<b></b>' : ''}</i>`).join('')}</div>
        <div class="stv__top">
          <span class="stv__brand">та-дам</span>
          <button class="stv__x" type="button" aria-label="Закрыть">✕</button>
        </div>
        <div class="stv__body">
          ${mascot(s.mascot, 'stv__mascot')}
          <h2 class="bups stv__title">${esc(s.title).replace(/\n/g, '<br>')}</h2>
          <p class="stv__text">${esc(s.text)}</p>
        </div>
        <div class="stv__ft">
          <button class="btn stv__cta" type="button">${esc(st.cta.label)}</button>
        </div>
        <div class="stv__tap stv__tap--l"></div>
        <div class="stv__tap stv__tap--r"></div>
      </div>`;

    root.querySelector('.stv__x').onclick = e => { e.stopPropagation(); seen(st.id); close(); };
    root.querySelector('.stv__tap--l').onclick = prevSlide;
    root.querySelector('.stv__tap--r').onclick = nextSlide;
    root.querySelector('.stv__cta').onclick = e => {
      e.stopPropagation();
      track('story_cta', { id: st.id });
      seen(st.id); close(); tg.haptic('light');
      go(st.cta.route, st.cta.params);
    };

    clearTimeout(timer);
    start = Date.now();
    timer = setTimeout(nextSlide, DUR);
  }

  render();
}
