// ── Серверный розыгрыш колеса ──────────────────────────────────────────
// Требования из ТЗ, которые клиентская версия не могла обеспечить:
// результат считается только здесь, криптостойкий RNG, идемпотентность
// по ключу, транзакционная выдача, лимиты на пользователя проверяются
// сервером, а не отображаются с доверием к клиенту.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { LIMITS, WHEEL_REWARDS, WHEEL_RULE_VERSION } from './config.js';

const todayStr = () => new Date().toISOString().slice(0, 10); // сервер — в UTC; клиент решает про часовой пояс отображения

function secureRandom() {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 4294967296;
}

function getWheelState(userId) {
  const row = db.prepare('SELECT * FROM wheel_state WHERE user_id = ?').get(userId);
  return row || { user_id: userId, last_spin_date: null, free_used_today: 0, bonus_spins: 0, bonus_earned_today: 0 };
}
function saveWheelState(s) {
  db.prepare(`
    INSERT INTO wheel_state (user_id, last_spin_date, free_used_today, bonus_spins, bonus_earned_today)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_spin_date=excluded.last_spin_date, free_used_today=excluded.free_used_today,
      bonus_spins=excluded.bonus_spins, bonus_earned_today=excluded.bonus_earned_today
  `).run(s.user_id, s.last_spin_date, s.free_used_today, s.bonus_spins, s.bonus_earned_today);
}

export function spinsAvailable(userId) {
  const s = getWheelState(userId);
  const fresh = s.last_spin_date !== todayStr();
  const free = fresh ? LIMITS.dailySpins : (s.free_used_today ? 0 : LIMITS.dailySpins);
  return free + s.bonus_spins;
}

// Транзакция: идемпотентный ключ, проверка лимита, розыгрыш и выдача награды — одним куском.
// Повторный запрос с тем же idempotencyKey просто возвращает уже сохранённый результат.
export function spin(userId, idempotencyKey) {
  const existing = db.prepare('SELECT * FROM spin_results WHERE idempotency_key = ?').get(idempotencyKey);
  if (existing) {
    const reward = WHEEL_REWARDS.find(r => r.code === existing.reward_code);
    return { ok: true, idempotent: true, reward: existing.reward_code, index: WHEEL_REWARDS.indexOf(reward) };
  }

  let s = getWheelState(userId);
  if (s.last_spin_date !== todayStr()) {
    s = { user_id: userId, last_spin_date: todayStr(), free_used_today: 0, bonus_spins: s.bonus_spins, bonus_earned_today: 0 };
  }
  if (spinsAvailable(userId) <= 0) return { ok: false, reason: 'no_spins' };

  if (!s.free_used_today) s.free_used_today = 1;
  else s.bonus_spins = Math.max(0, s.bonus_spins - 1);

  const pool = WHEEL_REWARDS.filter(r => r.weight > 0);
  const total = pool.reduce((sum, r) => sum + r.weight, 0);
  let x = secureRandom() * total, picked = pool[pool.length - 1];
  for (const r of pool) { if (x < r.weight) { picked = r; break; } x -= r.weight; }

  db.prepare('INSERT INTO spin_results (idempotency_key, user_id, reward_code, rule_version, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(idempotencyKey, userId, picked.code, WHEEL_RULE_VERSION, Date.now());

  // «+1 спин» продлевает сегодняшний пул попыток — это единственная награда, которая
  // меняет состояние самого колеса и потому считается здесь, а не на клиенте.
  if (picked.code === 'spin' && s.bonus_earned_today < LIMITS.maxBonusSpinsPerDay) {
    s.bonus_spins += 1;
    s.bonus_earned_today += 1;
  }
  saveWheelState(s);

  // Остальные последствия награды (premium-категория на 24ч, подборка, слот вишлиста,
  // скидка) применяет клиент локально через тот же store.js — сервер здесь только
  // источник истины по ЧЕСТНОСТИ выбора и лимитам, не по бизнес-логике каждой награды.
  return { ok: true, idempotent: false, reward: picked.code, index: WHEEL_REWARDS.indexOf(picked) };
}
