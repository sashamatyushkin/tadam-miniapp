// ── Бот: команды и deep links (long polling) ───────────────────────────
// Перенесено из bot/bot.js в единый процесс с API и планировщиком напоминаний —
// они разделяют одну БД и один процесс проще эксплуатировать локально.
import { upsertUser } from './db.js';

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP = (process.env.WEBAPP_URL || 'https://sashamatyushkin.github.io/tadam-miniapp/').replace(/\/?$/, '/');

const API = () => `https://api.telegram.org/bot${TOKEN}`;
const seen = new Set();

const call = (m, body) =>
  fetch(`${API()}/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json())
    .catch(e => ({ ok: false, description: e.message }));

const appButton = (text, param) => ({
  inline_keyboard: [[{ text, web_app: { url: param ? `${WEBAPP}?startapp=${encodeURIComponent(param)}` : WEBAPP } }]]
});

async function onMessage(msg) {
  const chat = msg.chat.id;
  if (msg.from) upsertUser(msg.from); // тот же пользователь, что придёт потом с initData из Mini App
  const text = (msg.text || '').trim();
  const [cmd, arg] = text.split(/\s+/);

  if (cmd === '/start') {
    if (arg && arg.startsWith('h_')) {
      return call('sendMessage', {
        chat_id: chat, reply_markup: appButton('Посмотреть в Та-дам →', arg),
        text: 'Тебе намекнули 💌\nКто-то из близких сохранил идею подарка специально для тебя.'
      });
    }
    if (arg && arg.startsWith('w_')) {
      return call('sendMessage', {
        chat_id: chat, reply_markup: appButton('Открыть вишлист →', arg),
        text: 'С тобой поделились вишлистом 🎁'
      });
    }
    const ref = arg && arg.startsWith('r') ? '\n\nТы пришёл по приглашению — крути колесо, там ждёт спин 🎲' : '';
    return call('sendMessage', {
      chat_id: chat, reply_markup: appButton('🎁 Открыть Та-дам', arg || ''),
      text: `Привет! Я Та-дам 🎁\nПомогу придумать подарок, от которого загорятся глаза. Даже если идей совсем нет.${ref}`
    });
  }

  if (cmd === '/help')
    return call('sendMessage', {
      chat_id: chat, reply_markup: appButton('🎁 Открыть Та-дам'),
      text: 'Открывай приложение и выбирай повод — дальше всё за пару касаний.\n\nСобери вишлист, намекни близким, добавь важные даты и крути колесо раз в день.\n\nЕсли что-то сломалось — просто напиши сюда, прочитаем.'
    });

  if (cmd === '/terms')
    return call('sendMessage', { chat_id: chat, text: 'Условия и политика приватности — в приложении: «Профиль → Настройки → Условия и приватность».\n' + WEBAPP });
  if (cmd === '/support')
    return call('sendMessage', { chat_id: chat, text: 'Напиши прямо сюда, что случилось — разберёмся 🙌' });
  if (cmd === '/paysupport')
    return call('sendMessage', { chat_id: chat, text: 'Вопросы по оплате: напиши дату, сумму и что пошло не так — вернёмся с ответом.\nСейчас приложение работает в режиме прототипа: оплата не списывается.' });

  return call('sendMessage', {
    chat_id: chat, reply_markup: appButton('🎁 Открыть Та-дам'),
    text: 'Не знаю такой команды 🙈 Открой приложение — там всё есть.'
  });
}

let offset = 0, running = false;
async function loop() {
  if (!running) return;
  try {
    const r = await fetch(`${API()}/getUpdates?timeout=30&offset=${offset}`).then(x => x.json());
    for (const u of r.result || []) {
      offset = u.update_id + 1;
      if (seen.has(u.update_id)) continue;
      seen.add(u.update_id);
      if (u.message) await onMessage(u.message);
    }
  } catch (e) { console.error('[bot] poll error:', e.message); }
  if (running) setTimeout(loop, 300);
}

export function startBot() {
  if (!TOKEN) { console.error('[bot] нет BOT_TOKEN — бот не запущен'); return; }
  running = true;
  console.log('[bot] запущен. Mini App URL:', WEBAPP);
  loop();
}
export function stopBot() { running = false; }
