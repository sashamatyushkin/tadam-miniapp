// ── База данных (node:sqlite, встроен в Node ≥22 — без npm install) ──
// ADR: ТЗ рекомендует Fastify + Prisma/Postgres. Для локального прототипа,
// который должен запускаться одной командой без сети и без нативной сборки,
// используем встроенный node:sqlite и голый node:http. При переезде на
// боевой хостинг (см. README «Дальше») меняем только этот файл и http.js —
// SQL-запросы намеренно простые и переносимые на Postgres почти без правок.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'tadam.sqlite'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entitlements (
  user_id INTEGER PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'free',   -- free | holiday | forever
  until INTEGER,                        -- ms epoch, NULL для forever/free
  source TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wheel_state (
  user_id INTEGER PRIMARY KEY,
  last_spin_date TEXT,
  free_used_today INTEGER NOT NULL DEFAULT 0,
  bonus_spins INTEGER NOT NULL DEFAULT 0,
  bonus_earned_today INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS spin_results (
  idempotency_key TEXT PRIMARY KEY,     -- защищает от двойного розыгрыша при повторе запроса
  user_id INTEGER NOT NULL,
  reward_code TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS important_dates (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,                   -- YYYY-MM-DD
  relation TEXT,
  type TEXT,
  annual INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  offsets TEXT NOT NULL DEFAULT '[14,7,3,1]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_log (
  date_id TEXT NOT NULL,
  offset_days INTEGER NOT NULL,
  year INTEGER NOT NULL,                -- год конкретного повторения — иначе ежегодная дата напомнит один раз и замолчит навсегда
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (date_id, offset_days, year)
);

CREATE TABLE IF NOT EXISTS wishlists (
  token TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  items_json TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  user_id INTEGER PRIMARY KEY,          -- приглашённый
  referrer_id INTEGER NOT NULL,
  qualified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Идеи и сторис, добавленные из админки. Живут отдельно от статической базы
-- фронтенда (js/data/ideas.js, js/screens/stories.js) — фронтенд подтягивает их
-- через /api/content/* и добавляет к встроенным, не заменяя их.
CREATE TABLE IF NOT EXISTS admin_ideas (
  id TEXT PRIMARY KEY,
  cat TEXT NOT NULL,
  title TEXT NOT NULL,
  desc TEXT NOT NULL DEFAULT '',
  long_desc TEXT NOT NULL DEFAULT '',
  budget INTEGER NOT NULL,
  recipients TEXT NOT NULL DEFAULT '[]',
  interests TEXT NOT NULL DEFAULT '[]',
  photo TEXT NOT NULL DEFAULT '',
  buy TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✨',
  bg TEXT NOT NULL DEFAULT 'mango',
  mascot TEXT NOT NULL DEFAULT 'wow',
  slide_title TEXT NOT NULL,
  slide_text TEXT NOT NULL,
  cta_label TEXT NOT NULL,
  cta_route TEXT NOT NULL DEFAULT 'home',
  cta_param TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

// Колонки, добавленные после первого запуска: у уже созданной базы их нет,
// а SQLite не умеет ADD COLUMN IF NOT EXISTS — поэтому пробуем и молча пропускаем.
for (const ddl of [
  "ALTER TABLE users ADD COLUMN profile_name TEXT",
  "ALTER TABLE users ADD COLUMN gender TEXT",
  "ALTER TABLE users ADD COLUMN birth_date TEXT",
  "ALTER TABLE users ADD COLUMN give_to TEXT",
  "ALTER TABLE users ADD COLUMN interests TEXT",
  "ALTER TABLE users ADD COLUMN profile_updated_at INTEGER",
  "ALTER TABLE users ADD COLUMN dream_gift TEXT",
  "ALTER TABLE wishlists ADD COLUMN dream TEXT"
]) { try { db.exec(ddl); } catch (e) { /* колонка уже есть */ } }

db.exec(`
CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE
);
`);

export function upsertUser(user) {
  db.prepare(`
    INSERT INTO users (id, first_name, username, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, username = excluded.username
  `).run(user.id, user.first_name || '', user.username || '', Date.now());
}

export function getEntitlement(userId) {
  const row = db.prepare('SELECT * FROM entitlements WHERE user_id = ?').get(userId);
  return row || { user_id: userId, type: 'free', until: null, source: null };
}

export function isPremiumRow(row) {
  return row.type === 'forever' || (row.until != null && Date.now() < row.until);
}

// Полный premium (год или «навсегда» из UGC): безлимит дат и напоминания за 14/7/3/1 день
export function isFullPremiumRow(row) {
  return isPremiumRow(row) && (row.type === 'year' || row.type === 'forever');
}

export function grantEntitlement(userId, type, until, source) {
  db.prepare(`
    INSERT INTO entitlements (user_id, type, until, source, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET type = excluded.type, until = excluded.until, source = excluded.source, updated_at = excluded.updated_at
  `).run(userId, type, until, source, Date.now());
}
