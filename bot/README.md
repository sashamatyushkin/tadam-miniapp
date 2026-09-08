# Бот «Та-дам»

Бот: **@tadamapp_bot**

## Что уже настроено через Bot API
- кнопка меню в чате → открывает Mini App;
- команды `/start`, `/help`, `/terms`, `/support`, `/paysupport`;
- описание и краткое описание бота.

## Запуск
```bash
BOT_TOKEN=... WEBAPP_URL=https://sashamatyushkin.github.io/tadam-miniapp/ node bot/bot.js
```
Токен лежит локально в `bot/.env` (файл в .gitignore, в репозиторий не попадает).

Сейчас это long polling: бот работает, только пока запущен процесс. Для боевой версии нужен
хостинг и webhook с secret token.

## Чего в боте пока нет
Напоминаний о датах: даты хранятся на стороне Mini App (Telegram CloudStorage), у бота нет к ним
доступа. Напоминания появятся вместе с backend и общей базой.
