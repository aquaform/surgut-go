# surgut-go — «Куда пойти в Сургуте»

## What This Is

Mobile-first веб-приложение на русском в стиле «городского навигатора на вечер»: оно агрегирует афиши и события Сургута из публичных источников и рекомендует, куда пойти сегодня/на выходных через крупные кнопки-настроения («хочу выпить», «хочу потанцевать», «хочу понимать», «хочу насладиться музыкой»). Для жителей и гостей города, которым нужен быстрый понятный ответ «куда пойти», а не список из десятка сайтов.

## Core Value

Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных — без выдуманных «live»-данных.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Серверная агрегация из публичных источников с нормализацией единой модели события — v1.0
- ✓ Дедупликация одинаковых событий из разных источников — v1.0
- ✓ Персистентный JSON-кэш с TTL + serve-stale при падении источника — v1.0
- ✓ Честный fallback seed (isSeed на каждом событии; seed/cached/blocked/error никогда не выдаются за live) — v1.0
- ✓ Статус источников (live/cached/blocked/error) виден в API и UI — v1.0
- ✓ API: `/health`, `/api/events`, `/api/recommendations?mood=...`, `/api/sources/status` — v1.0
- ✓ Главная mobile-first на русском с 4 кнопками-настроениями — v1.0
- ✓ Рекомендации по настроениям (rule-based маппинг + ранжирование «вечерние первыми» + «почему рекомендовано») — v1.0
- ✓ Карточки событий со всеми полями + CTA «Открыть/Купить билет» — v1.0
- ✓ Фильтры: дата-чипы / бесплатно / категория / текстовый поиск (клиентские) — v1.0
- ✓ Docker/Dokploy-контракт (`0.0.0.0:3000`, `/health`, esbuild multi-stage, healthcheck без wget/curl) — v1.0
- ✓ Публичный деплой на https://surgut-go.apps.sielom.ru через `/deploy` — v1.0
- ✓ 2 GREEN-источника живьём (kassa-ugra, afisha.surguta); YELLOW добавлены с guard'ами (afisha.ru), честно отключены (kassir RED→blocked, yandex disabled+tosRisk) — v1.0

### Active

<!-- Current scope. Building toward these. Empty until /gsd:new-milestone defines v1.1. -->

(None — v1.0 shipped. Run `/gsd:new-milestone` to scope v1.1.)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Авторизация/аккаунты пользователей — MVP анонимный, не нужно для core value
- Продажа билетов внутри приложения — только редирект на источник/кассу
- Нативные мобильные приложения — web-first, mobile-friendly достаточно
- Парсинг источников, нарушающий robots/ToS или требующий обхода блокировок — вместо этого честно показываем статус источника
- Геолокация/карты/построение маршрутов — за рамками первого MVP
- Персонализация/история/избранное на пользователя — нет аккаунтов в MVP

## Context

- **Источники для агрегации** (исследуются на доступность, robots/ToS, устойчивость парсера):
  - https://afisha.surguta.ru/ — городская афиша (выставки, театр, концерты, клубы, обучение)
  - https://kassa-ugra.ru/afisha — Kassa-Ugra (концерты, шоу, театр, стендап)
  - https://www.afisha.ru/surgut/events/ , https://www.afisha.ru/surgut/concerts/ — Afisha.ru
  - https://afisha.yandex.ru/surgut — Яндекс Афиша
  - https://sur.kassir.ru/ — Kassir.ru Сургут (концерты/театр)
  - https://www.tbank.ru/gorod/afisha/surgut/ — Т-Банк Город (если стабильно извлекаемо)
- **Маппинг настроений → категории/площадки:**
  - 🍸 drink → бары, стендап, open mic, клубные/вечерние события; приоритет ближайшим вечерним; площадки: Компромат, Brooklyn Bowl, Forte & Piano, Карасёвня
  - 💃 dance → вечеринки, клубы, поп/хип-хоп/электроника; Вавилон, Utopia, аквапарк-party
  - 🧠 learn → лекции, квизы, выставки, музеи, исторический парк, театр, образовательные
  - 🎶 music → концерты, филармония, живой звук, рок/джаз/оркестры/CAGMO
