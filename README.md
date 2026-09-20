# SATP Registry — открытый API

Публичный API без ключа по перечню организаций и физических лиц (SATP-реестр).

- Хостинг: Cloudflare Workers (бесплатный план)
- Данные: Cloudflare KV (индекс + полный текст каждой записи)
- 22 915 физических лиц, 888 организаций (29 буквенных разделов)

## Базовый URL

```
https://satp-registry.<your-subdomain>.workers.dev
```

После деплоя точный адрес выводится в логе GitHub Actions. Он же доступен в
`wrangler deploy` — будет напечатан как `Worker deployed to ...`.

## Быстрый старт для потребителя API

```bash
# Поиск людей по фамилии
curl "https://satp-registry.<sub>.workers.dev/api/people?last_name=АБАБАКАРОВ"

# Люди по году рождения
curl ".../api/people?yob=1996&marked=1"

# Организации по стране
curl ".../api/orgs?country=ГЕРМАНИЯ"

# Карточка с полным текстом
curl ".../api/people/1"
```

Ответы — JSON, включён заголовок `Access-Control-Allow-Origin: *` (можно
вызывать из любого браузера/сайта без ключа).

## Эндпоинты

| Метод и путь | Назначение |
|---|---|
| `GET /` | Список эндпоинтов и параметров (самодокументация) |
| `GET /api/health` | Проверка доступности: `{"ok":true}` |
| `GET /api/stats` | Статистика реестра (числа, буквы, страны, ИНН/ОГРН) |
| `GET /api/search` | Поиск по всем записям, `type=person\|org` |
| `GET /api/people` | Поиск по физическим лицам |
| `GET /api/people/:id` | Карточка физлица + полный текст |
| `GET /api/orgs` | Поиск по организациям |
| `GET /api/orgs/:id` | Карточка организации + полный текст |

## Параметры поиска

Общие:
- `q` — подстрока по имени, псевдонимам, месту рождения (люди) или стране
  (организации); регистр и «Ё/Е» не важны
- `type` — `person` | `org` (только для `/api/search`)
- `marked` — `1/true/да` или `0/false/нет`
- `page` (по умолчанию 1), `limit` (1..500, по умолчанию 10), `offset`
- `sort` — `id`. `name`, `dob`, `yob`, `date`; префикс `-` — по убыванию

Физические лица:
- `name`, `last_name`, `first_name`, `middle_name` — подстроки
- `dob` — дата рождения точно (`DD.MM.YYYY`)
- `yob`, `yob_from`, `yob_to` — год рождения
- `date_from`, `date_to` — диапазон дат рождения (`DD.MM.YYYY` или `YYYY-MM-DD`)
- `place` — место рождения (подстрока)
- `letter` — буква раздела (А..Я)

Организации:
- `name` — название (подстрока)
- `alias` — псевдонимы (подстрока)
- `country` — страна (подстрока)
- `inn`, `ogrn` — подстроки
- `date` — дата из реестра (точное совпадение строки)

## Примеры ответа

`GET /api/people?last_name=АБАБАКАРОВ&limit=1`

```json
{
  "query": { "last_name": "АБАБАКАРОВ" },
  "total": 4,
  "page": 1,
  "limit": 1,
  "pages": 4,
  "items": [
    {
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
    }
  ]
}
```

## Разработка и обновление данных

Требуется Node.js 18+.

```bash
npm install          # только локально; CI ставит сам
npm run build        # читает vault, генерирует dist/ (индекс + KV-блиц)
npm test             # 40 автотестов без Cloudflare (мок KV)
npm run deploy       # создаёт KV-пространство, заливает данные, деплоит worker
```

Полный цикл обновления данных (с этой машины при наличии доступа к vault):

```bash
npm run build
npm test
git add dist
git commit -m "data refresh"
git push
```

GitHub Actions (`deploy.yml`) автоматически: прогoнит тесты и задеплоит данные
в KV + worker при пуше в `main`.

## Настройка деплоя (один раз)

1. Создайте бесплатный аккаунт на https://dash.cloudflare.com/sign-up
2. В панели: My Profile → API Tokens → Create Token → шаблон
   **Edit Cloudflare Workers** (или токен с правами:
   `Account → Workers Scripts: Edit`, `Account → Workers KV: Edit`).
   Скопируйте токен (вид `xxxx…xxxx`).
3. В этом репозитории: Settings → Secrets and variables → Actions →
   New repository secret:
   - `CLOUDFLARE_API_TOKEN` — токен из шага 2
   - `CLOUDFLARE_ACCOUNT_ID` — Account ID со страницы
     `dash.cloudflare.com` (правый столбец внизу, вид `1a2b3c4d5e6f…`)
4. Запустите в Actions: вкладка «Deploy» → Run workflow (или просто сделайте
   пуш в main — деплой сработает автоматически).

После первого деплоя в логе Actions будет строка вида
`https://satp-registry.<subdomain>.workers.dev` — это и есть адрес API.

## Ограничения

- Бесплатный план Workers: ~100 000 запросов/сутки (покрывает лимит
  KV-чтений). Для большего — платный план.
- Данные публикуются как есть, без привязки к исходнику на витрину.