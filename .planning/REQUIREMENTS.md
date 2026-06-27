# Requirements: surgut-go

**Defined:** 2026-06-26
**Core Value:** Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Aggregation Pipeline (AGG)

- [x] **AGG-01**: Сервер парсит публичные источники и нормализует события в единую модель (`title, startDate, endDate?, venue, address?, priceText, sourceName, sourceUrl, category, tags, ageLimit?, imageUrl?`)
- [x] **AGG-02**: Каждое событие несёт флаг `isSeed` (live vs seed/demo) — структурно невозможно выдать seed за live
- [ ] **AGG-03**: Дубликаты одного события из разных источников схлопываются по нечёткому ключу (нормализованный title + день startDate + нормализованный venue)
- [x] **AGG-04**: Общие утилиты парсинга русских дат (`Asia/Yekaterinburg`, «сегодня/завтра», русские месяцы) и цен («от 500 ₽», «бесплатно») покрыты тестами
- [x] **AGG-05**: Min-results guard — пустой результат при HTTP 200 трактуется как ошибка парсинга и не перезаписывает валидный кэш

### Sources (SRC)

- [x] **SRC-01**: Источник реализован как адаптер с общим интерфейсом (fetch + parse → `Event[]`), новые источники добавляются без правки пайплайна
- [x] **SRC-02**: Парсер `kassa-ugra.ru/afisha` (🟢 GREEN) даёт нормализованные события
- [x] **SRC-03**: Парсер `afisha.surguta.ru` (🟢 GREEN, Crawl-delay 10) даёт нормализованные события с уважением к robots.txt
- [ ] **SRC-04**: Парсер `afisha.ru/surgut` (🟡 YELLOW) с guard на хрупкость селекторов
- [ ] **SRC-05**: Парсер `sur.kassir.ru` (🟡 YELLOW, AJAX) — концерты/театр
- [ ] **SRC-06**: Парсер `afisha.yandex.ru/surgut` (🟡 YELLOW, риск ToS) под конфиг-тогглом, по умолчанию выключен
- [x] **SRC-07**: Парсинг уважает robots.txt и crawl-delay; вежливые таймауты/ретраи/User-Agent
- [x] **SRC-08**: Статус каждого источника (live / cached / blocked / error) отслеживается и отдаётся

### Caching & Resilience (CACHE)

- [ ] **CACHE-01**: Результаты парсинга кэшируются в JSON-файл на диске с TTL и переживают рестарт
- [x] **CACHE-02**: Фоновое обновление по расписанию (cron) вне пути запроса; запросы читают из in-memory индекса
- [x] **CACHE-03**: При падении источника отдаются последние валидные кэшированные данные (serve-stale-on-failure)
- [ ] **CACHE-04**: Честный fallback seed из реально найденных примеров, всегда помеченный как cached/demo, доступен при пустом/недоступном live

### API (API)

- [x] **API-01**: `GET /health` → 200 и тело `ok`
- [x] **API-02**: `GET /api/events` → нормализованные события (с поддержкой фильтров-параметров)
- [ ] **API-03**: `GET /api/recommendations?mood=drink|dance|learn|music` → ранжированные рекомендации по настроению
- [x] **API-04**: `GET /api/sources/status` → статус и свежесть каждого источника
- [x] **API-05**: Ответы API валидируются схемами; ошибки отдаются в предсказуемом формате

### Recommendations (MOOD)

- [ ] **MOOD-01**: Статическая таблица маппинга настроение → категории/теги/площадки (drink/dance/learn/music)
- [ ] **MOOD-02**: Ранжирование приоритизирует ближайшие вечерние события для drink/dance
- [ ] **MOOD-03**: Каждая рекомендация содержит понятное «почему рекомендовано»

### UI (UI)

- [ ] **UI-01**: Главная mobile-first страница на русском в стиле «городской навигатор на вечер»
- [ ] **UI-02**: 4 крупные кнопки-настроения (🍸 выпить, 💃 потанцевать, 🧠 понимать, 🎶 музыка)
- [ ] **UI-03**: Карточка события: название, дата/время, площадка, цена, категория/теги, «почему рекомендовано», источник, кнопка «Открыть/купить билет»
- [ ] **UI-04**: Фильтры-чипы по дате: сегодня / завтра / выходные / ближайшие 7 дней
- [ ] **UI-05**: Фильтр цена/бесплатно и фильтр по категории
- [ ] **UI-06**: Текстовый поиск по событиям
- [ ] **UI-07**: Видимый пользователю статус источников и пометка demo/cached данных