- **Нормализованная модель события:** `title, startDate, endDate?, venue, address?, priceText, sourceName, sourceUrl, category, tags, ageLimit?, imageUrl?`
- **Шаблон-контракт деплоя (golden template):** Dockerfile `node:20-slim`, entrypoint `node server.js`, `npm ci --omit=dev`, порт 3000, healthcheck через встроенный Node `fetch`. Деплой только через `/deploy` (Dokploy applicationId).
- **Принцип честности данных:** все live-данные получены реальным запросом/парсером либо явно помечены как fallback/cached/demo. Никогда не фабриковать события.

## Constraints

- **Tech stack**: Node.js 20 + TypeScript + Fastify; server-rendered UI (HTML + лёгкий JS/CSS, без SPA-сборки); кэш — JSON-файл на диске с TTL — единый контейнер, запуск `node server.js`, минимум сложности для Dokploy
- **Deploy**: только через `/deploy` (Dokploy). Хост обязательно `0.0.0.0`, порт из `PORT` (дефолт 3000), иначе Traefik отдаёт 404
- **Dependencies**: только относящиеся к задаче; никаких нативных модулей, ломающих `node:20-slim` без build-tools
- **Security**: никаких секретов в коде; конфиг только из env; не читать/печатать `.env`
- **Legal/ethical**: уважать robots/ToS источников; при блокировке — показывать статус, а не обходить и не выдумывать данные
- **Quality**: типы на всех публичных функциях; маленькие чистые модули; lint/typecheck/build/tests; цель покрытия 80%+ на бизнес-логику

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Backend: Fastify | Современный, быстрый, TS + Ajv-схемы | ✓ Good — чистые валидируемые роуты |
| Кэш: JSON-файл на диске с TTL | Персистентность без нативных модулей; node:20-slim | ✓ Good — serve-stale работает |
| Frontend: server-rendered + ваниль | Один контейнер, `node server.js`, без SPA-сборки | ✓ Good — простой single-container |
| Деплой через /deploy на surgut-go.apps.sielom.ru | Контракт проекта (Dokploy) | ✓ Good — live (но app должен быть на serverId AI AGENT SERVER, иначе Traefik 404) |
| Честный fallback seed + isSeed на каждом событии | Полезно при блокировке; не фабриковать live | ✓ Good — kassir RED честно показан как blocked |
| esbuild multi-stage → один server.js (cheerio/slim) | node_modules не в проде; undici не бандлится | ✓ Good — пойман boot-crash до прода |
| YELLOW-источники с guard'ами / disabled | afisha.ru хрупок (anti-bot), kassir нужен headless | ⚠️ Revisit — afisha.ru даёт 0 live (anti-bot); kassir отложен в v2 |
| Mood-маппинг rule-based по title+category+venue | Честнее ML, дёшево; теги разрежены | ✓ Good — после фикса `парк` точность ок |

## Current State

**Shipped:** v1.0 MVP (2026-06-27) — live at https://surgut-go.apps.sielom.ru
**Codebase:** ~6.7k LOC TypeScript + vanilla JS/CSS; Node 20 + Fastify 5 + cheerio/slim + esbuild + vitest. 216 tests, ~85% line coverage on business logic.
**Sources live:** kassa-ugra.ru, afisha.surguta.ru (GREEN). afisha.ru registered but currently 0 live events (Next.js anti-bot on datacenter IP → status `error`, guard prevents cache poisoning). kassir.ru `blocked` (needs headless — out of scope). yandex disabled by default (tosRisk).
**Deploy:** Dokploy applicationId `a0wKR0PzSvtrJKx5dTvvU` on "AI AGENT SERVER" (serverId `k8OseZqzTv9XkJuPnzIf4`); details in `.planning/DEPLOY.md`.

### Known tech debt / Next Milestone candidates (v1.1)
- **Date-only/time precision in parsing:** `hasTime` field added + UI handles it via inference, but GREEN adapters not retrofitted to set it explicitly (inference covers them).
- **afisha.surguta data quality:** art-shop/news items surface as "exhibitions" with placeholder past dates — need content classification.
- **afisha.ru live coverage:** anti-bot blocks the datacenter IP — investigate `__NEXT_DATA__`/ToS-compliant access, or accept graceful degradation.
- **Client JS not unit-tested:** `public/app.js` (search/filters/badges) caught only by live browser test — add jsdom tests.
- **Ephemeral cache:** no Dokploy volume — add for cross-restart persistence.
- Possible features: price-range filter, favorites, map/geolocation (currently out of scope).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-27 after v1.0 milestone*
