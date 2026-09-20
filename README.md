# SATP Registry — публичный API

Перечень организаций и физических лиц (SATP-реестр), опубликованный как
**ключевой статический API на GitHub Pages**. Без ключа, без регистрации,
без Cloudflare.

- 22 915 физических лиц, 888 организаций, 29 буквенных разделов
- Хостинг: GitHub Pages (та же страница репозитория)
- Базовый URL: `https://x-cicada-ru.github.io/satp-registry/api`

## Эндпоинты

| Путь | Назначение |
|---|---|
| `/api/health.json` | Проверка доступности |
| `/api/stats.json` | Статистика реестра |
| `/api/manifest.json` | Описание API |
| `/api/people/index.json` | Все физические лица (сводки) |
| `/api/people/letter/А.json … /api/people/letter/Я.json` | Сводки по букве раздела |
| `/api/people/{id}.json` | Карточка физлица + полный текст |
| `/api/orgs/index.json` | Все организации (сводки) |
| `/api/orgs/{id}.json` | Карточка организации + полный текст |

## Примеры (curl)

```bash
curl https://x-cicada-ru.github.io/satp-registry/api/health.json
curl https://x-cicada-ru.github.io/satp-registry/api/stats.json
curl https://x-cicada-ru.github.io/satp-registry/api/people/index.json
curl https://x-cicada-ru.github.io/satp-registry/api/people/letter/А.json
curl https://x-cicada-ru.github.io/satp-registry/api/people/1.json
curl https://x-cicada-ru.github.io/satp-registry/api/orgs/1.json
```

Пример карточки `/api/people/1.json`:

```json
{
  "record": {
    "id": 1,
    "type": "person",
    "name": "АБАБАКАРОВ АБДУЛЛА ГАСАНОВИЧ",
    "aliases": [],
    "last_name": "АБАБАКАРОВ",
    "first_name": "АБДУЛЛА",
    "middle_name": "ГАСАНОВИЧ",
    "date_of_birth": "08.06.1996",
    "year_of_birth": 1996,
    "place_of_birth": "П. МАМЕДКАЛА ДЕРБЕНТСКОГО РАЙОНА РЕСПУБЛИКИ ДАГЕСТАН",
    "letter": "А",
    "marked": true
  },
  "body": "---\nid: 1\n..."
}
```

## Поля

- Общие: `id`, `name`, `aliases`, `marked`
- Физлицо: `last_name`, `first_name`, `middle_name`, `date_of_birth`,
  `year_of_birth`, `place_of_birth`, `letter`
- Организация: `country`, `inn`, `ogrn`, `date`
- Карточка также содержит `body` — полный текст записи из исходного документа

## Поиск по параметрам

GitHub Pages не выполняет серверных запросов, поэтому запрос-строка
(`?last_name=…`) на `.json` не фильтруется. Два способа:

1. **В браузере** — на главной странице
   `https://x-cicada-ru.github.io/satp-registry/` есть поиск, который скачивает
   сводки и фильтрует по тем же полям (`q`, `name`, `last_name`, `first_name`,
   `middle_name`, `yob`, `place`, `letter`, `alias`, `marked`). Параметры можно
   передавать и в URL: `/?q=АБАБАКАРОВ&marked=1`.
2. **Через curl + jq** — скачать сводку нужной буквы и фильтровать локально:

```bash
curl -s https://x-cicada-ru.github.io/satp-registry/api/people/letter/А.json \
  | jq '.[] | select(.last_name | contains("АБАБАКАРОВ"))'
```

## Обновление данных

Данные генерируются на машине, где лежит Obsidian Vault, и коммитятся в
репозиторий (сборщику нужен доступ к исходным файлам):

```bash
node build-static-api.mjs   # читает vault, пересоздаёт ./api
git add api
git commit -m "data refresh"
git push
```

GitHub Pages разворачивается автоматически из ветки `main` (корень).

## Ограничения

- Только GET; без `query string` фильтрации на стороне сервера (см. выше).
- Полный индекс `people/index.json` — 22 915 записей (~4 МБ); для точечных
  запросов лучше использовать файлы по буквам.
- Страница отвечает как GitHub Pages обычно: задержка определяется CDN GitHub.