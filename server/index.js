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

process.on('SIGINT', () => { console.log('\nОстановка…'); process.exit(0); });
