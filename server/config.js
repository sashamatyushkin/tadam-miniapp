// ── Конфигурация, дублирующая js/config.js ────────────────────────────
// ВАЖНО: значения ниже должны совпадать с js/config.js (CONFIG.limits, WHEEL).
// Дублирование — временное: frontend это браузерный ES-модуль с версионированными
// импортами (?v=...), server — отдельный Node-процесс. В proper-архитектуре (packages/config
// из структуры репозитория в ТЗ) это один shared-пакет; сейчас это осознанный компромисс
// прототипа, отмеченный явно, чтобы не разъехаться незаметно.
export const LIMITS = {
  freeWishlists: 3,
  freeDates: 5,
  dailySpins: 1,
  maxBonusSpinsPerDay: 3,
  referralSpinsPerDay: 5
};

export const REMINDER_OFFSETS = [14, 7, 3, 1];

// week/year — продаются; holiday — старое имя недельного тарифа, оставлено для совместимости
export const PRODUCTS = {
  week: { days: 7, type: 'week' },
  year: { days: 365, type: 'year' },
  holiday: { days: 7, type: 'week' }
};

// Вес — не процент: сумма проверяется тестом (server/test-wheel.js)
export const WHEEL_REWARDS = [
  { code: 'empty',    weight: 35 },
  { code: 'set',      weight: 20 },
  { code: 'category', weight: 15, premium: false },
  { code: 'slot',     weight: 12 },
  { code: 'spin',     weight: 10 },
  { code: 'discount', weight: 8,  premium: false }
];
export const WHEEL_RULE_VERSION = 'v1';
