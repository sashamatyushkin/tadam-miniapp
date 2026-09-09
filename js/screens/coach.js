// ── Обучающий тур: подсветка области + блюр вокруг ───────────────────
// Механика подсмотрена в проекте «ЛМ воронка» (components/Tour.tsx):
// вырез рисуем не clip-path, а огромной тенью вокруг рамки — так у выреза
// настоящее скругление. Блюр добавляем четырьмя панелями вокруг выреза.
import { tipSeen, markTip, track } from '../store.js?v=2609091241';
import { $, mascot, esc } from '../ui.js?v=2609091241';
import { tg } from '../tg.js?v=2609091241';

// sel — что подсветить, pad — отступ вокруг, place — где предпочтительно карточка
const TOURS = {
  // Первый экран после онбординга — человек уже внутри повода. Три шага, ничего лишнего.
  ideas: [
    { sel: '.idea', take: 2, pad: 6, radius: 18, place: 'below', mascot: 'search',
      title: 'вот идеи',
      text: 'Список под твой повод: название, во сколько обойдётся и кому зайдёт. Нажми на любую — расскажу подробнее и покажу, где искать.' },
    { sel: '.chips', take: 3, pad: 4, radius: 22, place: 'below', mascot: 'think',
      title: 'сузь под человека',
      text: 'Кому дарим, сколько готов потратить и что он любит. Три фильтра — и остаются только подходящие идеи.' },
    { sel: '.idea__fav', pad: 8, radius: 999, place: 'below', mascot: 'heart',
      title: 'сердечко — в вишлист',
      text: 'Понравилась идея — жми сердечко. Она сохранится, и потом ей можно намекнуть близкому.' }
  ],
  // На главной объясняем устройство приложения: поводы, поиск и меню.
  home: [
    { sel: '.cats .cat', take: 4, pad: 8, radius: 26, place: 'below', mascot: 'wave',
      title: 'поводы',
      text: 'Главный экран — это поводы. Три открыты сразу, остальные под замком premium. Повод определяет подборку идей.' },
    { sel: '.search', pad: 6, radius: 999, place: 'below', mascot: 'think',
      title: 'найти идею подарка',
      text: 'Если знаешь, чего примерно хочешь, — напиши словом: «кофе», «плед», «фотосессия».' },
    { sel: '#tabbar', pad: 8, radius: 34, place: 'above', mascot: 'notes',
      title: 'четыре раздела',
      text: 'Главная — поводы и поиск. Вишлист — твои желания и намёки. Колесо — бесплатный спин раз в день. Профиль — важные даты, доступ и награды.' }
  ],
  // Появилось первое желание — объясняем, что с ним делать дальше.
  firstsave: [
    { sel: '[data-tab="wishlist"]', pad: 6, radius: 20, place: 'above', mascot: 'heart',
      title: 'идея сохранена',
      text: 'Она теперь в твоём вишлисте — вот здесь. Оттуда можно намекнуть близкому одной кнопкой или отправить весь список ссылкой.' }
  ],
  wishlist: [
    { sel: '.rows, .ghosts', take: 1, pad: 8, radius: 24, place: 'below', maxH: 0.42, mascot: 'heart',
      title: 'тут копятся желания',
      text: 'Сохраняй идеи из подборок сердечком или добавляй свои — например «плёночный фотоаппарат».' },
    { sel: '#hintAll', pad: 6, radius: 999, place: 'above', mascot: 'bubble',
      title: 'намекни',
      text: 'Карточка-намёк уходит близкому прямо в Telegram: он увидит идею и откроет её у себя.' },
    { sel: '#share', pad: 6, radius: 999, place: 'above', mascot: 'peek',
      title: 'ссылка на список',
      text: 'Её видит только тот, кому отправил. В любой момент можно отозвать — старая ссылка перестанет открываться.' }
  ],
  profile: [
    { sel: '[data-go="dates"]', pad: 4, radius: 14, place: 'below', mascot: 'notes',
      title: 'важные даты',
      text: 'Добавь дни рождения близких — напомним заранее, чтобы не бежать за подарком в последний вечер.' },
    { sel: '[data-go="paywall"]', pad: 4, radius: 14, place: 'below', mascot: 'cool',
      title: 'мой доступ',
      text: 'Что открыто сейчас и как открыть все 13 поводов со всеми фильтрами.' },
    { sel: '[data-go="quest"]', pad: 4, radius: 14, place: 'above', mascot: 'alert',
      title: 'заполни и получи',
      text: 'Три шага — три даты, первый вишлист и подарок мечты. За это открываем premium-категорию на 24 часа.' }
  ]
};

