# surgut-go — «Куда пойти в Сургуте»

## What This Is

Mobile-first веб-приложение на русском в стиле «городского навигатора на вечер»: оно агрегирует афиши и события Сургута из публичных источников и рекомендует, куда пойти сегодня/на выходных через крупные кнопки-настроения («хочу выпить», «хочу потанцевать», «хочу понимать», «хочу насладиться музыкой»). Для жителей и гостей города, которым нужен быстрый понятный ответ «куда пойти», а не список из десятка сайтов.

## Core Value

Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных — без выдуманных «live»-данных.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Главная mobile-first страница на русском с 4 крупными кнопками-настроениями
- [ ] Рекомендации по настроениям: drink / dance / learn / music с осмысленным маппингом категорий и площадок
- [ ] Карточки событий: название, дата/время, площадка, цена, категория/теги, «почему рекомендовано», источник, кнопка «Открыть/купить билет»
- [ ] Фильтры: сегодня / завтра / выходные / ближайшие 7 дней, цена/бесплатно, категория, поиск
- [ ] Серверная агрегация из публичных источников с нормализацией единой модели события
- [ ] Дедупликация одинаковых событий из разных источников
- [ ] API: `/health`, `/api/events`, `/api/recommendations?mood=...`, `/api/sources/status`
- [ ] Персистентный кэш парсинга с TTL (JSON-файл), работа на последних кэшированных данных при падении источника
- [ ] Статус источников (live / cached / blocked / error) видим пользователю и в API
- [ ] Честный fallback seed из реально найденных примеров, помеченный как cached/demo (никогда не выдаётся за свежий live)
- [ ] Docker/production-контракт для Dokploy: `0.0.0.0:3000`, `/health`, healthcheck без wget/curl
- [ ] Публичный деплой на `https://surgut-go.apps.sielom.ru` через GitHub + Dokploy (по /deploy)

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
| Backend: Fastify | Современный, быстрый, хорошая поддержка TS и схем валидации | — Pending |
| Кэш: JSON-файл на диске с TTL | Персистентность без нативных модулей; работает в node:20-slim; переживает рестарт | — Pending |
| Frontend: server-rendered + ваниль | Один контейнер, запуск `node server.js`, минимум сложности vs SPA-сборка | — Pending |
| Деплой через /deploy на surgut-go.apps.sielom.ru | Контракт проекта (Dokploy), публичный доступ | — Pending |
| Честный fallback seed (cached/demo) | Приложение полезно даже при блокировке источников; не фабриковать live | — Pending |

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
*Last updated: 2026-06-26 after initialization*
