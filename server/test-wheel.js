// ── Тест колеса по ТЗ ───────────────────────────────────────────────
// Запуск: npm test (или node test-wheel.js). Работает на отдельной временной базе —
// живые данные не трогает. Проверяет идемпотентность, дневной лимит, защиту от
// повторов (гайд/скидка → +1 спин), выбор колеса по тарифу, коды для друзей
// и что распределение призов на большой выборке соответствует весам.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
const dbFile = join(tmpdir(), `tadam-test-${process.pid}.sqlite`);
process.env.TADAM_DB = dbFile;
const { spin, wheelWeights, redeemFriendCode, wheelKindFor } = await import('./wheel.js');
const { db, grantEntitlement, getEntitlement } = await import('./db.js');
const { WHEEL } = await import('./config.js');

let failed = false;
const assert = (cond, msg) => { if (!cond) { failed = true; console.error('✗', msg); } else console.log('✓', msg); };
const reset = () => db.exec('DELETE FROM spin_results; DELETE FROM wheel_state; DELETE FROM user_prizes; DELETE FROM friend_codes; DELETE FROM entitlements;');
const forceWeights = (kind, code) => { for (const s of WHEEL[kind]) db.prepare('INSERT OR REPLACE INTO wheel_weights (kind, code, weight) VALUES (?, ?, ?)').run(kind, s.code, s.code === code ? 100 : 0); };

// 1) идемпотентность
reset();
const a = spin(1, 'k-1'), b = spin(1, 'k-1');
assert(a.ok && b.ok && a.reward === b.reward && b.idempotent, 'повторный запрос с тем же ключом возвращает тот же результат');

// 2) дневной лимит
reset(); forceWeights('free', 'empty');
spin(2, 'd-1');
const d2 = spin(2, 'd-2');
assert(!d2.ok && d2.reason === 'no_spins', 'второй спин в тот же день без бонуса отклоняется');

// 3) гайд: первый раз выдаётся, повтор → +1 спин
reset(); forceWeights('free', 'guide_bouquets');
const g1 = spin(3, 'g-1');
assert(g1.ok && !g1.converted, 'гайд выдаётся в первый раз');
db.exec('DELETE FROM wheel_state');
const g2 = spin(3, 'g-2');
assert(g2.ok && g2.converted, 'повтор гайда превращается в +1 спин');
assert(spin(3, 'g-3').ok, 'сконвертированный спин действительно можно прокрутить');

// 4) скидка на «Навсегда» — только один раз за всё время
reset(); forceWeights('free', 'discount');
const s1 = spin(4, 's-1'); db.exec('DELETE FROM wheel_state'); const s2 = spin(4, 's-2');
assert(!s1.converted && s2.converted, 'скидка выпадает один раз, дальше → +1 спин');

// 5) категория у того, у кого всё открыто («На праздник») → +1 спин
reset(); forceWeights('free', 'category');
grantEntitlement(5, 'week', Date.now() + 7 * 86400000, 'test');
assert(spin(5, 'c-1').converted, 'категория при открытом premium → +1 спин');

// 6) «Навсегда» получает колесо №2, коды для друзей работают и ограничены
reset(); forceWeights('premium', 'friend_gift');
grantEntitlement(6, 'forever', null, 'test');
assert(wheelKindFor(6) === 'premium' && wheelKindFor(7) === 'free', 'тариф «Навсегда» → колесо №2, остальные → №1');
const f1 = spin(6, 'f-1');
assert(f1.ok && /^G[0-9A-F]{7}$/.test(f1.friendCode || ''), 'подарок другу выдаёт уникальный код');
assert(redeemFriendCode(6, f1.friendCode).error === 'self', 'свой код активировать нельзя');
const r = redeemFriendCode(7, f1.friendCode);
assert(r.ok && getEntitlement(7).type === 'gift' && getEntitlement(7).until > Date.now() + 2.9 * 86400000, 'друг получает 3 дня premium');
assert(redeemFriendCode(8, f1.friendCode).error === 'used', 'код одноразовый');
for (let i = 2; i <= 3; i++) { db.exec('DELETE FROM wheel_state'); spin(6, 'f-' + i); }
db.exec('DELETE FROM wheel_state');
assert(spin(6, 'f-4').converted, `после ${WHEEL.friendCodesPer30Days} кодов за 30 дней → +1 спин`);

// 7) распределение на выборке соответствует весам по умолчанию
db.exec('DELETE FROM wheel_weights'); reset();
const W = wheelWeights().free, total = Object.values(W).reduce((s, x) => s + x, 0);
const N = 20000, counts = Object.fromEntries(Object.keys(W).map(k => [k, 0]));
for (let i = 0; i < N; i++) { const res = spin(100000 + i, 'stat-' + i); if (res.ok) counts[res.reward]++; }
let maxDrift = 0;
for (const [code, w] of Object.entries(W)) {
  const exp = N * w / total, drift = Math.abs(counts[code] - exp) / exp;
  maxDrift = Math.max(maxDrift, drift);
  console.log(`  ${code.padEnd(16)} вес ${String(w).padStart(3)}  ожидание ${exp.toFixed(0).padStart(5)}  факт ${String(counts[code]).padStart(5)}`);
}
assert(maxDrift < 0.12, `отклонение от весов < 12% на ${N} спинах (факт ${(maxDrift * 100).toFixed(1)}%)`);

db.close();
for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) rmSync(f, { force: true });
console.log(failed ? '\nТЕСТЫ ПРОВАЛЕНЫ' : '\nВсе тесты пройдены');
process.exit(failed ? 1 : 0);
