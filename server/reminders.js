// ── Планировщик напоминаний о датах ────────────────────────────────────
// Работает поверх той же SQLite: даты хранятся здесь (не в CloudStorage
// клиента), поэтому бот может достучаться до них независимо от того,
// открыто ли сейчас приложение.
import { db } from './db.js';
import { sendMessage } from './telegram.js';

// Тот же алгоритм, что в js/store.js daysUntil — включая перенос 29 февраля на 1 марта.
function daysUntil(dateStr, from = new Date()) {
  const [, m, day] = dateStr.split('-').map(Number);
  const now = new Date(from); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), m - 1, day);
  if (next < now) next = new Date(now.getFullYear() + 1, m - 1, day);
  if (m === 2 && day === 29 && next.getMonth() !== 1) next = new Date(next.getFullYear(), 2, 1);
  return { days: Math.round((next - now) / 86400000), year: next.getFullYear() };
}

const WORD = (n, one, few, many) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
};

async function tick() {
  const dates = db.prepare('SELECT * FROM important_dates WHERE annual = 1').all();
  for (const d of dates) {
    const { days, year } = daysUntil(d.date);
    let offsets;
    try { offsets = JSON.parse(d.offsets); } catch (e) { offsets = [14, 7, 3, 1]; }
    if (!offsets.includes(days)) continue;

    // Идемпотентность: (date_id, offset, year) — уникальный ключ, повторный тик той же минуты
    // или перезапуск процесса не пришлют напоминание дважды.
    const already = db.prepare('SELECT 1 FROM reminder_log WHERE date_id = ? AND offset_days = ? AND year = ?').get(d.id, days, year);
    if (already) continue;

    const when = days === 0 ? 'сегодня' : `через ${days} ${WORD(days, 'день', 'дня', 'дней')}`;
    const text = `${d.name} — ${when} 🎂\nПодкинуть идей?`;
    const webapp = (process.env.WEBAPP_URL || 'https://sashamatyushkin.github.io/tadam-miniapp/').replace(/\/?$/, '/');
    const markup = { inline_keyboard: [[{ text: 'Подкинуть идей →', web_app: { url: `${webapp}?startapp=${d.type || 'birthday'}` } }]] };

    const res = await sendMessage(d.user_id, text, markup);
    // Логируем попытку, только если Telegram её принял — иначе пользователь заблокировал бота
    // или временная ошибка сети, и стоит попробовать ещё раз на следующем тике.
    if (res.ok) {
      db.prepare('INSERT OR IGNORE INTO reminder_log (date_id, offset_days, year, sent_at) VALUES (?, ?, ?, ?)')
        .run(d.id, days, year, Date.now());
    } else {
      console.error('[reminders] не удалось отправить', d.id, res.description);
    }
  }
}

let timer = null;
export function startScheduler(intervalMs = 15 * 60 * 1000) {
  tick().catch(e => console.error('[reminders] tick error', e));
  timer = setInterval(() => tick().catch(e => console.error('[reminders] tick error', e)), intervalMs);
  console.log(`[reminders] планировщик запущен, проверка каждые ${Math.round(intervalMs / 60000)} мин`);
}
export function stopScheduler() { clearInterval(timer); }
