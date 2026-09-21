// ── Та-дам · продуктовая конфигурация ────────────────────────────────
// Значения НЕ зашиты в компоненты: в проде этот файл заменяется ответом API
// (админка → БД). Здесь он играет роль «сервера конфигурации» прототипа.

// Адрес backend API. Пусто → приложение работает полностью офлайн-локально,
// как раньше (никто из тестировщиков без запущенного сервера ничего не потеряет).
// На время тестовой сессии можно не редактировать файл, а передать адрес прямо
// в ссылке: ?api=https://<туннель>.trycloudflare.com — так каждый тестовый прогон
// (адрес туннеля меняется) не требует нового коммита. Сохраняется в localStorage,
// чтобы держался между перезаходами в это тестовое окно.
// Боевой адрес API — вписать сюда при выкладке (например 'https://api.tadam.ru').
// Пока пусто, приложение работает автономно.
const PROD_API_BASE = '';

function resolveApiBase() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('api');
    if (fromUrl) { localStorage.setItem('tadam_api_base', fromUrl); return fromUrl; }
    return localStorage.getItem('tadam_api_base') || PROD_API_BASE;
  } catch (e) { return PROD_API_BASE; }
}
export const API_BASE = resolveApiBase();

// Служебный режим для тестировщиков: кнопка «сбросить всё до первого запуска».
// Обычный пользователь его не видит. Включается ссылкой с ?debug=1 (запоминается
// на устройстве), выключается ссылкой с ?debug=0.
function resolveDebug() {
  try {
    const q = new URLSearchParams(location.search).get('debug');
    // Тестовая ссылка через бота: t.me/<бот>?start=debug → кнопка открывает приложение с startapp=debug
    const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('startapp');
    if (q === '1' || sp === 'debug') localStorage.setItem('tadam_debug', '1');
    if (q === '0') localStorage.removeItem('tadam_debug');
    return localStorage.getItem('tadam_debug') === '1';
  } catch (e) { return false; }
}
export const DEBUG = resolveDebug();

export const CONFIG = {
  version: '1.1.0',
  limits: {
    freeWishlists: 1,          // вишлистов на бесплатном тарифе
    freeDates: 1,              // важных дат с напоминанием на бесплатном тарифе
    freeHintsPerDay: 3,        // «Намекни» в чат без premium — ограниченно
    dailySpins: 1,             // бесплатных спинов в сутки
    maxBonusSpinsPerDay: 10,   // предохранитель от бесконечной цепочки «+1 спин»
    referralSpinsPerDay: 5     // потолок спинов за приглашённых друзей в сутки
  },
  reminders: { defaultOffsets: [14, 7, 3, 1] }, // за сколько дней напоминать
  // Тарифная сетка клиента («Та-дам тарифы.pdf»): оба платных тарифа открывают весь
  // premium, разница — в сроке. «Навсегда» — бессрочный доступ, его же даёт UGC-программа.
  products: [
    { id: 'week', title: 'На праздник', sub: 'доступ 7 дней', priceRub: 149, days: 7, per: '7 дней',
      who: 'Горит конкретный подарок прямо сейчас. Нужно быстро найти идею к близкой дате — и всё. Разовая задача — разовая оплата.' },
    { id: 'forever', title: 'Навсегда', sub: 'бессрочно', priceRub: 490, promoRub: 300, days: null, per: 'навсегда', best: true,
      who: 'Хочешь пользоваться круглый год: помнить все даты близких, копить вишлисты, ловить каждый праздник по календарю. Один раз заплатил — забыл о доступе.' }
  ],
  // Сравнение тарифов: [название, пояснение, бесплатно, на праздник, навсегда]
  compare: [
    ['Категории поводов', 'др, НГ, 8 марта, годовщина и др.', '3 из 13', 'все 13', 'все 13'],
    ['Идей в категории', 'банк вау-идей', '20', '40', '40'],
    ['Фильтры подбора', 'кому · бюджет · интересы', '—', '✓', '✓'],
    ['«Намекни» в чат', 'карточка-подсказка близким', 'ограниченно', 'без лимита', 'без лимита'],
    ['Вишлисты', 'списки желаний', '1', 'безлимит', 'безлимит'],
    ['Напоминания о датах', 'др близких, годовщины', '1 дата', 'на 7 дней', 'весь год, безлимит'],
    ['Календарь праздников', 'подсветка всех поводов года', '—', 'частично', 'полностью'],
    ['Срок доступа', '', '—', '7 дней', 'навсегда']
  ]
};

