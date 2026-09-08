// ── Заготовка Telegram-бота для «Та-дам» ─────────────────────────────
// СТАТУС: код написан, но НЕ ЗАПУСКАЛСЯ и НЕ ТЕСТИРОВАЛСЯ — нужен токен бота.
// Запуск: BOT_TOKEN=xxx WEBAPP_URL=https://.../ node bot/bot.js
// Это long polling для локальной проверки. В production — webhook с secret token.

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP = process.env.WEBAPP_URL || 'https://sashamatyushkin.github.io/tadam-miniapp/';
if (!TOKEN) { console.error('Нужна переменная BOT_TOKEN'); process.exit(1); }

const API = `https://api.telegram.org/bot${TOKEN}`;
const seen = new Set();                       // идемпотентность по update_id

const call = (m, body) =>
  fetch(`${API}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json());

const openButton = { inline_keyboard: [[{ text: '🎁 Открыть Та-дам', web_app: { url: WEBAPP } }]] };

async function onMessage(msg) {
  const chat = msg.chat.id;
  const text = (msg.text || '').trim();
  const [cmd, arg] = text.split(' ');

  if (cmd === '/start') {
    const hi = arg ? `Ты пришёл по приглашению — держи бонусный спин 🎲\n\n` : '';
    return call('sendMessage', {
      chat_id: chat, reply_markup: openButton,
      text: `${hi}Привет! Я Та-дам 🎁\nПомогу придумать подарок, от которого загорятся глаза. Даже если идей совсем нет.`
    });
  }
  if (cmd === '/help')
    return call('sendMessage', { chat_id: chat, reply_markup: openButton, text: 'Открывай приложение и выбирай повод — дальше всё за пару касаний.\n\n/terms — условия\n/support — поддержка\n/paysupport — вопросы по оплате' });
  if (cmd === '/terms')
    return call('sendMessage', { chat_id: chat, text: 'Условия и политика приватности: ' + WEBAPP });
  if (cmd === '/support' || cmd === '/paysupport')
    return call('sendMessage', { chat_id: chat, text: 'Напиши сюда, что случилось — разберёмся. По оплате укажи дату и сумму.' });

  return call('sendMessage', { chat_id: chat, reply_markup: openButton, text: 'Не знаю такой команды 🙈 Открой приложение — там всё есть.' });
}

let offset = 0;
async function loop() {
  try {
    const r = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`).then(x => x.json());
    for (const u of r.result || []) {
      offset = u.update_id + 1;
      if (seen.has(u.update_id)) continue;
      seen.add(u.update_id);
      if (u.message) await onMessage(u.message);
    }
  } catch (e) { console.error('poll error', e.message); }
  setTimeout(loop, 500);
}
console.log('Бот запущен. Web App URL:', WEBAPP);
loop();
