// ── Сторис на главной (как в банковских приложениях) ────────────────
// Подборка под ситуацию: сезон, ближайшая дата близкого, механики.
// Каждая сторис ведёт в конкретный повод, вишлист или механику.
import { state, save, track, daysUntil, isPremium, profileFilled } from '../store.js?v=2609211121';
import { CATEGORIES } from '../config.js?v=2609211121';
import { esc, mascot, plural } from '../ui.js?v=2609211121';
import { tg } from '../tg.js?v=2609211121';
import { go } from '../app.js?v=2609211121';

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
  if (month === 7) return {
    id: 'school', title: 'Скоро\n1 сентября', emoji: '🎓', bg: G.purple,
    slides: [
      { bg: G.purple, mascot: 'notes', title: 'собираем\nк школе', text: 'Рюкзак с ортопедической спинкой, наушники с шумодавом, курс по робототехнике.' }
    ],
    cta: { label: 'Открыть идеи', route: 'cat', params: { id: 'school' } }
  };
  // 5 октября — День учителя: показываем с сентября по сам праздник
  if (month === 8 || (month === 9 && new Date().getDate() <= 5)) return {
    id: 'teacher', title: 'День\nучителя', emoji: '🍎', bg: G.gold,
    slides: [
      { bg: G.gold, mascot: 'notes', title: 'день учителя —\n5 октября', text: 'Учителю, воспитателю, тренеру или репетитору. Тот, кто вложил в ребёнка год, заслужил больше, чем коробку конфет.' },
      { bg: G.gold, emoji: '☕', title: 'без банальных\nкружек', text: 'Термокружка с гравировкой имени, органайзер на рабочий стол, ежедневник с тиснением — полезно и лично.' }
    ],
    cta: { label: 'Идеи для учителя', route: 'cat', params: { id: 'colleague' } }
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

// «Что такое Та-дам» — первая сторис для нового человека.
// slide.video — сюда встанет ролик, когда он будет готов (mp4, вертикальный 9:16);
// пока его нет, показываем слайды с маскотом.
const ABOUT = {
  id: 'about', title: 'Что такое\nТа-дам', emoji: '🎁', bg: G.mango,
  slides: [
    { bg: G.mango, mascot: 'wave', title: 'привет!\nя та-дам', text: 'Помогаю придумать подарок, от которого загорятся глаза, — на любой повод и для кого угодно.', video: '' },
    { bg: G.mango, mascot: 'search', title: 'идеи\nпод повод', text: 'Выбираешь повод и человека — получаешь подборку нетипичных идей с бюджетом и подсказкой, где купить.' },
    { bg: G.coffee, mascot: 'heart', title: 'вишлист\nи намёки', text: 'Сохраняй то, что хочешь сам, и отправляй близким намёк — без неловкого «что тебе подарить?».' },
    { bg: G.ice, mascot: 'notes', title: 'не забудем\nважные даты', text: 'Добавь дни рождения близких — бот напомнит заранее и сразу подкинет идей.' },
    { bg: G.gold, mascot: 'wow', title: 'и колесо\nкаждый день', text: 'Бесплатный спин раз в сутки: гайды с вау-букетами и таймкодами, категория на сутки и скидка на premium.' }
  ],
  cta: { label: 'Подобрать подарок', route: 'cat', params: { id: 'birthday' } }
};

// «Вау-идеи внутри» — четыре готовые сторис-картинки от клиента (1080×1920).
// У каждого слайда своя кнопка: ведёт в тот повод, из которого идея.
const WOW = {
  id: 'wow', title: 'Вау-идеи\nвнутри', emoji: '✨', bg: G.mango,
  slides: [
    { img: 'assets/stories/wow-1.jpg', cta: { label: 'Идеи на день рождения', route: 'cat', params: { id: 'birthday' } } },
    { img: 'assets/stories/wow-2.jpg', cta: { label: 'Идеи на Новый год', route: 'cat', params: { id: 'newyear' } } },
    { img: 'assets/stories/wow-3.jpg', cta: { label: 'Идеи на новоселье', route: 'cat', params: { id: 'home' } } },
    { img: 'assets/stories/wow-4.jpg' }
  ],
  cta: { label: 'Смотреть все подборки', route: 'home', params: {} }
};

// Сторис из админки. Хранится своей ссылкой (не переприсваивается), addAdminStories
// пушит в неё — buildStories() читает актуальное содержимое при каждом вызове.
const adminStories = [];
export function addAdminStories(list) {
  for (const r of list || []) {
    if (!r?.id || adminStories.some(s => s.id === r.id)) continue;
    adminStories.push({
      id: r.id, title: r.title, emoji: r.emoji || '✨', bg: G[r.bg] || G.mango,
      slides: [{ bg: G[r.bg] || G.mango, mascot: r.mascot || 'wow', title: r.slideTitle, text: r.slideText }],
      cta: { label: r.ctaLabel, route: r.ctaRoute || 'home', params: r.ctaParam ? { id: r.ctaParam } : {} }
    });
  }
}

export function buildStories() {
  const list = [];
  // Профиль — одно из первых действий: без него не подставим фильтры и не поймём, кому ты даришь
  if (!profileFilled()) list.push({
    id: 'profile', title: 'Расскажи\nо себе', emoji: '🙋', bg: G.ice,
    slides: [{ bg: G.ice, mascot: 'think', title: 'давай\nзнакомиться', text: 'Имя, пол, дата рождения и кому ты чаще всего даришь подарки. Минута — и подборки станут точнее, а мы поздравим тебя в твой день.' }],
    cta: { label: 'Заполнить профиль', route: 'me', params: {} }
  });
  const p = personal();
  if (p) list.push(p);
  list.push(ABOUT, WOW);
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
    slides: [{ bg: G.gold, mascot: 'wow', title: 'бесплатный спин\nраз в сутки', text: 'Гайд «12 вау-букетов», таймкоды для записок, категория на сутки или скидка на «Навсегда». Повторов нет — вместо них ещё спин.' }],
    cta: { label: 'Крутить колесо', route: 'wheel', params: {} }
  });
  if (!isPremium()) list.push({
    id: 'premium', title: 'Все 13\nповодов', emoji: '✦', bg: G.ice,
    slides: [{ bg: G.ice, mascot: 'cool', title: 'открыть\nвсё сразу', text: 'Все 13 поводов, 40 идей в каждом и фильтры: 149 ₽ на 7 дней — к празднику, или 490 ₽ навсегда.' }],
    cta: { label: 'Посмотреть доступ', route: 'paywall', params: { from: 'story' } }
  });
  list.push(...adminStories);
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
  const onBack = () => close();
  tg.pushBack(onBack);                        // «Назад» Telegram закрывает сторис, а не приложение

  function close() {
    clearTimeout(timer);
    root.remove();
    document.body.style.overflow = '';
    tg.popBack(onBack);
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
    const cta = s.cta || st.cta;
    track('story_viewed', { id: st.id, slide: sl });
    root.innerHTML = `
      <div class="stv__screen ${s.img ? 'stv__screen--img' : ''}" style="background:${s.bg || G.mango}">
        <div class="stv__bars">${st.slides.map((_, k) =>
          `<i class="${k < sl ? 'done' : ''}">${k === sl ? '<b></b>' : ''}</i>`).join('')}</div>
        <div class="stv__top">
          <span class="stv__brand">та-дам</span>
          <button class="stv__x" type="button" aria-label="Закрыть">✕</button>
        </div>
        ${s.img ? `<img class="stv__img" src="${esc(s.img)}?v=2609211121" alt="">` : `<div class="stv__body">
          ${s.video ? `<video class="stv__video" src="${esc(s.video)}" autoplay muted playsinline></video>`
            : s.emoji ? `<div class="stv__emoji">${s.emoji}</div>` : mascot(s.mascot, 'stv__mascot')}
          <h2 class="bups stv__title">${esc(s.title).replace(/\n/g, '<br>')}</h2>
          <p class="stv__text">${esc(s.text)}</p>
        </div>`}
        <div class="stv__ft">
          <button class="btn stv__cta" type="button">${esc(cta.label)}</button>
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
      go(cta.route, cta.params);
    };

    clearTimeout(timer);
    start = Date.now();
    timer = setTimeout(nextSlide, DUR);
  }

  render();
}