// ── Поводы: 3 бесплатных + 10 premium ────────────────────────────────
export const CATEGORIES = [
  { id: 'birthday',  name: 'день\nрождения',     emoji: '🎂', free: true,  bg: 'linear-gradient(150deg,#F74101,#FF8A4C)' },
  { id: 'newyear',   name: 'новый\nгод',         emoji: '🎄', free: true,  bg: 'linear-gradient(150deg,#1F7A55,#54B183)' },
  { id: 'justso',    name: 'просто\nтак',        emoji: '💫', free: true,  bg: 'linear-gradient(150deg,#6C4FD1,#A98BF0)' },
  { id: 'anniv',     name: 'годовщина',          emoji: '💍', free: false, bg: 'linear-gradient(150deg,#702720,#9E4034)' },
  { id: 'feb23',     name: '23 февраля',         emoji: '🛡️', free: false, bg: 'linear-gradient(150deg,#2C5F8A,#5D93BE)', season: [1, 2] },
  { id: 'mar8',      name: '8 марта',            emoji: '🌷', free: false, bg: 'linear-gradient(150deg,#C74B78,#EE86AB)', season: [2, 3] },
  { id: 'baby',      name: 'рождение\nребёнка',  emoji: '👶', free: false, bg: 'linear-gradient(150deg,#3E9BD6,#8FCDF2)' },
  { id: 'home',      name: 'новоселье',          emoji: '🏡', free: false, bg: 'linear-gradient(150deg,#C96A1E,#EDA95B)' },
  { id: 'school',    name: 'выпускной\n1 сентября', emoji: '🎓', free: false, bg: 'linear-gradient(150deg,#3B4A9E,#7C89D8)', season: [4, 5, 7] }, // май–июнь и август (месяцы с нуля)
  { id: 'wedding',   name: 'свадьба',            emoji: '💐', free: false, bg: 'linear-gradient(150deg,#B8425C,#E88198)' },
  { id: 'colleague', name: 'коллеге\nпо работе', emoji: '💼', free: false, bg: 'linear-gradient(150deg,#1F7E7A,#59B3AE)' },
  { id: 'kid',       name: 'ребёнку',            emoji: '🧸', free: false, bg: 'linear-gradient(150deg,#E0A21B,#F5C95C)' },
  { id: 'jubilee',   name: 'юбилей',             emoji: '🥂', free: false, bg: 'linear-gradient(150deg,#8A5A2B,#C39461)' }
];

// ── Три универсальных фильтра ────────────────────────────────────────
export const RECIPIENTS = [
  { id: 'mom', name: 'Маме' }, { id: 'dad', name: 'Папе' }, { id: 'partner', name: 'Партнёру' },
  { id: 'friend', name: 'Другу' }, { id: 'colleague', name: 'Коллеге' }, { id: 'child', name: 'Ребёнку' },
  { id: 'family', name: 'Семье' }, { id: 'teacher', name: 'Учителю' }
];
export const BUDGETS = [
  { id: 1000, name: 'до 1 000 ₽' }, { id: 3000, name: 'до 3 000 ₽' }, { id: 5000, name: 'до 5 000 ₽' },
  { id: 10000, name: 'до 10 000 ₽' }, { id: 99999, name: 'дороже 10 000 ₽' }
];
// Группы интересов — из 77 тегов базы идей (см. tools/import_ideas.py)
export const INTERESTS = [
  { id: 'memory', name: 'память и эмоции' }, { id: 'food', name: 'еда и напитки' },
  { id: 'impressions', name: 'впечатления' }, { id: 'home', name: 'дом и уют' },
  { id: 'romance', name: 'романтика' }, { id: 'fun', name: 'игры и юмор' },
  { id: 'creative', name: 'творчество' }, { id: 'learning', name: 'обучение' },
  { id: 'style', name: 'красота и стиль' }, { id: 'care', name: 'забота и здоровье' },
  { id: 'music', name: 'музыка и кино' }, { id: 'tech', name: 'техника' },
  { id: 'family', name: 'семья и дети' }, { id: 'magic', name: 'космос и магия' }
];

