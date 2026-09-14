// ── Точка входа: API + бот + планировщик напоминаний в одном процессе ──
// Запуск:  BOT_TOKEN=... node server/index.js
// (или: cd server && npm start — .env читается через --env-file, см. package.json)
import { startHttp } from './http.js';
import { startBot } from './bot.js';
import { startScheduler } from './reminders.js';

if (!process.env.BOT_TOKEN) {
  console.error('Нужна переменная окружения BOT_TOKEN. См. server/.env.example');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 8787;

startHttp(PORT);
startBot();
startScheduler();

// SIGTERM присылает хостинг/Docker при перезапуске — выходим сразу, SQLite в WAL переживает это без потерь
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { console.log(`\n${sig}: остановка…`); process.exit(0); });
process.on('unhandledRejection', e => console.error('[server] unhandledRejection', e));
