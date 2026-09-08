# Blask × iGaming News — Market Dashboard

Production-ready статический dashboard по историческим Top-15 операторов и игр. Проект не использует backend, серверную базу данных, платные API или runtime-зависимости. Frontend загружает подготовленные CSV/JSON напрямую из папки `/data` относительными HTTPS-совместимыми путями и подходит для публикации через GitHub Pages.

## Что реализовано

- **Overview** — Country + Report date, Top-15 Brands, Top-15 Games и компактный Data status.
- **Brand dynamics** — выбор Country, Metric, периода и до восьми брендов; реальные observation points для APS, CEB, Market Share и Rank.
- **Market dynamics / Operators** — лидеры, изменения позиций, изменения состава Top-15, CR3 и CR5.
- **Market dynamics / Games** — persistence, leadership, Top-5 presence, average rank, appearance rate, movers, Top-15 changes, rank-history matrix и Provider Top-15 Footprint.
- Строгий порядок дат во всех списках и матрицах: **oldest → newest**. В Report date только последняя дата получает подпись `(latest)` и выбирается автоматически при смене страны.
- Рынки ограничены заданной бизнес-сегментацией `LATAM`, `WEST AFRICA`, `INDIA`; остальные страны frontend не показывает.
- Отсутствие данных определяется только через `availability.csv` и не заменяется нулями или фиктивными строками.

Полная логика вычисляемых показателей вынесена в [docs/metrics.md](./docs/metrics.md).

## Структура repository

```text
.
├── index.html                         # статическая точка входа
├── assets/
│   ├── app.js                         # загрузка данных, фильтры, расчёты и SVG-графики
│   └── styles.css                     # визуальная система и responsive layout
├── data/
│   ├── availability.csv               # факт наличия операторских/игровых данных
│   ├── operators.csv                  # Top-15 операторов
│   ├── games.csv                      # Top-15 игр
│   ├── status.json                    # статус обновления для Overview
│   ├── reports.csv                    # registry обработанных отчётов
│   └── update_history.csv              # аудит импортов/проверок
├── docs/
│   ├── data_dictionary.md             # исходный data contract
│   ├── validation_report.md           # исходный validation report
│   ├── source_inventory.csv            # inventory исходных отчётов
│   └── metrics.md                     # логика dashboard metrics
├── prototype/
│   └── blask_ign_dashboard_prototype.html # исходный UX-прототип, не production frontend
├── scripts/
│   ├── serve.mjs                      # локальный статический HTTP-сервер без зависимостей
│   └── validate-data.mjs              # read-only проверка schema и связности данных
├── .gitignore                         # исключает локальный handoff/prototype из публикации
└── .nojekyll                          # отключает Jekyll-обработку на GitHub Pages
```

Исходный ZIP, `README_FOR_CODEX.md` и prototype сохранены локально как материалы handoff, но исключены из production repository через `.gitignore`. Поэтому встроенный dataset из исходного UX-прототипа не попадает в GitHub Pages. Production-файлы `index.html` и `assets/app.js` данных не содержат и загружают их только из `/data`.

## Какие data files читает frontend

Frontend выполняет `fetch()` только для четырёх файлов:

1. `data/operators.csv`
2. `data/games.csv`
3. `data/availability.csv`
4. `data/status.json`

`reports.csv`, `update_history.csv`, `source_inventory.csv`, data dictionary и validation report остаются операционными и аудиторскими файлами; браузер их не загружает.

## Ожидаемая schema

### `data/operators.csv`

Одна строка = один rank оператора в одной стране на одной дате.

```text
report_date,country,region,tier,rank,brand,aps,ceb_usd,market_share_pct,source_report
```

- `report_date`: ISO `YYYY-MM-DD`
- `region`: строго `LATAM`, `WEST AFRICA` или `INDIA`
- `rank`: целое `1–15`
- `aps`, `ceb_usd`, `market_share_pct`: числовые опубликованные значения; `market_share_pct` хранится в процентных пунктах

### `data/games.csv`

Одна строка = один rank игры в одной стране на одной дате.

```text
report_date,country,region,tier,rank,game,provider,source_report
```

`rank` — только целое `1–15`. Отсутствующей игре нельзя добавлять строку с rank 16.

### `data/availability.csv`

Одна строка = одна наблюдаемая пара Country + Report date.

```text
report_date,country,region,operators_available,games_available
```

Флаги имеют строковые значения `true` / `false`. Этот файл — единственный источник истины для решения, показывать таблицу/аналитику или состояние `Данные отсутствуют`.

### `data/status.json`

```json
{
  "last_checked": "YYYY-MM-DD",
  "last_updated": "YYYY-MM-DD",
  "latest_reports": ["Tier 2 — YYYY-MM-DD"],
  "status": "up_to_date"
}
```

Пустой массив `latest_reports` включает сценарий `Новых отчетов не найдено`.

## Локальная проверка

Открытие `index.html` напрямую через `file://` не подходит, потому что браузеры блокируют `fetch()` локальных CSV. Из корня repository запустите встроенный сервер (требуется Node.js 20+):

```bash
node scripts/serve.mjs
```

Затем откройте [http://localhost:8000](http://localhost:8000). Сервер не имеет внешних зависимостей и не используется на GitHub Pages.

Альтернативно можно использовать Python.

Windows:

```powershell
py -m http.server 8000
```

macOS / Linux:

```bash
python3 -m http.server 8000
```

Read-only проверка data-contract (требуется Node.js 20+):

```bash
node scripts/validate-data.mjs
node --check assets/app.js
```

Проверка валидирует обязательные колонки, target universe, business region, уникальность `country + report_date + rank`, диапазон rank, соответствие `availability.csv` фактическому числу строк и структуру `status.json`. Dataset при этом не изменяется.

## Публикация через GitHub Pages

1. Отправьте содержимое repository в GitHub.
2. В repository откройте **Settings → Pages**.
3. В **Build and deployment** выберите **Deploy from a branch**.
4. Выберите branch `main`, folder `/(root)` и нажмите **Save**.
5. После завершения deployment откройте URL, показанный в GitHub Pages.

Все пути имеют форму `./data/...` и `./assets/...`, поэтому сайт работает как в корневом домене, так и в project path вида `https://username.github.io/repository/`.

## Следующее обновление данных

При очередном подготовленном обновлении замените только соответствующие файлы в `/data`:

- `operators.csv`
- `games.csv`
- `availability.csv`
- `status.json`
- `reports.csv` и `update_history.csv` — для registry/audit trail

При изменении состава исходных отчётов также обновите `docs/source_inventory.csv` и при необходимости `docs/validation_report.md`.

Не нужно изменять `index.html`, `assets/app.js` или встраивать dataset в JavaScript. Не перераспознавайте PDF в рамках обычного обновления этого repository: frontend ожидает уже обработанные master-файлы по описанной schema.

Перед публикацией нового пакета запустите `node scripts/validate-data.mjs` и вручную проверьте как минимум:

- latest date находится последней в Report date и единственная содержит `(latest)`;
- страны без наблюдений показывают `Данные отсутствуют`;
- даты в графиках и matrix идут oldest → newest;
- при `games_available=false` не появляется `OUT OF TOP-15` — показывается `Данные отсутствуют`.

## Data quality guarantees

- Нет интерполяции между наблюдениями.
- Нет замены отсутствующих значений нулём.
- Нет фиктивных строк и rank ниже Top-15.
- Срезы разных report dates не смешиваются.
- `New to Top-15` и `Dropped from Top-15` описывают только изменение состава опубликованного рейтинга.
- Provider Top-15 Footprint — количество игр, а не market share.
