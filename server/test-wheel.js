// ── Статистический тест колеса ──────────────────────────────────────
// Не проверяет точную последовательность (она случайна по определению),
// но ловит грубое отклонение фактического распределения от весов
// и явные баги (например, если сумма весов не 100 или клиент мог бы
// повлиять на исход). См. ТЗ §32.
import { spin } from './wheel.js';
import { WHEEL_REWARDS } from './config.js';
import { db } from './db.js';

let failed = false;
function assert(cond, msg) { if (!cond) { failed = true; console.error('✗', msg); } else { console.log('✓', msg); } }

// 1) веса суммируются в разумное число (валидирует конфиг, не 100 жёстко —
// это веса, а не проценты, но для читаемости конфига держим сумму в 100)
const total = WHEEL_REWARDS.reduce((s, r) => s + r.weight, 0);
assert(total === 100, `сумма весов = ${total} (ожидалось 100 для читаемости конфига)`);

// 2) один и тот же idempotencyKey не запускает розыгрыш дважды
db.exec('DELETE FROM spin_results; DELETE FROM wheel_state;');
const userId = 999001;
const first = spin(userId, 'test-key-1');
const second = spin(userId, 'test-key-1');
assert(first.ok && second.ok && first.reward === second.reward && second.idempotent, 'повторный запрос с тем же ключом возвращает тот же результат');

// 3) дневной лимит соблюдается: второй спин в тот же день без бонусов должен быть отклонён
db.exec('DELETE FROM spin_results; DELETE FROM wheel_state;');
const u2 = 999002;
const s1 = spin(u2, 'k1');
const s2 = spin(u2, 'k2'); // другой ключ, тот же день — лимит должен сработать, если s1 не дал бонусный спин
if (s1.reward !== 'spin') {
  assert(s2.ok === false && s2.reason === 'no_spins', 'второй спин в тот же день без бонуса отклоняется');
} else {
  console.log('· пропущено (первый спин дал бонусный спин — второй легитимен)');
}

// 4) статистика на большой выборке не должна грубо отклоняться от весов
db.exec('DELETE FROM spin_results; DELETE FROM wheel_state;');
const N = 20000;
const counts = Object.fromEntries(WHEEL_REWARDS.map(r => [r.code, 0]));
for (let i = 0; i < N; i++) {
  db.exec('DELETE FROM wheel_state'); // сбрасываем дневной лимит, чтобы не спамить idempotency-ключами
  const r = spin(500000 + i, 'stat-' + i);
  if (r.ok) counts[r.reward]++;
}
let maxDrift = 0;
for (const r of WHEEL_REWARDS) {
  const expected = N * r.weight / 100;
  const actual = counts[r.code];
  const drift = Math.abs(actual - expected) / expected;
  maxDrift = Math.max(maxDrift, drift);
  console.log(`  ${r.code.padEnd(10)} вес ${String(r.weight).padStart(2)}%  ожидание ${expected.toFixed(0).padStart(5)}  факт ${String(actual).padStart(5)}  отклонение ${(drift * 100).toFixed(1)}%`);
}
assert(maxDrift < 0.12, `максимальное отклонение от веса < 12% на выборке ${N} (факт: ${(maxDrift * 100).toFixed(1)}%)`);

db.exec('DELETE FROM spin_results; DELETE FROM wheel_state;'); // не оставляем тестовый мусор в БД
console.log(failed ? '\nТЕСТЫ ПРОВАЛЕНЫ' : '\nВсе тесты пройдены');
process.exit(failed ? 1 : 0);
