// ── Конфигурация, дублирующая js/config.js ────────────────────────────
// ВАЖНО: значения ниже должны совпадать с js/config.js (CONFIG.limits, WHEEL).
// Дублирование — временное: frontend это браузерный ES-модуль с версионированными
// импортами (?v=...), server — отдельный Node-процесс. В proper-архитектуре это один
// shared-пакет; сейчас это осознанный компромисс, отмеченный явно.
export const LIMITS = {
  freeWishlists: 1,
  freeDates: 1,
  dailySpins: 1,
  maxBonusSpinsPerDay: 10,
  referralSpinsPerDay: 5
};

export const REMINDER_OFFSETS = [14, 7, 3, 1];

// Тарифы клиента: «На праздник» (7 дней) и «Навсегда». year — старый годовой тариф
// и награда UGC-программы; holiday — старое имя недельного, оставлено для совместимости.
export const PRODUCTS = {
  week: { days: 7, type: 'week', priceRub: 149 },
  forever: { days: null, type: 'forever', priceRub: 490 },
  year: { days: 365, type: 'year' },
  holiday: { days: 7, type: 'week' }
};

// Колесо по ТЗ клиента. Вес — не процент; живые веса правятся в админке (таблица wheel_weights),
// эти — значения по умолчанию при первом запуске. Порядок секторов = порядок на колесе в js/config.js.
export const WHEEL = {
  free: [
    { code: 'empty', weight: 34 },
    { code: 'guide_bouquets', weight: 12 },
    { code: 'category', weight: 18 },
    { code: 'guide_timecodes', weight: 12 },
    { code: 'spin', weight: 16 },
    { code: 'discount', weight: 8 }
  ],
  premium: [
    { code: 'empty', weight: 34 },
    { code: 'guide_bouquets', weight: 14 },
    { code: 'guide_timecodes', weight: 14 },
    { code: 'spin', weight: 18 },
    { code: 'friend_discount', weight: 12 },
    { code: 'friend_gift', weight: 8 }
  ],
  paidCategories: 10,           // сколько платных поводов может открыть приз «Категория на сутки»
  friendCodesPer30Days: 3,
  friendGiftDays: 3,
  friendDiscountRub: 300,
  discountRub: 300
};
export const WHEEL_RULE_VERSION = 'v2';

export const PRIZE_TITLES = {
  empty: 'Повезёт в следующий раз!', guide_bouquets: 'Гайд: 12 вау-букетов', guide_timecodes: 'Гайд: таймкоды для записок',
  category: 'Категория на сутки', spin: 'Дополнительный спин', discount: 'Скидка на «Навсегда»: 490 → 300 ₽',
  friend_discount: 'Скидка для друга', friend_gift: 'Подарок другу: 3 дня premium'
};
