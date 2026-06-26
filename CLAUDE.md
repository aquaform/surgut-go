@AGENTS.md\n\n## Claude-специфика\n- Для любой разработки используем рабочий процесс GSD (discuss → plan → execute → verify).\n- Деплой — только командой /deploy с applicationId Dokploy.\n- Никогда не читать и не выводить .env.\n

<!-- GSD:project-start source:PROJECT.md -->
## Project

**surgut-go — «Куда пойти в Сургуте»**

Mobile-first веб-приложение на русском в стиле «городского навигатора на вечер»: оно агрегирует афиши и события Сургута из публичных источников и рекомендует, куда пойти сегодня/на выходных через крупные кнопки-настроения («хочу выпить», «хочу потанцевать», «хочу понимать», «хочу насладиться музыкой»). Для жителей и гостей города, которым нужен быстрый понятный ответ «куда пойти», а не список из десятка сайтов.

**Core Value:** Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных — без выдуманных «live»-данных.

### Constraints

- **Tech stack**: Node.js 20 + TypeScript + Fastify; server-rendered UI (HTML + лёгкий JS/CSS, без SPA-сборки); кэш — JSON-файл на диске с TTL — единый контейнер, запуск `node server.js`, минимум сложности для Dokploy
- **Deploy**: только через `/deploy` (Dokploy). Хост обязательно `0.0.0.0`, порт из `PORT` (дефолт 3000), иначе Traefik отдаёт 404
- **Dependencies**: только относящиеся к задаче; никаких нативных модулей, ломающих `node:20-slim` без build-tools
- **Security**: никаких секретов в коде; конфиг только из env; не читать/печатать `.env`
- **Legal/ethical**: уважать robots/ToS источников; при блокировке — показывать статус, а не обходить и не выдумывать данные
- **Quality**: типы на всех публичных функциях; маленькие чистые модули; lint/typecheck/build/tests; цель покрытия 80%+ на бизнес-логику
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 20 (LOCKED) | Runtime | LTS, built-in `fetch` (undici-backed), no separate HTTP client needed |
| TypeScript | 5.x (latest) | Language | Enforces types on public functions per AGENTS.md, catches parse-shape mismatches at compile time |
| Fastify | 5.8.5 (LOCKED) | HTTP framework | Schema-first, fast, first-class TS, built-in Ajv for API route validation |
### HTML Parsing
- **`cheerio`** beats `node-html-parser` on ecosystem size (30M vs ~3M weekly downloads) and jQuery-familiar API. Raw parse speed (node-html-parser is ~8x faster in microbenchmarks) does not matter here — we parse once per TTL refresh interval, not per request.
- **`cheerio`** beats `linkedom` for our use case; linkedom simulates a full DOM (designed for SSR of web components), adding unnecessary weight. We need read-only extraction, not DOM mutation.
- **`cheerio`** handles the two structured-data extraction patterns without extra libraries:
### HTTP Fetching
| Package | Version | Role |
|---------|---------|------|
| `fetch` (built-in) | Node 20 | HTTP requests, gzip handled automatically via `Accept-Encoding` |
| `p-retry` | 8.0.0 | Retry with exponential back-off (ESM-only; bundles cleanly via esbuild `--format=cjs`) |
| `robots-parser` | 3.0.1 | Parse and check each source's `robots.txt` before scraping |
### TypeScript Build (Dockerfile Contract: `node server.js`)
- `--bundle`: tree-shakes and inlines all `node_modules`, so the runner stage needs NO `npm ci --omit=dev` and NO `node_modules/` folder
- `--platform=node`: marks Node built-ins as external, prevents bundling them
- `--format=cjs`: produces CommonJS output compatible with `node server.js` regardless of `"type"` in `package.json`; also handles ESM-only packages (`p-retry`, `cheerio` internals) automatically
- `--external:./public`: prevents the bundler from trying to inline static assets
### Fastify Ecosystem
| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `fastify` | 5.8.5 | HTTP server | Built-in Ajv schema validation on API routes |
| `@fastify/static` | 9.1.3 | Serve `public/` (CSS, JS, images) | Prefix `/__static` or root, disable for API routes |
- Zero dependencies
- TypeScript-typed (function signatures enforce required fields)  
- Trivially testable (pure functions → string output)
- Sufficient for this scope
### Testing
### Scheduling
## Supporting Libraries (Full Install List)
# Production dependencies
# Dev dependencies
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTML Parser | `cheerio` 1.2.0 | `node-html-parser` 8.0.3 | Smaller ecosystem, non-jQuery API, 8x faster parsing doesn't matter at TTL-refresh cadence |
| HTML Parser | `cheerio` 1.2.0 | `linkedom` 0.18.12 | Full DOM simulation — designed for SSR rendering, not read-only extraction; heavier |
| HTTP Client | native `fetch` + `p-retry` | `got` 15.0.6 | `got` is ESM-only which bundles fine but adds ~200 KB; native fetch handles gzip + timeout natively in Node 20 |
| HTTP Client | native `fetch` + `p-retry` | `axios` | axios is CommonJS-legacy, larger, no built-in timeout signal |
| TS Build | `esbuild` (bundle) | `tsc` (compile) | tsc requires node_modules in runner stage; multi-file output complicates `node server.js` entrypoint |
| TS Build | `esbuild` (bundle) | `tsup` | tsup wraps esbuild; fine alternative but adds indirection; direct esbuild call gives explicit `server.js` naming |
| Scheduling | `node-cron` | `setInterval` | setInterval cannot express calendar-aligned intervals without arithmetic; less readable |
| Templates | template literals | `@fastify/view` + Eta | Sufficient for current scope; add @fastify/view + eta v4.6.0 if layout complexity grows |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `puppeteer` / `playwright` | Chromium binary breaks `node:20-slim` without extra packages; 200 MB+ image bloat; violates no-native-modules constraint | `cheerio` for static HTML; `__NEXT_DATA__` / JSON-LD extraction for SPA sites |
| `sqlite3` / `better-sqlite3` | Native C++ addons require `build-essential` in `node:20-slim` (not available by default) | JSON file on disk with TTL (LOCKED decision) |
| `ts-node` in production | Requires TypeScript as a production dependency; adds compile latency on startup | esbuild bundle in multi-stage Docker |
| `jsdom` | 25 MB bundle; slow; designed for browser emulation, not scraping | `cheerio` for scraping |
| `cheerio.fromURL()` | Convenience wrapper that hides timeout/retry/robots.txt control | Fetch HTML manually, then `cheerio.load(html)` |
| `got-scraping` | Browser fingerprint rotation library from Apify — overkill; Russian afisha sites don't fingerprint bots | Plain `got` or native fetch with a descriptive User-Agent |
| `axios` | CommonJS legacy; no built-in `AbortSignal` timeout; adds 13 KB for nothing over native fetch | Native `fetch` |
| `node-fetch` | Was a polyfill for pre-18 Node; redundant since Node 18 built-in fetch | Native `fetch` |
## JSON-LD / `__NEXT_DATA__` Extraction Strategy
## Version Compatibility Matrix
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `cheerio` ^1.2.0 | Node 18+ | v1.x requires `import * as cheerio from 'cheerio'`; old `require('cheerio')` default export removed |
| `p-retry` ^8.0.0 | Node 18+ | ESM-only; esbuild `--format=cjs` bundles it correctly; no top-level await in p-retry |
| `node-cron` ^4.5.0 | Node 18+ | v4.x has breaking changes from v3.x (API is same, but ES module exports differ) |
| `@fastify/static` ^9.1.3 | `fastify` ^5.x | Major version aligns with fastify major; do NOT mix fastify v4 with @fastify/static v9 |
| `@fastify/view` ^12.0.0 | `fastify` ^5.x | Same major alignment rule |
| `esbuild` ^0.28.1 | Node 16+ builder | Builder-only (devDep); not in production image |
## Sources
- [cheerio npm page](https://www.npmjs.com/package/cheerio) — version 1.2.0 confirmed
- [cheerio official docs](https://cheerio.js.org/docs/intro/) — load API, TS usage (HIGH confidence via Context7 CLI)
- [npmtrends: cheerio vs htmlparser2 vs jsdom vs linkedom](https://npmtrends.com/cheerio-vs-htmlparser2-vs-jsdom-vs-linkedom) — download volume (MEDIUM confidence, web)
- [ScrapeOps: Best NodeJS HTML Parsing Libraries](https://scrapeops.io/nodejs-web-scraping-playbook/best-nodejs-html-parsing-libraries/) — comparison (MEDIUM confidence)
- [node-html-parser GitHub benchmarks](https://github.com/node-projects/node-html-parser) — parse speed benchmarks (MEDIUM confidence, community benchmark)
- [undici.nodejs.org](https://undici.nodejs.org/) — confirmed Node 20 fetch is undici-backed (HIGH confidence)
- [pkgpulse: got vs undici vs node-fetch](https://www.pkgpulse.com/guides/got-vs-undici-vs-node-fetch-http-clients-nodejs-2026) — HTTP client comparison (MEDIUM confidence)
- [got README](https://github.com/sindresorhus/got/blob/main/readme.md) — ESM-only confirmation (HIGH confidence)
- [esbuild docs](https://esbuild.github.io/api/) — `--format=cjs --platform=node --bundle` behavior (HIGH confidence)
- [Deploying NodeJS Apps with ESBuild and Docker](https://www.martinrichards.me/post/building_nodejs_apps_with_esbuild_and_docker/) — multi-stage pattern (MEDIUM confidence)
- [WebScraping.AI: JSON-LD extraction with Cheerio](https://webscraping.ai/faq/cheerio/how-do-you-extract-structured-data-like-json-ld-or-microdata-using-cheerio) — JSON-LD pattern (MEDIUM confidence)
- [robots-parser GitHub](https://github.com/samclarke/robots-parser) — robots.txt compliance library (HIGH confidence)
- [vitest docs](https://vitest.dev/guide/) — test setup, coverage (HIGH confidence)
- npm registry (direct): all versions verified via `npm show <pkg> version` on 2026-06-26
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
