#!/usr/bin/env python3
"""Импорт банка идей из Excel клиента в js/data/ideas-db.js.

Запуск:  python3 tools/import_ideas.py "путь/к/Та-дам_база данных.xlsx"
Нужен openpyxl (pip install openpyxl). Лист = повод, строка = идея.
Колонки: №, Идея, Кому, Бюджет, Интересы, Почему вау, Где искать, Доступ.
"""
import json, re, sys
import openpyxl

SHEETS = {
    'День рождения': 'birthday', 'Новый год': 'newyear', 'Просто так': 'justso',
    'Годовщина': 'anniv', '23 февраля': 'feb23', '8 марта': 'mar8',
    'Рождение ребёнка': 'baby', 'Новоселье': 'home', 'Выпускной - 1 сентября': 'school',
    'Свадьба': 'wedding', 'Коллеге - по работе': 'colleague', 'Ребёнку': 'kid', 'Юбилей': 'jubilee',
}
BUDGET = {'до 1000': 1000, 'до 3000': 3000, 'до 5000': 5000, 'до 10000': 10000, 'дороже': 99999}

# «Кому» в таблице — свободный текст; фильтр «Кому» в приложении — 8 групп.
RECIPIENT = {
    'мама': ['mom'], 'папа': ['dad'], 'родители': ['mom', 'dad', 'family'],
    'партнёр': ['partner'], 'партнёрша': ['partner'], 'парень': ['partner'], 'молодожёны': ['partner', 'family'],
    'друг': ['friend'], 'подруга': ['friend'], 'друг-книголюб': ['friend'],
    'коллега': ['colleague'], 'руководитель': ['colleague'], 'команда': ['colleague'],
    'ребёнок': ['child'], 'выпускник': ['child'], 'студент': ['child'],
    'семья': ['family'], 'бабушка': ['family'], 'дедушка': ['family'], 'дедушка/бабушка': ['family'],
    'учитель': ['teacher'], 'юбиляр': [],   # юбиляр — кто угодно: такая идея видна при любом «Кому»
}
# «Интересы» — 77 разных тегов; в фильтре — 12 понятных групп.
INTEREST = {
    'memory': 'память ностальгия традиция история признание благодарность рефлексия будущее ретро дружба',
    'food': 'гастрономия кофе вино сладости',
    'home': 'дом/уют уют дом быт комфорт эко',
    'romance': 'романтика',
    'impressions': 'приключения приключение адреналин впечатление новый_опыт путешествия отдых природа интрига зима',
    'learning': 'обучение развитие навыки карьера работа мотивация литература чтение',
    'fun': 'игра игры юмор фандом радость',
    'creative': 'хобби творчество дизайн искусство хендмейд ремесло культура эстетика цветы',
    'music': 'музыка кино аудио',
    'tech': 'техника технологии авто',
    'style': 'мода аксессуары парфюм красота стиль уход статус',
    'care': 'забота здоровье спорт поддержка',
    'family': 'семья дети милота животные',
    'magic': 'космос эзотерика магия',
}
TAG2GROUP = {t.replace('_', ' '): g for g, ts in INTEREST.items() for t in ts.split()}

def split(s):
    return [x.strip() for x in str(s or '').split(',') if x.strip()]

def main(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    out, unknown = {}, set()
    for title, cat in SHEETS.items():
        ws = wb[title]
        rows, header_idea = [], None
        for r in ws.iter_rows(min_row=4, values_only=True):
            r = list(r) + [None] * 8
            if not r[1] or r[1] == 'Идея подарка (вау!)':
                continue
            if r[0] == '№':          # в листе «День рождения» строку заголовка перезаписали идеей
                header_idea = r; continue
            rows.append(r)
        if header_idea: rows.append(header_idea[:7] + ['premium'])
        items = []
        for r in rows:
            who, tags = split(r[2]), split(r[4])
            for w in who:
                if w.lower() not in RECIPIENT: unknown.add(w)
            rec = sorted({g for w in who for g in RECIPIENT.get(w.lower(), [])})
            ints = []
            for t in tags:
                g = TAG2GROUP.get(t.lower())
                if g is None: unknown.add(t)
                elif g not in ints: ints.append(g)
            budget = BUDGET.get(str(r[3]).strip())
            if budget is None: raise SystemExit(f'{title}: неизвестный бюджет {r[3]!r}')
            items.append([str(r[1]).strip(), str(r[5] or '').strip(), budget, rec, ints,
                          ', '.join(who), ', '.join(tags), str(r[6] or '').strip(),
                          1 if str(r[7]).strip().lower() == 'бесплатно' else 0])
        out[cat] = items
    if unknown: print('Не распознано (попадёт без группы):', sorted(unknown))
    body = ',\n'.join(f'  {cat}: [\n' + ',\n'.join('    ' + json.dumps(i, ensure_ascii=False) for i in items) + '\n  ]'
                      for cat, items in out.items())
    js = ('// СГЕНЕРИРОВАНО tools/import_ideas.py из Excel клиента — не править руками.\n'
          '// Строка: [идея, почему вау, бюджет, [кому — id фильтра], [интересы — id фильтра],\n'
          '//          кому (как в таблице), интересы (как в таблице), где искать, бесплатно 1/0]\n'
          f'export const RAW = {{\n{body}\n}};\n')
    open('js/data/ideas-db.js', 'w').write(js)
    # Та же база для сервера — админка показывает её в разделе «База идей»
    json.dump(out, open('server/ideas-db.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print({k: (len(v), sum(i[8] for i in v)) for k, v in out.items()}, 'всего', sum(len(v) for v in out.values()))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../тут для новых правок/Та-дам_база данных 20.09.xlsx')
