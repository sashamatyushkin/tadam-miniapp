// ── Проверка Telegram initData и отправка сообщений ботом ────────────
// Алгоритм проверки — официальный (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   secret = HMAC_SHA256("WebAppData", bot_token)
//   check  = HMAC_SHA256(secret, data_check_string)
// data_check_string — все поля initData кроме hash, отсортированные по ключу,
// склеенные "key=value" через \n.
import { createHmac } from 'node:crypto';

const TOKEN = process.env.BOT_TOKEN;
const MAX_AGE_SEC = 24 * 3600; // initData считаем валидным сутки — Mini App может провисеть открытым долго

export function verifyInitData(initData) {
  if (!TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const computed = createHmac('sha256', secret).update(checkString).digest('hex');
  if (computed !== hash) return null;                 // подпись не сошлась — не наш initData

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null; // протухший initData

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (e) { user = null; }
  if (!user?.id) return null;

  return { user, startParam: params.get('start_param') || null, authDate };
}

const API = () => `https://api.telegram.org/bot${TOKEN}`;

export async function sendMessage(chatId, text, replyMarkup) {
  if (!TOKEN) return { ok: false, description: 'no BOT_TOKEN' };
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  try {
    const r = await fetch(`${API()}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) {
    return { ok: false, description: e.message };
  }
}
