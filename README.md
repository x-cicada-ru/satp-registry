# SATP Registry — публичный API

Перечень организаций и физических лиц (SATP-реестр), опубликованный как
**ключевой статический API на GitHub Pages**. Без ключа, без регистрации,
без Cloudflare.

- 22 915 физических лиц, 888 организаций, 29 буквенных разделов
- Хостинг: GitHub Pages (та же страница репозитория)
- Базовый URL: `https://x-cicada-ru.github.io/satp-registry/api`

## Эндпоинты (JSON)

| Путь | Назначение |
|---|---|
| `/api/health.json` | Проверка доступности |
| `/api/stats.json` | Статистика реестра |
| `/api/manifest.json` | Описание API |
| `/api/people/index.json` | Все физические лица (сводки, JSON-массив) |
| `/api/people/letter/А.json … /api/people/letter/Я.json` | Сводки по букве раздела |
| `/api/people/{id}.json` | Карточка физлица + полный текст |
| `/api/orgs/index.json` | Все организации (сводки, JSON-массив) |
| `/api/orgs/{id}.json` | Карточка организации + полный текст |

## Примеры (curl)

```bash
curl https://x-cicada-ru.github.io/satp-registry/api/health.json
curl https://x-cicada-ru.github.io/satp-registry/api/stats.json
# JSON-массив всех физлиц:
curl https://x-cicada-ru.github.io/satp-registry/api/people/index.json
# JSON-массив одной буквы:
curl https://x-cicada-ru.github.io/satp-registry/api/people/letter/А.json
curl https://x-cicada-ru.github.io/satp-registry/api/people/1.json
curl https://x-cicada-ru.github.io/satp-registry/api/orgs/1.json
```

## Smart-поиск по всем параметрам

Главная страница `https://x-cicada-ru.github.io/satp-registry/` принимает
естественную строку запроса и сама распознаёт все параметры. Результат —
**JSON-массив** совпадений, отсортированный по релевантности.

```text
ФИО                          /?quest=Иванов Иван Иванович
ФИО + год                    /?quest=Иванов Иван Иванович 1985
ФИО + полная дата + город    /?quest=Иванов Иван 15.03.1985 Москва
Фамилия Имя + город + год    /?quest=Иванов Иван Краснодар 1985
Фамилия Имя + г. Город       /?quest=Иванов Иван г. Новосибирск
Только Фамилия Имя            /?quest=Иванов Иван
```

Распознаваются все параметры, по которым вообще можно искать:

| Параметр | Пример | Что ищется |
|---|---|---|
| Фамилия / Имя / Отчество | `Иванов Иван Иванович` | `last_name`, `first_name`, `middle_name` |
| Год рождения | `1985` | `year_of_birth` / год в `date_of_birth` |
| Полная дата | `15.03.1985` | `date_of_birth` |
| Месяц + год | `03.1985` | месяц и год в дате рождения |
| Город / страна | `Москва`, `ГЕРМАНИЯ`, `Дагестан` | `place_of_birth`, `country` |
| Алиасы | `ЦУКУНФТ` | `aliases` |
| ИНН | `1653019714` | `inn` (10 или 12 цифр) |
| ОГРН | `1021603062150` | `ogrn` (13 цифр) |
| Отметка в реестре | `маркирован` / `немаркирован` | `marked` |
| Тип | `организация` / `физлицо` | `type` |

Слова запроса ищутся по всем подходящим полям одновременно (Иванов — по фамилии,
Краснодар — по месту рождения и т.д.), разбивать их на колонки не нужно.
Результаты ранжируются: точное совпадение по фамилии/имени выше, чем по месту.

Вывод JSON-массивом: `/?quest=Иванов Иван 1985&json=1`. Кнопки на странице —
переключение «Таблица / JSON» и «Скопировать JSON».

### Скрытые ограничения GitHub Pages

Страница фильтрует на клиенте (статика не выполняет серверного кода), поэтому
`quest` работает в браузере. Для серверных скриптов есть CLI — он читает те же
`.json` и печатает JSON-массив:

```bash
node search.mjs "Иванов Иван 1985"
node search.mjs "ГЕРМАНИЯ" --top 500
node search.mjs "1021603062150"
```

## Поля

- Общие: `id`, `name`, `aliases`, `marked`
- Физлицо: `last_name`, `first_name`, `middle_name`, `date_of_birth`,
  `year_of_birth`, `place_of_birth`, `letter`
- Организация: `country`, `inn`, `ogrn`, `date`
- Карточка также содержит `body` — полный текст записи из исходного документа

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