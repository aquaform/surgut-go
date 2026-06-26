# surgut-go — «Куда пойти в Сургуте»

Mobile-first агрегатор событий Сургута. Собирает афишу из публичных источников, рекомендует по настроению (выпить / потанцевать / понять / музыку) и честно показывает свежесть и источник каждого события.

## Быстрый старт (локально)

```bash
npm install
npm run dev        # tsx watch — hot reload на http://localhost:3000
```

Или через Docker:

```bash
docker build -t surgut-go .
docker run --rm -p 3000:3000 surgut-go
```

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Dev-сервер с hot reload (tsx watch) |
| `npm run build` | Бандл в `server.js` через esbuild |
| `npm run typecheck` | Проверка типов (tsc --noEmit) |
| `npm run lint` | ESLint |
| `npm run test` | Весь vitest suite |

## API-эндпоинты

| Эндпоинт | Описание |
|----------|----------|
| `GET /health` | Healthcheck — возвращает `ok` (200) |
| `GET /api/events` | Список событий; параметры: `?date=today\|tomorrow\|weekend\|week`, `?mood=drink\|dance\|learn\|music`, `?free=true`, `?q=текст` |
| `GET /api/sources/status` | Статус каждого источника (live / cached / seed / error) с временем последнего обновления |

## Живое развёртывание

Сервис деплоится на **https://surgut-go.apps.sielom.ru** через Dokploy (только через slash-команду `/deploy` — ручной curl в проде запрещён).

Окружение:
- `PORT` — порт прослушивания (дефолт 3000); сервер биндится на `0.0.0.0`
- `NODE_ENV=production` — выставляется в Dockerfile

## Стек

- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Fastify 5
- **Парсинг:** cheerio/slim
- **Кэш:** JSON-файл на диске с TTL
- **Сборка:** esbuild (single-file bundle)
- **Тесты:** vitest (79 тестов)
- **Деплой:** Docker (node:20-slim, multi-stage) + Dokploy + GitHub

## Источники данных

| Источник | Статус | Описание |
|----------|--------|----------|
| kassa-ugra.ru | GREEN | Концерты, шоу, театр, стендап Сургута |
| afisha.surguta.ru | GREEN | Городская афиша: выставки, театр, обучение, клубы |
| Fallback seed | Демо | 12 реальных событий, помечены как `isSeed: true` |