### Deploy (DEPLOY)

- [x] **DEPLOY-01**: Рабочий Dockerfile: `node:20-slim`, слушает `0.0.0.0`, порт из `PORT` (дефолт 3000), healthcheck без wget/curl
- [x] **DEPLOY-02**: Сервер стартует мгновенно на seed-данных (healthcheck проходит в start-period), парсинг — в фоне
- [x] **DEPLOY-03**: GitHub-репозиторий создан, origin добавлен, main запушен
- [x] **DEPLOY-04**: Публичный деплой на `https://surgut-go.apps.sielom.ru` через `/deploy` (Dokploy); проверены `/health`, главная и хотя бы один API endpoint

### Quality (QA)

- [x] **QA-01**: lint + typecheck + build проходят; типы на всех публичных функциях
- [ ] **QA-02**: vitest-тесты бизнес-логики (парсеры на фикстурах, дедуп, маппинг настроений, дата/цена) — цель 80%+ покрытия

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Sources

- **SRC-V2-01**: `tbank.ru/gorod/afisha/surgut` — требует headless-браузера (несовместимо с node:20-slim single-container)

### Personalization

- **PERS-V2-01**: Аккаунты, избранное, история рекомендаций
- **PERS-V2-02**: Геолокация и карта/маршруты до площадки

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Авторизация/аккаунты | MVP анонимный; не нужно для core value |
| Продажа билетов внутри приложения | Только редирект на источник/кассу |
| Нативные мобильные приложения | Web-first, mobile-friendly достаточно |
| Обход блокировок/анти-бота (headless, captcha) | Нарушает robots/ToS; вместо этого показываем статус источника |
| Парсинг tbank.ru в MVP | Client-rendered, нужен headless — нарушает single-container slim-контракт |
| ML-персонализация рекомендаций | Rule-based маппинг честнее и достаточен на объёме Сургута |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AGG-01 | Phase 1 | Complete |
| AGG-02 | Phase 1 | Complete |
| AGG-03 | Phase 2 | Pending |
| AGG-04 | Phase 1 | Complete |
| AGG-05 | Phase 1 | Complete |
| SRC-01 | Phase 1 | Complete |
| SRC-02 | Phase 1 | Complete |
| SRC-03 | Phase 1 | Complete |
| SRC-04 | Phase 3 | Pending |
| SRC-05 | Phase 3 | Pending |
| SRC-06 | Phase 3 | Pending |
| SRC-07 | Phase 1 | Complete |
| SRC-08 | Phase 1 | Complete |
| CACHE-01 | Phase 1 | Pending |
| CACHE-02 | Phase 1 | Complete |
| CACHE-03 | Phase 1 | Complete |
| CACHE-04 | Phase 1 | Pending |
| API-01 | Phase 1 | Complete |
| API-02 | Phase 1 | Complete |
| API-03 | Phase 2 | Pending |
| API-04 | Phase 1 | Complete |
| API-05 | Phase 1 | Complete |
| MOOD-01 | Phase 2 | Pending |
| MOOD-02 | Phase 2 | Pending |
| MOOD-03 | Phase 2 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| UI-03 | Phase 2 | Pending |
| UI-04 | Phase 2 | Pending |
| UI-05 | Phase 2 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 2 | Pending |
| DEPLOY-01 | Phase 1 | Complete |
| DEPLOY-02 | Phase 1 | Complete |
| DEPLOY-03 | Phase 1 | Complete |
| DEPLOY-04 | Phase 1 | Complete |
| QA-01 | Phase 1 | Complete |
| QA-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 38 total (note: file previously stated 33; actual count is 38)
- Mapped to phases: 38/38
- Unmapped: 0

| Phase | Requirements |
|-------|--------------|
| Phase 1 | AGG-01, AGG-02, AGG-04, AGG-05, SRC-01, SRC-02, SRC-03, SRC-07, SRC-08, CACHE-01, CACHE-02, CACHE-03, CACHE-04, API-01, API-02, API-04, API-05, DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, QA-01 (22) |
| Phase 2 | AGG-03, MOOD-01, MOOD-02, MOOD-03, API-03, UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, QA-02 (12) |
| Phase 3 | SRC-04, SRC-05, SRC-06, UI-06 (4) |

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-26 after roadmap creation — traceability populated*
