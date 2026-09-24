#!/usr/bin/env python3
"""Собирает страницы документов сайта (site/docs/*.html) из текстов docs/*.html.
Запуск: python3 tools/build_site.py — после любой правки документов."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
DOCS = [('offer', 'Публичная оферта'), ('privacy', 'Политика обработки персональных данных'),
        ('pd-consent', 'Согласие на обработку персональных данных'), ('ads-consent', 'Согласие на получение рекламных рассылок')]
out = root / 'site' / 'docs'; out.mkdir(parents=True, exist_ok=True)
for slug, title in DOCS:
    body = (root / 'docs' / f'{slug}.html').read_text()
    cur = ' aria-current="page"'
    nav = ''.join(f'<a href="{s}.html"{cur if s == slug else ""}>{t}</a>' for s, t in DOCS)
    (out / f'{slug}.html').write_text(f'''<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Та-дам</title><link rel="icon" href="../../assets/img/logo-icon.png">
<link rel="stylesheet" href="../site.css?v=2"></head>
<body><header class="top"><div class="wrap"><a class="logo" href="../"><img src="../../assets/img/logo-full.png" alt="Та-дам" width="560" height="260"></a>
<a class="btn" href="https://t.me/tadamapp_bot">Открыть в Telegram</a></div></header>
<main class="docpage"><a class="back" href="../#docs">← Все документы</a>
{body}
<nav class="docnav" aria-label="Документы">{nav}</nav></main>
<footer><div class="wrap"><span>© 2026 Та-дам · ИП Кудеярова А. С. · ИНН 645294829078 · ОГРНИП 325645700116523</span><a href="mailto:ta-damapp@yandex.ru">ta-damapp@yandex.ru</a></div></footer>
</body></html>
''')
print('документы сайта собраны:', ', '.join(s for s, _ in DOCS))
