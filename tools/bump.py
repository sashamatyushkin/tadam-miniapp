#!/usr/bin/env python3
"""Проставляет версию во все импорты и ссылки — чтобы после деплоя
браузер и Telegram не отдавали старые модули из кеша.

Запуск:  python3 tools/bump.py            (версия = текущая метка времени)
         python3 tools/bump.py 12         (конкретная версия)
"""
import re, sys, pathlib, time

root = pathlib.Path(__file__).resolve().parent.parent
ver = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%y%m%d%H%M')

# index.html
idx = root / 'index.html'
h = idx.read_text()
h = re.sub(r'styles\.css(\?v=[^"\']*)?', f'styles.css?v={ver}', h)
h = re.sub(r'js/app\.js(\?v=[^"\']*)?', f'js/app.js?v={ver}', h)
idx.write_text(h)

# все относительные импорты в js/
count = 0
for f in sorted(root.glob('js/**/*.js')):
    src = f.read_text()
    new = re.sub(r"""(from\s+|import\()(['"])(\.\.?/[^'"?]+\.js)(\?v=[^'"]*)?\2""",
                 lambda m: f'{m.group(1)}{m.group(2)}{m.group(3)}?v={ver}{m.group(2)}', src)
    if new != src:
        f.write_text(new); count += 1

print(f'версия {ver}: index.html + {count} модулей')