// ── Колесо фортуны (ТЗ «Та-дам колесо фортуны», версия 1.0) ──────────
// Два колеса: №1 — бесплатным и тарифу «На праздник», №2 — тарифу «Навсегда».
// Уже полученный приз при повторе честно превращается в +1 спин (см. store.js / server/wheel.js).
// weight — значения по умолчанию; живые веса приходят с сервера (правятся в админке без выкладки).
const EMPTY = { code: 'empty', title: 'Повезёт в следующий раз!', color: '#F1E3CE', text: '#702720', short: 'Повезёт\nв след. раз' };
const BOUQ  = { code: 'guide_bouquets', title: 'Гайд: 12 вау-букетов', color: '#F74101', text: '#fff', short: 'Гайд:\n12 букетов' };
const TIME  = { code: 'guide_timecodes', title: 'Гайд: таймкоды для записок', color: '#CBE5FE', text: '#173F63', short: 'Гайд:\nтаймкоды' };
const SPIN  = { code: 'spin', title: 'Дополнительный спин', color: '#FF8A4C', text: '#fff', short: 'Ещё\nспин' };
export const WHEEL = {
  ruleVersion: 'v2',
  free: [
    { ...EMPTY, weight: 34 },
    { ...BOUQ, weight: 12 },
    { code: 'category', title: 'Категория на сутки', color: '#702720', text: '#fff', short: 'Категория\nна сутки', weight: 18 },
    { ...TIME, weight: 12 },
    { ...SPIN, weight: 16 },
    { code: 'discount', title: 'Скидка на «Навсегда»: 490 → 300 ₽', color: '#1F7A55', text: '#fff', short: 'Скидка\n490→300', weight: 8 }
  ],
  premium: [
    { ...EMPTY, weight: 34 },
    { ...BOUQ, weight: 14 },
    { ...TIME, weight: 14 },
    { ...SPIN, weight: 18 },
    { code: 'friend_discount', title: 'Скидка для друга', color: '#702720', text: '#fff', short: 'Скидка\nдля друга', weight: 12 },
    { code: 'friend_gift', title: 'Подарок другу: 3 дня premium', color: '#1F7A55', text: '#fff', short: 'Другу\n3 дня', weight: 8 }
  ],
  friendDiscountRub: 300,      // по промокоду друга «Навсегда» стоит 300 ₽ вместо 490
  friendGiftDays: 3,
  friendCodesPer30Days: 3      // лимит промокодов/подарков для друзей за 30 дней, дальше → +1 спин
};

// Гайды-призы колеса. Картинки лежат в assets/guides, на сервере — в таблице guides.
export const GUIDES = {
  guide_bouquets: { title: '12 вау-букетов', img: 'assets/guides/bouquets.jpg', emoji: '💐' },
  guide_timecodes: { title: 'Таймкоды для записок', img: 'assets/guides/timecodes.jpg', emoji: '🎬' }
};

// Юридические документы (тексты — в папке docs/, из файлов клиента)
export const DOCS = {
  offer: 'Публичная оферта',
  privacy: 'Политика обработки персональных данных',
  'pd-consent': 'Согласие на обработку персональных данных',
  'ads-consent': 'Согласие на получение рекламных рассылок'
};
export const DOCS_VERSION = '2026-09-17';   // дата редакции документов клиента

// ── Друзья бренда (UGC 100k+) — наполняется из админки ───────────────
// Пока пусто: на экране показывается «Упс, пока тут пусто». Формат записи:
// { nick: '@nickname', platform: 'Reels', idea: 'Идея подарка', desc: 'Пара слов о ролике' }
export const BRAND_FRIENDS = [];

// Ники бренда в соцсетях. Пока не забронированы — пусто, и в текстах пишем
// «упоминание Та-дам» без @. Как появятся — впиши сюда, тексты подхватят сами.
export const SOCIAL = { nick: '' };

export const REMINDER_TYPES = [
  { id: 'birthday', name: 'День рождения' }, { id: 'anniv', name: 'Годовщина' },
  { id: 'newyear', name: 'Новый год' }, { id: 'other', name: 'Другое' }
];
export const RELATIONS = [
  { id: 'mom', name: 'мама' }, { id: 'dad', name: 'папа' }, { id: 'partner', name: 'партнёр' },
  { id: 'friend', name: 'друг' }, { id: 'colleague', name: 'коллега' }, { id: 'child', name: 'ребёнок' }
];

// ── Ссылки Telegram ──────────────────────────────────────────────────
// Заполняется после создания бота в BotFather: t.me/<bot>/<app>
export const TELEGRAM = {
  botUsername: 'tadamapp_bot',  // без @
  appName: '',                  // короткое имя из /newapp, если создашь именованный Mini App
  supportUrl: 'https://t.me/tadamapp_bot'
};

// Ссылка-намёк/приглашение.
// 1) есть именованный Mini App (/newapp) → t.me/<bot>/<app>?startapp=… — открывает приложение сразу;
// 2) иначе t.me/<bot>?start=… — бот встречает получателя и даёт кнопку с этим же параметром;
// 3) вне Telegram — обычная веб-ссылка.
export function deepLink(startParam) {
  if (TELEGRAM.botUsername && TELEGRAM.appName)
    return `https://t.me/${TELEGRAM.botUsername}/${TELEGRAM.appName}?startapp=${startParam}`;
  if (TELEGRAM.botUsername)
    return `https://t.me/${TELEGRAM.botUsername}?start=${startParam}`;
  return location.origin + location.pathname + '?startapp=' + startParam;
}