let active = false;
let pending = 0;          // отложенный запуск тура
let dismiss = null;       // как убрать открытый тур при уходе с экрана

function topSafe() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
  return v + 12;
}

export function startTour(name, onDone) {
  const steps = TOURS[name];
  if (!steps || active) return onDone?.();
  active = true;
  track('coach_viewed', { name });

  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <span class="tour__blur" data-b="t"></span><span class="tour__blur" data-b="b"></span>
    <span class="tour__blur" data-b="l"></span><span class="tour__blur" data-b="r"></span>
    <span class="tour__dim"></span>
    <span class="tour__ring"></span>
    <span class="tour__catch"></span>
    <div class="tour__wrap">
      <div class="tour__card">
        <i class="tour__arrow"></i>
        <div class="tour__head">
          <img class="tour__mascot" alt="">
          <div>
            <div class="tour__n"></div>
            <div class="tour__title bups"></div>
          </div>
        </div>
        <p class="tour__text"></p>
        <div class="tour__ft">
          <span class="tour__dots">${steps.map(() => '<i></i>').join('')}</span>
          <button class="tour__skip" type="button">Пропустить</button>
          <button class="tour__next" type="button">Далее</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const q = s => root.querySelector(s);
  const blur = { t: q('[data-b="t"]'), b: q('[data-b="b"]'), l: q('[data-b="l"]'), r: q('[data-b="r"]') };
  const dim = q('.tour__dim'), ring = q('.tour__ring'), wrap = q('.tour__wrap');
  const card = q('.tour__card'), arrow = q('.tour__arrow');

  let i = 0, cleanupScroll = null;

  function finish(silent) {
    cleanupScroll?.();
    root.remove();
    active = false;
    dismiss = null;
    if (!silent) markTip(name);              // ушёл с экрана — покажем тур в следующий раз
    onDone?.();
  }
  dismiss = () => finish(true);
  function next() { if (i + 1 < steps.length) { i++; render(); } else finish(); }

  q('.tour__skip').onclick = e => { e.stopPropagation(); track('coach_skipped', { name, step: i }); finish(); };
  q('.tour__next').onclick = e => { e.stopPropagation(); next(); };
  q('.tour__catch').onclick = next;

  function place() {
    const s = steps[i];
    const el = document.querySelector(s.sel);
    const vw = window.innerWidth, vh = window.innerHeight;

    if (!el) {                                    // элемента нет — просто затемняем
      Object.values(blur).forEach(b => b.style.cssText = 'left:0;top:0;right:0;bottom:0');
      dim.style.opacity = '0'; ring.style.opacity = '0'; arrow.style.display = 'none';
      wrap.style.top = Math.max(topSafe(), (vh - card.offsetHeight) / 2) + 'px';
      return;
    }

    let b = el.getBoundingClientRect();
    if (s.take > 1) {                             // объединяем первые N элементов в один вырез
      const list = [...document.querySelectorAll(s.sel)].slice(0, s.take).map(n => n.getBoundingClientRect());
      if (list.length > 1) {
        const L = Math.min(...list.map(n => n.left)), T = Math.min(...list.map(n => n.top));
        const R = Math.max(...list.map(n => n.right)), B = Math.max(...list.map(n => n.bottom));
        b = { left: L, top: T, width: R - L, height: B - T, right: R, bottom: B };
      }
    }
    const pad = s.pad ?? 6;
    const cap = (s.maxH || 0.6) * vh;
    const x = Math.max(4, b.left - pad);
    const y = Math.max(topSafe() - 8, b.top - pad);
    const w = Math.min(vw - 8, b.width + pad * 2);
    const h = Math.min(cap, b.height + pad * 2);
    const rad = Math.min(s.radius ?? 18, h / 2, w / 2);

    const box = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${rad}px`;
    dim.style.cssText = box; ring.style.cssText = box;
    dim.style.opacity = ring.style.opacity = '1';

    // блюр — четырьмя панелями вокруг выреза
    blur.t.style.cssText = `left:0;top:0;width:${vw}px;height:${Math.max(0, y)}px`;
    blur.b.style.cssText = `left:0;top:${y + h}px;width:${vw}px;height:${Math.max(0, vh - y - h)}px`;
    blur.l.style.cssText = `left:0;top:${y}px;width:${Math.max(0, x)}px;height:${h}px`;
    blur.r.style.cssText = `left:${x + w}px;top:${y}px;width:${Math.max(0, vw - x - w)}px;height:${h}px`;

    // карточка: предпочтительная сторона, иначе противоположная, иначе край
    const ch = card.offsetHeight, gap = 16, hi = topSafe(), lo = 12;
    const below = y + h + gap, above = y - gap - ch;
    const fitsBelow = below + ch <= vh - lo, fitsAbove = above >= hi;
    let top = s.place === 'below'
      ? (fitsBelow ? below : fitsAbove ? above : vh - ch - lo)
      : (fitsAbove ? above : fitsBelow ? below : vh - ch - lo);
    top = Math.min(Math.max(top, hi), Math.max(hi, vh - ch - lo));
    wrap.style.top = top + 'px';

    // стрелка к подсвеченной области
    const pointsUp = top > y;                     // карточка ниже выреза → стрелка вверх
    const cx = x + w / 2 - 14;                    // 14px — отступ .tour__wrap
    arrow.style.display = 'block';
    arrow.className = 'tour__arrow ' + (pointsUp ? 'tour__arrow--up' : 'tour__arrow--down');
    arrow.style.left = Math.min(Math.max(cx, 22), vw - 28 - 14) + 'px';
  }

  function render() {
    const s = steps[i];
    q('.tour__mascot').src = `assets/mascots/${s.mascot || 'wave'}.png`;
    const single = steps.length === 1;                 // одиночная подсказка — без «шаг 1 из 1»
    q('.tour__n').textContent = single ? 'подсказка' : `Шаг ${i + 1} из ${steps.length}`;
    q('.tour__dots').style.display = single ? 'none' : '';
    q('.tour__skip').style.display = single ? 'none' : '';
    q('.tour__title').textContent = s.title;
    q('.tour__text').textContent = s.text;
    q('.tour__next').textContent = i + 1 < steps.length ? 'Далее' : 'Понятно';
    root.querySelectorAll('.tour__dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    tg.haptic('light');

    const el = document.querySelector(s.sel);
    el?.scrollIntoView({ block: 'center', behavior: 'auto' });   // мгновенно: плавная прокрутка тут даёт дёрганье
    if (s.take > 1) {
      const last = [...document.querySelectorAll(s.sel)].slice(0, s.take).pop();
      if (last) last.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
    place();
    requestAnimationFrame(place);
  }

  let raf = 0;
  const onMove = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  window.addEventListener('resize', onMove);
  window.addEventListener('scroll', onMove, true);
  cleanupScroll = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onMove);
    window.removeEventListener('scroll', onMove, true);
  };

  render();
}

// Тур для экрана — только при первом заходе
export function maybeShowTips(screen) {
  if (!TOURS[screen] || tipSeen(screen)) return;
  clearTimeout(pending);
  pending = setTimeout(() => startTour(screen), 300);   // даём экрану отрисоваться
}

// Уход с экрана: снимаем и запланированный, и открытый тур — иначе подсветка
// осталась бы висеть над уже другим экраном.
export function dismissTour() {
  clearTimeout(pending); pending = 0;
  dismiss?.();
}

export function tourFor(screen) { return TOURS[screen]; }
