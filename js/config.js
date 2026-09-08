// ── Та-дам · продуктовая конфигурация ────────────────────────────────
// Значения НЕ зашиты в компоненты: в проде этот файл заменяется ответом API
// (админка → БД). Здесь он играет роль «сервера конфигурации» прототипа.

export const CONFIG = {
  version: '0.1.0-prototype',
  limits: {
    freeWishlists: 3,          // лимит вишлистов на free
    freeDates: 5,              // лимит важных дат на free
    freeIdeasPerCategory: 20,  // сколько идей видно без premium
    dailySpins: 1,             // бесплатных спинов в сутки
    maxBonusSpinsPerDay: 3,    // потолок бонусных спинов
    referralSpinsPerDay: 5     // потолок реферальных спинов
  },
  reminders: { defaultOffsets: [14, 7, 3, 1] }, // за сколько дней напоминать
  products: [
    { id: 'holiday', title: 'На праздник', sub: 'Полный доступ на 7 дней', priceRub: 149, promoRub: 99, days: 7 },
    { id: 'forever', title: 'Навсегда',    sub: 'Бессрочный доступ',        priceRub: 490, days: null, best: true }
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
  { id: 'school',    name: 'выпускной\n1 сентября', emoji: '🎓', free: false, bg: 'linear-gradient(150deg,#3B4A9E,#7C89D8)', season: [5, 8, 9] },
  { id: 'wedding',   name: 'свадьба',            emoji: '💐', free: false, bg: 'linear-gradient(150deg,#B8425C,#E88198)' },
  { id: 'colleague', name: 'коллеге\nпо работе', emoji: '💼', free: false, bg: 'linear-gradient(150deg,#1F7E7A,#59B3AE)' },
  { id: 'kid',       name: 'ребёнку',            emoji: '🧸', free: false, bg: 'linear-gradient(150deg,#E0A21B,#F5C95C)' },
  { id: 'jubilee',   name: 'юбилей',             emoji: '🥂', free: false, bg: 'linear-gradient(150deg,#8A5A2B,#C39461)' }
];

// ── Три универсальных фильтра ────────────────────────────────────────
export const RECIPIENTS = [
  { id: 'mom', name: 'Маме' }, { id: 'dad', name: 'Папе' }, { id: 'partner', name: 'Партнёру' },
  { id: 'friend', name: 'Другу' }, { id: 'colleague', name: 'Коллеге' }, { id: 'child', name: 'Ребёнку' }
];
export const BUDGETS = [
  { id: 1000, name: 'до 1 000 ₽' }, { id: 3000, name: 'до 3 000 ₽' }, { id: 5000, name: 'до 5 000 ₽' },
  { id: 10000, name: 'до 10 000 ₽' }, { id: 99999, name: 'дороже 10 000 ₽' }
];
export const INTERESTS = [
  { id: 'coffee', name: 'кофе' }, { id: 'sport', name: 'спорт' }, { id: 'books', name: 'книги' },
  { id: 'beauty', name: 'красота' }, { id: 'tech', name: 'техника' }, { id: 'home', name: 'дом/уют' },
  { id: 'travel', name: 'путешествия' }
];

// ── Колесо: веса наград (в проде — reward_probability_rules в БД) ────
export const WHEEL = {
  ruleVersion: 'v1',
  rewards: [
    { code: 'empty',    title: 'Повезёт в следующий раз', weight: 35, color: '#F1E3CE', text: '#702720', short: 'Пусто' },
    { code: 'set',      title: 'Эксклюзивная подборка',   weight: 20, color: '#F74101', text: '#fff',    short: 'Подборка' },
    { code: 'category', title: 'Категория на 24 часа',    weight: 15, color: '#702720', text: '#fff',    short: 'Категория' },
    { code: 'slot',     title: '+1 слот вишлиста',        weight: 12, color: '#CBE5FE', text: '#173F63', short: '+слот' },
    { code: 'spin',     title: '+1 дополнительный спин',  weight: 10, color: '#FF8A4C', text: '#fff',    short: '+спин' },
    { code: 'discount', title: 'Скидка 149 → 99 ₽',       weight: 8,  color: '#1F7A55', text: '#fff',    short: 'Скидка' }
  ]
};

// ── Друзья бренда (UGC 100k+) — в проде выдаёт админка ───────────────
export const BRAND_FRIENDS = [
  { nick: '@marina.gifts', platform: 'Reels', idea: 'Капсула времени на годовщину', desc: 'Письма друг другу, которые вскроете через год' },
  { nick: '@denis.life',   platform: 'TikTok', idea: 'Подкаст друзей про именинника', desc: 'Собрал 8 голосовых и склеил в один выпуск' },
  { nick: '@kate.stories', platform: 'Reels',  idea: 'Винил с памятными треками', desc: 'Печать своей пластинки с плейлистом ваших лет' },
  { nick: '@anna.creative', platform: 'YouTube', idea: 'Цветы с таймкодом из фильма', desc: 'Букет + записка со сценой, где он был в кадре' }
];

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
