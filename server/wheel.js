// ── Серверный розыгрыш колеса (ТЗ «Та-дам колесо фортуны», v1.0) ─────
// Результат считается только здесь: криптостойкий RNG, идемпотентность по ключу,
// лимиты и проверка повторов на стороне сервера. Два колеса: №1 — бесплатным и
// тарифу «На праздник», №2 — «Навсегда». Уже полученный приз → честный +1 спин.
import { randomBytes } from 'node:crypto';
import { db, getEntitlement, isPremiumRow, isFullPremiumRow } from './db.js';
import { LIMITS, WHEEL, WHEEL_RULE_VERSION } from './config.js';

const todayStr = () => new Date().toISOString().slice(0, 10); // сервер — в UTC
const DAY = 86400000;

function secureRandom() {
  return randomBytes(4).readUInt32BE(0) / 4294967296;
}

// Веса из админки поверх значений по умолчанию
export function wheelWeights() {
  const rows = db.prepare('SELECT kind, code, weight FROM wheel_weights').all();
  const out = {};
  for (const kind of ['free', 'premium']) {
    out[kind] = {};
    for (const s of WHEEL[kind]) {
      const r = rows.find(x => x.kind === kind && x.code === s.code);
      out[kind][s.code] = r ? r.weight : s.weight;
    }
  }
  return out;
}
export function setWheelWeight(kind, code, weight) {
  if (!WHEEL[kind]?.some(s => s.code === code)) return false;
  db.prepare(`INSERT INTO wheel_weights (kind, code, weight) VALUES (?, ?, ?)
    ON CONFLICT(kind, code) DO UPDATE SET weight = excluded.weight`).run(kind, code, Math.max(0, Math.min(1000, Math.round(weight))));
  return true;
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

export const wheelKindFor = userId => isFullPremiumRow(getEntitlement(userId)) ? 'premium' : 'free';

const prizeCount = (userId, code, since = 0) =>
  db.prepare('SELECT COUNT(*) AS n FROM user_prizes WHERE user_id = ? AND code = ? AND created_at > ?').get(userId, code, since).n;

// Таблица конвертаций из ТЗ (раздел 04): получен ли уже приз
function alreadyHave(userId, code) {
  if (code === 'guide_bouquets' || code === 'guide_timecodes' || code === 'discount') return prizeCount(userId, code) > 0;
  if (code === 'category') return isPremiumRow(getEntitlement(userId)) || prizeCount(userId, 'category') >= WHEEL.paidCategories;
  if (code === 'friend_discount' || code === 'friend_gift') {
    const since = Date.now() - 30 * DAY;
    const n = db.prepare('SELECT COUNT(*) AS n FROM friend_codes WHERE owner_id = ? AND created_at > ?').get(userId, since).n;
    return n >= WHEEL.friendCodesPer30Days;
  }
  return false;                                   // spin и empty — всегда валидны
}

function newFriendCode(userId, kind) {
  for (let i = 0; i < 5; i++) {
    const code = (kind === 'friend_gift' ? 'G' : 'D') + randomBytes(4).toString('hex').slice(0, 7).toUpperCase();
    try {
      db.prepare('INSERT INTO friend_codes (code, owner_id, kind, created_at) VALUES (?, ?, ?, ?)').run(code, userId, kind, Date.now());
      return code;
    } catch (e) { /* редкий дубль — пробуем ещё */ }
  }
  return null;
}

// Транзакция: идемпотентный ключ, лимит, розыгрыш, проверка повтора и выдача — одним куском.
export function spin(userId, idempotencyKey) {
  const existing = db.prepare('SELECT * FROM spin_results WHERE idempotency_key = ?').get(idempotencyKey);
  if (existing) {
    if (existing.user_id !== userId) return { ok: false, reason: 'bad_key' };
    const kind = wheelKindFor(userId);
    return { ok: true, idempotent: true, kind, reward: existing.reward_code, converted: !!existing.converted,
      friendCode: existing.friend_code || null, index: WHEEL[kind].findIndex(s => s.code === existing.reward_code) };
  }

  let s = getWheelState(userId);
  if (s.last_spin_date !== todayStr()) {
    s = { user_id: userId, last_spin_date: todayStr(), free_used_today: 0, bonus_spins: s.bonus_spins, bonus_earned_today: 0 };
  }
  if (spinsAvailable(userId) <= 0) return { ok: false, reason: 'no_spins' };
  if (!s.free_used_today) s.free_used_today = 1;
  else s.bonus_spins = Math.max(0, s.bonus_spins - 1);

  const kind = wheelKindFor(userId);
  const weights = wheelWeights()[kind];
  const pool = WHEEL[kind].filter(r => weights[r.code] > 0);
  const total = pool.reduce((sum, r) => sum + weights[r.code], 0);
  let x = secureRandom() * total, picked = pool[pool.length - 1];
  for (const r of pool) { if (x < weights[r.code]) { picked = r; break; } x -= weights[r.code]; }

  const now = Date.now();
  let converted = alreadyHave(userId, picked.code);
  let friendCode = null;
  if (!converted && (picked.code === 'friend_gift' || picked.code === 'friend_discount')) {
    friendCode = newFriendCode(userId, picked.code);
    if (!friendCode) converted = true;
  }
  const addSpin = () => {
    if (s.bonus_earned_today >= LIMITS.maxBonusSpinsPerDay) return;
    s.bonus_spins += 1; s.bonus_earned_today += 1;
  };
  if (converted || picked.code === 'spin') addSpin();
  if (!converted && picked.code !== 'spin' && picked.code !== 'empty')
    db.prepare('INSERT INTO user_prizes (user_id, code, meta, created_at) VALUES (?, ?, ?, ?)').run(userId, picked.code, friendCode || '', now);

  db.prepare('INSERT INTO spin_results (idempotency_key, user_id, reward_code, rule_version, created_at, converted, friend_code) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(idempotencyKey, userId, picked.code, WHEEL_RULE_VERSION, now, converted ? 1 : 0, friendCode);
  saveWheelState(s);

  return { ok: true, idempotent: false, kind, reward: picked.code, converted, friendCode, index: WHEEL[kind].indexOf(picked) };
}

// Друг активирует код: G… — 3 дня premium, D… — скидка на «Навсегда»
export function redeemFriendCode(userId, raw) {
  const code = String(raw || '').trim().toUpperCase();
  const row = db.prepare('SELECT * FROM friend_codes WHERE code = ?').get(code);
  if (!row) return { ok: false, error: 'bad_code' };
  if (row.owner_id === userId) return { ok: false, error: 'self' };
  if (row.redeemed_by) return { ok: false, error: row.redeemed_by === userId ? 'used' : 'used' };
  const ent = getEntitlement(userId);
  if (row.kind === 'friend_gift') {
    if (isFullPremiumRow(ent)) return { ok: false, error: 'has_forever' };
    const base = isPremiumRow(ent) && ent.until ? ent.until : Date.now();
    const type = isPremiumRow(ent) ? ent.type : 'gift';
    db.prepare(`INSERT INTO entitlements (user_id, type, until, source, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET type = excluded.type, until = excluded.until, source = excluded.source, updated_at = excluded.updated_at`)
      .run(userId, type, base + WHEEL.friendGiftDays * DAY, 'friend:' + code, Date.now());
  } else {
    db.prepare('INSERT INTO user_prizes (user_id, code, meta, created_at) VALUES (?, ?, ?, ?)').run(userId, 'promo', code, Date.now());
  }
  db.prepare('UPDATE friend_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ?').run(userId, Date.now(), code);
  return { ok: true, kind: row.kind, ownerId: row.owner_id };
}
