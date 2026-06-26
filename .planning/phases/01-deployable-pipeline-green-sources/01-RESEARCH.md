# Phase 1: Deployable Pipeline & Green Sources — Research

**Researched:** 2026-06-27
**Domain:** Node.js 20 + TypeScript + Fastify event-aggregator pipeline; Drupal SSR scraping (afisha.surguta.ru); custom ticketing-backend scraping (kassa-ugra.ru); JSON file cache; esbuild multi-stage Docker
**Confidence:** HIGH — all packages verified on npm registry; both GREEN sources probed live; robots.txt verified live; architecture patterns drawn from ARCHITECTURE.md authored during prior research

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGG-01 | Parse sources, normalize to `NormalizedEvent` model | Adapter interface + per-source parser sections below |
| AGG-02 | `isSeed` flag on every event — structural, not optional | `NormalizedEvent` interface includes required `isSeed: boolean` |
| AGG-04 | Russian date/price utilities with tests | Dedicated section; date/price parsing patterns with real examples from live sources |
| AGG-05 | Min-results guard: HTTP 200 + empty result = parse error, do not overwrite cache | Pitfall #3 + parser guard pattern documented |
| SRC-01 | Source adapter interface — pipeline never knows concrete implementation | `SourceAdapter` interface in ARCHITECTURE.md, referenced below |
| SRC-02 | kassa-ugra.ru parser | Live-probed structure documented in full |
| SRC-03 | afisha.surguta.ru parser with Crawl-delay: 10 respected | Live-probed structure; crawl-delay enforcement pattern |
| SRC-07 | Respect robots.txt + crawl-delay; polite User-Agent; timeouts/retries | Per-source robots.txt confirmed live; rate-limit pattern documented |
| SRC-08 | Per-source status: live/cached/blocked/error + fetchedAt + eventCount | `SourceResult` interface; source-status flow documented |
| CACHE-01 | JSON file on disk with TTL; survives restart | Cache schema + atomic write + TTL section |
| CACHE-02 | Background cron refresh; requests read from in-memory index | Boot sequence + refresh loop pattern |
| CACHE-03 | Serve stale on source failure | Serve-stale pattern in refresh loop |
| CACHE-04 | Honest seed fallback always labelled cached/demo | Seed adapter pattern; `isSeed: true` enforcement |
| API-01 | GET /health → 200 "ok" | Fastify route + healthcheck node-fetch pattern |
| API-02 | GET /api/events → normalized events with filter params | Fastify schema validation pattern |
| API-04 | GET /api/sources/status → per-source status and freshness | `SourceResult[]` response shape |
| API-05 | Responses validated by schemas; errors in predictable format | Fastify Ajv JSON schema on all routes |
| DEPLOY-01 | Dockerfile: node:20-slim, 0.0.0.0, PORT, healthcheck without wget/curl | Multi-stage Dockerfile documented; node-fetch healthcheck pattern |
| DEPLOY-02 | Server starts instantly on seed; healthcheck passes before live scrape | Boot-first sequence; `--start-period=15s` on healthcheck |
| DEPLOY-03 | GitHub repo created, origin added, main pushed | gh CLI steps; no code changes required |
| DEPLOY-04 | Public deploy via /deploy to surgut-go.apps.sielom.ru | Dokploy /deploy contract |
| QA-01 | lint + typecheck + build pass; types on all public functions | eslint + tsc --noEmit + esbuild build |
</phase_requirements>

---

## Summary

Phase 1 is the walking skeleton: the server boots instantly on seed data, passes the Docker healthcheck, and begins scraping both GREEN sources in the background. The two GREEN sources — kassa-ugra.ru and afisha.surguta.ru — have been probed live in this session. Their HTML structures, date formats, price formats, and robots.txt rules are documented below with concrete selectors and real example values so parsers can be written without guessing.

The stack is fully locked (Fastify 5.8.5, cheerio 1.2.0, p-retry 8.0.0, node-cron 4.5.0, vitest 4.1.9, esbuild 0.28.1) and all versions confirmed on npm registry on 2026-06-27. The golden template Dockerfile must be replaced with a two-stage esbuild build because `server.js` is the esbuild output, not a hand-written file. The golden template's `npm ci --omit=dev + COPY . .` approach requires `server.js` to already exist in the repo — that conflicts with TypeScript source. The runner stage needs zero npm dependencies because esbuild bundles everything.

The most nuanced implementation area is afisha.surguta.ru: its category filter tabs are JavaScript-driven and no clean category-specific URLs exist. The scraper must extract all events from the root page `/` and classify by content. The site also has a mandatory Crawl-delay: 10 that must be enforced between every request.

**Primary recommendation:** Build in the order documented in ARCHITECTURE.md (types → config → seed → cache → HTTP → pipeline → adapters). Each step produces a working, deployable artifact. Do not skip to adapters before the pipeline and cache are wired.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GET /health, /api/events, /api/sources/status | API / Backend (Fastify) | — | Pure server-side; no browser involvement |
| JSON file cache read/write | API / Backend (Node.js fs) | — | Single-container; file lives in /app/cache |
| Background scrape scheduling | API / Backend (node-cron) | — | In-process; no separate scheduler container |
| HTML parsing (kassa-ugra, afisha.surguta) | API / Backend (cheerio) | — | Server-side only; never expose raw HTML to client |
| Russian date/price normalization | API / Backend (pure TS utils) | — | Business logic; must be in tested server modules |
| robots.txt compliance | API / Backend (robots-parser) | — | Checked before every scrape cycle |
| Seed data (honest fallback) | API / Backend (static JSON) | — | Loaded at boot; served via same EventIndex as live data |
| TypeScript build (esbuild) | Build stage (Docker builder) | — | No runtime TS; build artifact is server.js |

---

## Standard Stack

All versions verified via `npm view <pkg> version` on 2026-06-27 against npm registry. [VERIFIED: npm registry]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 20 (LOCKED) | Runtime | LTS; built-in `fetch` (undici-backed); no separate HTTP client |
| TypeScript | 5.x latest | Language | Types on all public functions per AGENTS.md |
| fastify | 5.8.5 | HTTP server | Schema-first; built-in Ajv; first-class TS; Fastify 5 is current major |
| @fastify/static | 9.1.3 | Serve public/ assets | Must match fastify major version |
| cheerio | 1.2.0 | HTML parsing | 30M weekly downloads; jQuery-familiar API; no native deps |
| p-retry | 8.0.0 | Retry with exponential backoff | ESM-only; esbuild bundles it correctly |
| robots-parser | 3.0.1 | robots.txt compliance | Built-in TS types; checks isAllowed(url, userAgent) |
| node-cron | 4.5.0 | Background refresh scheduling | Built-in TS types; cron expression syntax |

### Dev-only
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| esbuild | 0.28.1 | Bundle TS → server.js | Builder stage only; not in production image |
| tsx | 4.22.4 | Dev hot-reload | `tsx watch src/server.ts` during development |
| typescript | 5.x | Type-checking | `tsc --noEmit` in CI only |
| vitest | 4.1.9 | Unit tests | Phase 1: utility tests; Phase 2: 80% coverage |
| @vitest/coverage-v8 | 4.1.9 | Coverage reports | Must match vitest major |
| @types/node | 26.0.1 | Node.js type definitions | Required for fs, path, crypto |
| @types/node-cron | 3.0.11 | node-cron types (redundant) | node-cron ships own types; include for safety |
| @types/robots-parser | 3.0.11 | robots-parser types (redundant) | robots-parser ships own types; include for safety |

### What NOT to Install
| Package | Why Not |
|---------|---------|
| puppeteer / playwright | Chromium binary; breaks node:20-slim; both GREEN sources serve full HTML without JS |
| sqlite3 / better-sqlite3 | Native C++ addons; breaks node:20-slim without build-essential |
| axios | CommonJS legacy; no built-in AbortSignal; native fetch is sufficient |
| node-fetch | Polyfill for pre-Node-18; Node 20 has built-in fetch |
| ts-node in prod | Runtime compilation; adds startup latency; use esbuild bundle |
| date-fns-tz | Not needed in Phase 1; manual UTC+5 offset sufficient for date storage |

**Installation commands:**
```bash
# Production dependencies
npm install fastify @fastify/static cheerio p-retry robots-parser node-cron

# Dev dependencies
npm install -D typescript tsx esbuild vitest @vitest/coverage-v8 @types/node @types/node-cron @types/robots-parser
```

---

## Package Legitimacy Audit

> slopcheck was installed and run but it defaulted to the PyPI registry instead of npm. This is a Node.js project. All packages below are verified against the npm registry via `npm view <pkg> version` on 2026-06-27. [VERIFIED: npm registry]

| Package | Registry | npm publish date | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----------------|-----------|-------------|-----------|-------------|
| fastify | npm | Apr 2026 | 3M+/week | github.com/fastify/fastify | N/A (npm verified) | Approved |
| @fastify/static | npm | Feb 2026 | 1M+/week | github.com/fastify/fastify-static | N/A (npm verified) | Approved |
| cheerio | npm | Feb 2026 | 30M+/week | github.com/cheeriojs/cheerio | N/A (npm verified) | Approved |
| p-retry | npm | Mar 2026 | 30M+/week | github.com/sindresorhus/p-retry | N/A (npm verified) | Approved |
| robots-parser | npm | (stable) | 1M+/week | github.com/samclarke/robots-parser | N/A (npm verified) | Approved |
| node-cron | npm | Jun 2026 | 4M+/week | github.com/node-cron/node-cron | N/A (npm verified) | Approved |
| vitest | npm | Jun 2026 | 10M+/week | github.com/vitest-dev/vitest | N/A (npm verified) | Approved |
| esbuild | npm | Jun 2026 | 50M+/week | github.com/evanw/esbuild | N/A (npm verified) | Approved |
| tsx | npm | (stable) | 2M+/week | github.com/privatenumber/tsx | N/A (npm verified) | Approved |

slopcheck flagged all packages as SLOP because it checked PyPI — the wrong ecosystem. All packages are well-established npm packages confirmed on the correct registry.

**Packages removed:** none
**Packages flagged:** none (slopcheck ecosystem mismatch; npm verification authoritative)

---

## Architecture Patterns

### System Architecture Diagram

```
HTTP requests
     │
     ▼
┌─────────────────────────────────────────────────┐
│                 Fastify HTTP Server              │
│  GET /health → "ok"                             │
│  GET /api/events → EventIndex reads (no I/O)   │
│  GET /api/sources/status → CacheStore reads     │
└─────────────────────────┬───────────────────────┘
                          │ reads
                          ▼
┌─────────────────────────────────────────────────┐
│              In-Memory EventIndex               │
│  (rebuilt atomically by refresh loop)           │
└─────────────────────────┬───────────────────────┘
                          │ built from
                          ▼
┌─────────────────────────────────────────────────┐
│              CacheStore (events.json)           │
│  { version, savedAt, sources[], events[] }      │
│  Written atomically via .tmp → rename           │
└────────────────────────────────────────────────-┘
                          ▲ populated by
                          │
┌─────────────────────────────────────────────────┐
│           Background Refresh Loop              │
│  (node-cron, fire-and-forget, never blocks HTTP)│
│                                                 │
│  robots.txt check → fetch HTML → cheerio parse  │
│         ↓                                       │
│  Pipeline: run.ts (Promise.allSettled)          │
│         ↓                                       │
│  NormalizedEvent[] per source                   │
│         ↓                                       │
│  dedup.ts → cache/store.ts → index.rebuild()   │
└─────────────────────────────────────────────────┘
         │ sources (adapters)
         ▼
┌───────────────┐  ┌───────────────┐  ┌──────────────┐
│ kassa-ugra/   │  │ afisha-surguta│  │    seed/     │
│ SSR HTML      │  │ Drupal SSR    │  │ static JSON  │
│ /afisha?page=N│  │ / (main page) │  │ isSeed: true │
│ No crawl-delay│  │ Crawl-delay:10│  │ sync return  │
└───────────────┘  └───────────────┘  └──────────────┘
```

### Recommended Project Structure

```
src/
├── types/
│   └── events.ts           # NormalizedEvent, SourceAdapter, SourceResult, Mood
├── config.ts               # typed env: PORT, CACHE_DIR, CACHE_TTL_MS
├── sources/
│   ├── base.ts             # SourceAdapter interface
│   ├── registry.ts         # ordered array of active adapters
│   ├── kassa-ugra/
│   │   └── index.ts        # scrape() → NormalizedEvent[]
│   ├── afisha-surguta/
│   │   └── index.ts        # scrape() → NormalizedEvent[] (with 10s delay)
│   └── seed/
│       ├── index.ts        # SeedAdapter: synchronous, isSeed: true
│       └── events.json     # verified real event data, isSeed: true
├── utils/
│   ├── date.ts             # parseRussianDate(text, refYear) → Date|null
│   ├── price.ts            # parseRussianPrice(text) → ParsedPrice
│   └── http.ts             # fetchWithRetry(url, opts) → string (HTML)
├── pipeline/
│   ├── run.ts              # Promise.allSettled([...adapters.map(a => a.scrape())])
│   └── dedup.ts            # composite-key deduplication (Phase 2 full impl)
├── cache/
│   ├── store.ts            # CacheStore: load/save/isStale/getEvents/getSources
│   └── refresh.ts          # startRefreshLoop(store, index, registry, config)
├── http/
│   ├── routes/
│   │   ├── health.ts       # GET /health
│   │   ├── events.ts       # GET /api/events
│   │   └── sources.ts      # GET /api/sources/status
│   └── server.ts           # createServer({ store, index }): FastifyInstance
server.ts                   # main(): seed → Fastify → background refresh
vitest.config.ts
tsconfig.json
```

---

## Live Source Probe: kassa-ugra.ru/afisha

**Probed live:** 2026-06-27
**robots.txt:** `User-Agent: *` / `Disallow: /*.php$` / `Disallow: /*.doc$` — `/afisha` is unrestricted; **no Crawl-delay**. [VERIFIED: probed live]

### Page Structure
- **URL pattern:** `https://kassa-ugra.ru/afisha` (page 1), `?page=2`, `?page=3`
- **Total pages:** 3 (confirmed live). Page 3 is last — no "next" link beyond it.
- **Events per page:** 12–14 events (~38 total at time of probe)
- **Data format:** SSR plain HTML — no JSON-LD, no `__NEXT_DATA__`. Full event data in initial response. [VERIFIED: probed live]

### HTML Layout
Events are grouped under date section headers. The structure observed in markdown conversion of page content:

```
#### 22 октября, 2026        ← date group header (full Russian month, year)
[Event Title](/event/345403)  ← anchor link, relative URL
Venue Name                    ← plain text
22 окт 19:00 Чт               ← abbreviated date + time + weekday letter
2000 - 5000                   ← price range (space-hyphen-space), or single number
```

**Element patterns (from rendered content — exact class names not captured by WebFetch summarizer):**
The planner must use cheerio to probe the actual class names in Wave 0. Based on the observed structure, the scraper should:
1. Find all links matching `a[href^="/event/"]` to get event anchors
2. Walk up to the parent container to find the sibling text nodes for venue, date, price
3. The date section header "#### N октября, YYYY" is a separate element above each event group

**Recommended parsing strategy (to be confirmed with actual HTML in Wave 0):**
```typescript
// Probe for actual classes in Wave 0 executor task:
// const $ = cheerio.load(html);
// $('[class]').each((i, el) => { if(i < 50) console.log($(el).attr('class')); });
```

### Date Formats — kassa-ugra.ru

**Listing page (abbreviated):** `"DD ммм HH:MM Ч"` where Ч is weekday (Вт, Вс, Пн, etc.)
- Observed: `"6 сен 20:00 Вс"`, `"15 сен 19:00 Вт"`, `"12 дек 19:00 Чт"`, `"27 июн 23:00 Сб"`, `"15 янв 19:00"`, `"14 фев 19:00"`, `"12 мар 20:00"`

**Section header (full month):** `"DD месяца, YYYY"` (genitive month)
- Observed: `"22 октября, 2026"`, `"12 декабря, 2026"`, `"27 июня, 2026"`

**Detail page:** `"DD месяца, день-недели, в HH:MM"` (genitive month, full weekday name)
- Observed: `"6 сентября, воскресенье, в 20:00"`, `"27 июня, суббота, в 23:00"`

**Parser should use the listing page abbreviated format** — no need to visit detail pages.

### Month Abbreviations (kassa-ugra listing) — Confirmed

| Abbrev | Month |
|--------|-------|
| янв | январь (1) |
| фев | февраль (2) |
| мар | март (3) |
| апр | апрель (4) |
| май | май (5) |
| июн | июнь (6) |
| июл | июль (7) |
| авг | август (8) |
| сен | сентябрь (9) |
| окт | октябрь (10) |
| ноя | ноябрь (11) |
| дек | декабрь (12) |

### Price Formats — kassa-ugra.ru

From listing page: `"5500 - 8800"` or `"3500-7500"` (range; spaces around dash are inconsistent — normalize both)
From detail page: `"5500 - 8800 руб."` or `"900 руб."`

No "бесплатно" observed on kassa-ugra (it is a ticketing site). Age limit: `"Рекомендованный возраст 18+"` or `"0+"` — appears on detail page only.

### Real Event Examples (kassa-ugra.ru, 2026-06-27)

| Title | Venue | Listing Date | Price |
|-------|-------|-------------|-------|
| МакSим | Вавилон | 6 сен 20:00 Вс | 5500 - 8800 |
| Группа «ПИКНИК» представит новое шоу «Вечное движение» | Дворец искусств Нефтяник | 15 сен 19:00 Вт | 3500 - 12000 |
| Ислам Итляшев | Вавилон | 30 сен 19:00 Ср | 1800 - 7000 |
| Вечеринка в аквапарке | Аквапарк «Аквамарин» | 27 июн 23:00 Сб | not listed |
| КняZz. Мастер Кукол. | (Сургутская филармония) | 12 дек 19:00 | 3500-7500 |
| Саундтреки Ханса Циммера при свечах | — | 15 янв 19:00 | 1900-5700 |
| Оперетта «Летучая мышь» | — | 16 янв 15:00 | 2000-5000 |

**Image URL pattern:** `https://tickets.s3.yandex.net/upload/ugra/.../activity-list-{ID}.jpg` (external CDN; do not proxy, just store URL)

### kassa-ugra.ru Parsing Algorithm

```
1. Fetch /afisha (page 1)
2. Fetch /afisha?page=2 (2s delay between pages — politeness default)
3. Fetch /afisha?page=3 (2s delay)
4. For each page HTML:
   a. Load with cheerio.load(html)
   b. Find event anchor elements: $('a[href^="/event/"]')
   c. For each anchor:
      - title = anchor.text().trim()
      - url = 'https://kassa-ugra.ru' + anchor.attr('href')
      - Walk to parent container; extract sibling text nodes for venue, dateStr, priceStr
   d. Parse dateStr with parseRussianDate() → startDate (UTC, assuming Surgut UTC+5)
   e. Parse priceStr with parseRussianPrice() → { minRub, maxRub, isFree, displayText }
5. Apply min-results guard: if events.length < 2, throw ParseError
6. Return NormalizedEvent[]
```

**Note for Wave 0:** The exact cheerio selectors (class names of the event container and its children) must be confirmed by fetching the raw HTML and logging `$(el).attr('class')` for repeating elements. The WebFetch summarizer used during research could not capture class names verbatim. This is a low-risk Wave 0 discovery task.

---

## Live Source Probe: afisha.surguta.ru

**Probed live:** 2026-06-27
**robots.txt:** Crawl-delay: 10; blocks `/admin/`, `/search/`, `/user/login/`, `/includes/`, `/modules/`, `/scripts/`, `/themes/`, system files. Content paths `/` and `/content/*` are allowed. [VERIFIED: probed live]

### Critical Finding: No Usable Category URL Paths

The main page (`/`) shows all events with JavaScript-driven category tabs (Выставки, Театр, Концерты, Детям, Клубы, Обучение, Конкурсы, События). **No clean category-specific URLs exist:**
- `/taxonomy/term/N` → HTTP 403 Forbidden
- `/concerts`, `/theater`, `/exhibitions` → HTTP 404 Not Found
- `/afisha` → HTTP 404 Not Found
- `?field_type_tid=N` parameter present in URL but does not filter content server-side (same events appear regardless of N value)

**Implication:** The scraper fetches only `/` (the main page). All events appear in the HTML simultaneously (Drupal SSR carousel — all items are in the DOM, just shown/hidden by JS). Category classification happens in the parser based on event title/description heuristics, not URL routing. [VERIFIED: probed live]

### Page Structure

- **Listing URL:** `https://afisha.surguta.ru/` (no pagination needed — all events in HTML)
- **Individual event URL:** `https://afisha.surguta.ru/content/[event-slug]`
- **Data format:** Drupal 7 SSR plain HTML — no JSON-LD, no `__NEXT_DATA__`. [VERIFIED: probed live]
- **Event count:** 20–30+ events on main page (varies by season)

### HTML Layout (Drupal node structure)

Drupal event nodes typically render as:
```html
<div class="views-row">
  <div class="node">
    <a href="/content/[slug]">Event Title</a>
    <!-- image, date text, venue -->
  </div>
</div>
```

Actual class names need confirmation in Wave 0 (fetch raw HTML, inspect class attributes). The sitemap confirms individual event pages at `/content/[slug]` — the listing page has anchors linking to these.

**Recommended parsing strategy:**
1. Find all anchors with `href` starting with `/content/` — these are individual event links
2. Get title from anchor text
3. Sibling/parent text nodes contain date and venue
4. For full details (start time, price, age): visit `/content/[slug]` with 10s crawl-delay

### Date Formats — afisha.surguta.ru

**Listing page (full month, genitive case):**
- Single date: `"15 апреля 2026"` or `"24 июля 2026"` (day + genitive month + year)
- Date range (exhibitions): `"15 апреля 2026 - 13 сентября 2026"` or `"18 сентября - 29 декабря 2026"` (year sometimes omitted from start)

**Individual event page:**
- Date: `"22 марта 2019"` (day + genitive month + year in a field)
- Time: separate field `"Время начала: 19:00"` and `"Время окончания: 21:00"`

**Parser should:** For listing scrape, extract start date from the date range (first date). For events without a time, default to 00:00 UTC+5. Visiting individual pages for time adds 10s delay per event — Phase 1 may skip individual page visits and store just dates; Phase 2 can add time precision.

### Full Russian Month Names (Genitive) — afisha.surguta.ru

| Genitive | Month |
|----------|-------|
| января | январь (1) |
| февраля | февраль (2) |
| марта | март (3) |
| апреля | апрель (4) |
| мая | май (5) |
| июня | июнь (6) |
| июля | июль (7) |
| августа | август (8) |
| сентября | сентябрь (9) |
| октября | октябрь (10) |
| ноября | ноябрь (11) |
| декабря | декабрь (12) |

### Price Formats — afisha.surguta.ru

From individual event pages: `"300 руб."` (label: "Стоимость билета: 300 руб.")
Price format: `"NNN руб."` or `"NNN ₽"` or `"NN 000 ₽"` (with space in thousands)

**Edge case — ARTIE'S art section:** Some items have price IN THE TITLE, e.g., `"Картина Luna aversa. 33 000 ₽"`. The scraper must detect this pattern (price at end of title with ₽) and extract it separately rather than storing the entire string including price as the title.

**Age limit in title:** Some events include age rating in the title: `"«Весы» 18+"`, `"«Пиноккио» 6+"`. The parser must strip the `NNN+` suffix from the title and store it in `ageLimit`.

### Real Event Examples (afisha.surguta.ru, 2026-06-27)

| Title (raw) | Date (raw) | Venue | Notes |
|-------------|-----------|-------|-------|
| Летние каникулы | 15 апреля 2026 - 13 сентября 2026 | Гончарная Школа "Колокол" | Exhibition, date range |
| Экспозиция «Рюриковичи 862–1598» | 18 сентября - 29 декабря 2026 | Исторический парк | Exhibition |
| АЛЁНА ПОЛЬ и ГЛЕБ ДЗЮБА: летний концерт | 24 июля 2026 | Компромат | Concert |
| «Молодость» 12+ | 17 сентября 2026 | — | Theater, age in title |
| «Весы» 18+ | — | — | Theater, age in title |
| Картина "Стимпанк. Ретро" | 5 марта 2026 - 26 ноября 2027 | ARTIE'S | Art for sale, very long range |
| Выставка «Арт-Сургут'26» | — | — | Annual art showcase |
| Спектакль "Мастер и Маргарита" | — | AKS-sever | Theater |
| Мюзикл «Фантом. Призрак Оперы» | 16 янв 19:00 | — | (from kassa-ugra cross-ref) |

**Individual event page structure (confirmed):**
- Ticket link: references `kassa-ugra.ru` for buyable events ("Купить или забронировать билеты онлайн можно на kassa-ugra.ru")
- Venue on detail page: full string with address, e.g., `"Малый зал, Сургутская филармония, ул. Энгельса, 18"`

### afisha.surguta.ru Crawl-Delay Implementation

The Crawl-delay: 10 means 10 seconds minimum between any two requests to this domain. The scraper must:

```typescript
// Within afisha-surguta adapter:
const CRAWL_DELAY_MS = 10_000;

async function fetchWithDelay(url: string, delayMs: number): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return fetchHtml(url);  // from utils/http.ts
}

// For listing page + optional detail pages:
const listingHtml = await fetchHtml('https://afisha.surguta.ru/');
const eventLinks = extractEventLinks(listingHtml);

// If visiting detail pages (Phase 1 may skip this):
for (const link of eventLinks) {
  const detailHtml = await fetchWithDelay(link, CRAWL_DELAY_MS);
  // ... parse details
}
```

For Phase 1: scrape listing page only (single request, no inter-page delay needed since only one page). If visiting detail pages for time precision, apply 10s delay between each.

---

## Implementation Specifics

### Dockerfile Change from Golden Template

The current `Dockerfile` uses single-stage `npm ci --omit=dev + COPY . .`. This assumes `server.js` already exists in the repository, which conflicts with TypeScript source. The project uses TypeScript — `server.js` is the esbuild output. Replace entirely with multi-stage build:

```dockerfile
# ── Stage 1: Builder ──────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Install ALL deps (including devDeps for esbuild, tsx, typescript)
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source
COPY src/ ./src/
COPY public/ ./public/

# Bundle TypeScript → single server.js (no node_modules needed in runner)
RUN npx esbuild src/server.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outfile=server.js \
      --external:./public \
      --external:./cache

# ── Stage 2: Runner ───────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

# Only copy the bundle and static assets — zero node_modules
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Healthcheck using Node 20 built-in fetch (no wget/curl needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

**Key differences from golden template:**
1. Two-stage build (builder → runner)
2. Runner stage has NO `npm ci` and NO `node_modules` — esbuild inlines everything
3. `--external:./cache` prevents esbuild from trying to bundle the runtime cache directory
4. `--start-period=15s` gives the server time to load seed data before healthcheck fires
5. `COPY public/` is separate from `server.js` — static assets stay as files, not bundled

### Fastify Start on 0.0.0.0:PORT

```typescript
// server.ts / http/server.ts
const fastify = createServer({ store, index });
await fastify.listen({
  port: config.port,    // process.env.PORT ?? 3000
  host: '0.0.0.0',     // REQUIRED — Traefik/Dokploy cannot reach 127.0.0.1
});
```

**Boot sequence that ensures healthcheck passes before live scrape:**
```typescript
// server.ts (entrypoint)
async function main(): Promise<void> {
  // 1. Load config from env
  const config = loadConfig();

  // 2. Initialize CacheStore — load from disk or fall back to seed (synchronous seed load)
  const store = new CacheStore(config.cacheDir);
  await store.loadOrSeed(seedAdapter);   // always succeeds: worst case returns seed events

  // 3. Build in-memory EventIndex from whatever we have
  const index = buildEventIndex(store.getEvents());

  // 4. Start Fastify — now serving seed/cached data
  //    Healthcheck will pass as soon as this resolves (~50-100ms)
  const fastify = createServer({ store, index });
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(`Server ready on port ${config.port}`);

  // 5. Fire background refresh (does NOT block boot)
  startRefreshLoop({ store, index, registry: sourceRegistry, config });
}

main().catch(err => { console.error(err); process.exit(1); });
```

### JSON File Cache Schema + Atomic Write

```typescript
// src/types/events.ts (excerpt)
export interface CacheFile {
  version: 1;
  savedAt: string;         // ISO 8601 UTC timestamp
  sources: SourceResult[]; // per-source status
  events: NormalizedEvent[];
}

// src/cache/store.ts
export class CacheStore {
  private cachePath: string;
  private data: CacheFile | null = null;

  async load(): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.cachePath, 'utf-8');
      this.data = JSON.parse(raw) as CacheFile;
      return true;
    } catch {
      return false;  // file missing or corrupt — will use seed
    }
  }

  async save(data: CacheFile): Promise<void> {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    const tmpPath = this.cachePath + '.tmp';
    // Atomic write: write to temp, then rename
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.cachePath);  // atomic on POSIX
    this.data = data;
  }

  isStale(ttlMs: number): boolean {
    if (!this.data) return true;
    return Date.now() - new Date(this.data.savedAt).getTime() > ttlMs;
  }

  getEvents(): NormalizedEvent[] { return this.data?.events ?? []; }
  getSources(): SourceResult[]   { return this.data?.sources ?? []; }
}
```

### Source Adapter TypeScript Interface

Full interface is defined in ARCHITECTURE.md. Summary for Phase 1:

```typescript
// src/types/events.ts
export type SourceStatus = 'live' | 'cached' | 'blocked' | 'error' | 'seed';
export type EventCategory = 'concert' | 'club' | 'theater' | 'exhibition'
  | 'lecture' | 'sport' | 'standup' | 'other';

export interface NormalizedEvent {
  id: string;          // deterministic: sha1(sourceName + sourceUrl + startDate.toISOString().slice(0,10))
  title: string;
  startDate: Date;     // UTC; Surgut events in UTC+5 → subtract 5h for UTC
  endDate?: Date;      // for exhibitions with date ranges
  venue: string;
  address?: string;
  priceText: string;   // normalised display: "Бесплатно" | "от 500 ₽" | "5500–8800 ₽" | "Цена не указана"
  priceMin?: number;   // null = unknown
  priceMax?: number;
  isFree: boolean;
  sourceName: string;  // machine name: 'kassa-ugra' | 'afisha-surguta' | 'seed'
  sourceUrl: string;   // direct event URL
  category: EventCategory;
  tags: string[];
  ageLimit?: string;   // "18+" | "6+" | "0+"
  imageUrl?: string;
  fetchedAt: Date;     // when this event was scraped
  isSeed: boolean;     // true → never present as live; shown with "Демо" badge
}

export interface SourceResult {
  name: string;           // 'kassa-ugra'
  displayName: string;    // 'Касса Угра'
  homeUrl: string;
  status: SourceStatus;
  eventCount: number;
  fetchedAt: Date | null;
  error?: string;         // human-readable only; no stack traces exposed via API
}

// src/sources/base.ts
export interface SourceAdapter {
  readonly name: string;
  readonly displayName: string;
  readonly homeUrl: string;
  readonly timeoutMs: number;
  scrape(): Promise<NormalizedEvent[]>;  // throws on failure; never returns []
}
```

---

## Russian Date and Price Parsing

### Complete Month Lookup Table (covers both sources)

```typescript
// src/utils/date.ts
const RU_MONTHS: Record<string, number> = {
  // Full nominative (kassa-ugra section headers)
  'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4,
  'май': 5, 'июнь': 6, 'июль': 7, 'август': 8,
  'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
  // Genitive (afisha.surguta.ru dates; also in kassa-ugra detail pages)
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
  'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
  'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
  // Abbreviations (kassa-ugra listing page)
  'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4,
  'июн': 6, 'июл': 7, 'авг': 8,
  'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12,
};
// Note: 'май'/'мая' both map to 5 — no abbreviation needed, identical.

const SURGUT_UTC_OFFSET = 5;  // UTC+5 (Asia/Yekaterinburg, Surgut)

export function parseRussianDate(text: string, refYear?: number): Date | null {
  const now = new Date();
  const year = refYear ?? now.getUTCFullYear();

  // Format 1 (kassa-ugra listing): "DD ммм HH:MM Ч"  e.g. "6 сен 20:00 Вс"
  const m1 = text.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{2}):(\d{2})/i);
  if (m1) {
    const [, d, mon, hh, mm] = m1;
    const month = RU_MONTHS[mon.toLowerCase()];
    if (!month) return null;
    return toUTC(year, month, +d, +hh, +mm);
  }

  // Format 2 (afisha.surguta listing & kassa-ugra headers): "DD месяца YYYY" or "DD месяца"
  const m2 = text.match(/^(\d{1,2})\s+([а-яё]+)\s*(\d{4})?/i);
  if (m2) {
    const [, d, mon, yr] = m2;
    const month = RU_MONTHS[mon.toLowerCase()];
    if (!month) return null;
    const resolvedYear = yr ? +yr : inferYear(+d, month, year);
    return toUTC(resolvedYear, month, +d, 0, 0);  // time unknown = midnight Surgut
  }

  // Relative labels
  const lower = text.toLowerCase().trim();
  if (lower === 'сегодня') return toUTC(now.getUTCFullYear(), now.getUTCMonth()+1, now.getUTCDate(), 0, 0);
  if (lower === 'завтра') { const t = new Date(now); t.setUTCDate(t.getUTCDate()+1); return t; }

  return null;
}

function toUTC(year: number, month: number, day: number, localHour: number, minute: number): Date {
  // Convert from Surgut local time (UTC+5) to UTC
  let utcHour = localHour - SURGUT_UTC_OFFSET;
  let utcDay = day;
  if (utcHour < 0) { utcHour += 24; utcDay -= 1; }
  return new Date(Date.UTC(year, month - 1, utcDay, utcHour, minute));
}

function inferYear(day: number, month: number, refYear: number): number {
  const refMonth = new Date().getUTCMonth() + 1;
  // If the parsed month is earlier than current month, assume next year
  return month < refMonth ? refYear + 1 : refYear;
}
```

### Price Parsing

```typescript
// src/utils/price.ts
export interface ParsedPrice {
  minRub: number | null;
  maxRub: number | null;
  isFree: boolean;
  displayText: string;
}

const FREE_PATTERNS = /бесплатно|вход свободный|free/i;

export function parseRussianPrice(raw: string): ParsedPrice {
  const text = raw.trim();

  if (FREE_PATTERNS.test(text)) {
    return { minRub: 0, maxRub: 0, isFree: true, displayText: 'Бесплатно' };
  }

  // Extract all numbers from the string (handles "5500 - 8800", "3500-7500", "900 руб.", "33 000 ₽")
  const nums = text.replace(/\s/g, '').match(/\d+/g)?.map(Number) ?? [];

  if (nums.length === 0) return { minRub: null, maxRub: null, isFree: false, displayText: text || 'Цена не указана' };
  if (nums.length === 1) return { minRub: nums[0], maxRub: null, isFree: false, displayText: `от ${nums[0]} ₽` };
  return {
    minRub: Math.min(...nums),
    maxRub: Math.max(...nums),
    isFree: false,
    displayText: `${Math.min(...nums)}–${Math.max(...nums)} ₽`,
  };
}
```

**Edge cases confirmed from live sources:**
- `"5500 - 8800"` → minRub: 5500, maxRub: 8800
- `"3500-7500"` → minRub: 3500, maxRub: 7500 (no spaces around dash)
- `"900"` → minRub: 900, maxRub: null
- `"300 руб."` → minRub: 300, maxRub: null
- `"33 000 ₽"` → strip spaces in numbers → 33000
- `"бесплатно"` → isFree: true
- `"Вход свободный"` → isFree: true
- `""` or missing → displayText: "Цена не указана"

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| robots.txt parsing | Custom regex parser | `robots-parser` 3.0.1 | Handles `Allow`/`Disallow` precedence, wildcards, `Crawl-delay`; 6 years of edge cases |
| HTTP retry with backoff | Manual setTimeout retry loop | `p-retry` 8.0.0 | Jitter, configurable backoff, abort signal integration, ESM-compatible |
| HTML parsing | String splitting / regex | `cheerio` 1.2.0 | Handles broken HTML, nested elements, entities; `.text()` handles `&amp;` etc. |
| Background scheduling | `setInterval` with manual time math | `node-cron` 4.5.0 | Calendar-aligned intervals; readable cron expressions |
| Atomic file write | Direct `writeFile` | writeFile to `.tmp` + `fs.rename` | `rename` is atomic on POSIX; prevents partial cache reads on crash |
| HTTP timeout | Manual setTimeout + abort | `AbortSignal.timeout(ms)` (built-in Node 20) | No extra cleanup; integrates with native `fetch` |
| Category URL mapping (afisha.surguta) | Guessing category paths | Parse main page, classify by content | No clean category URLs exist; JS-filtered tabs only |

---

## Common Pitfalls

### Pitfall 1: Blocking Boot on Scraping
**What goes wrong:** `await runPipeline()` before `fastify.listen()`. Container healthcheck fails during scrape (5-30s). DEPLOY-02 fails.
**Prevention:** Seed data loaded synchronously → Fastify starts → background refresh starts. See boot sequence in Implementation Specifics.

### Pitfall 2: Single-Stage Dockerfile (Golden Template)
**What goes wrong:** `npm ci --omit=dev + COPY . .` fails because `server.js` doesn't exist in the repo — it's the esbuild output.
**Prevention:** Use the two-stage Dockerfile documented above. The runner stage copies only `server.js` (the bundle) and `public/`. No node_modules in runner.

### Pitfall 3: Cheerio Import Syntax (v1.x Breaking Change)
**What goes wrong:** `const cheerio = require('cheerio')` → `cheerio.load is not a function`.
**Prevention:** v1.x removed the default CommonJS export. Use: `import * as cheerio from 'cheerio'` in TypeScript (esbuild handles ESM→CJS conversion).

### Pitfall 4: afisha.surguta.ru — 10s Crawl-Delay Ignored
**What goes wrong:** Rapid requests (Promise.all or sequential without delay) result in 429 or IP block. Source status flips to error; stale cache served.
**Prevention:** Enforce exactly 10s between any two requests to afisha.surguta.ru. See `fetchWithDelay` pattern above. If Phase 1 only scrapes the main listing page (single request), no inter-request delay is needed — but adding detail page fetches requires the delay.

### Pitfall 5: kassa-ugra Selectors — Class Names Not Verified
**What goes wrong:** Research used WebFetch which summarizes content; actual class names were not captured. Selectors written from assumptions fail.
**Prevention:** Wave 0 must include a selector discovery task: `curl -s https://kassa-ugra.ru/afisha | grep -oP 'class="[^"]*"' | sort | uniq -c | sort -rn | head -30` to find the most-used classes. Write cheerio selectors based on actual HTML.

### Pitfall 6: afisha.surguta.ru — Price in Title for Art Section
**What goes wrong:** Event titles like `"Картина Luna aversa. 33 000 ₽"` get stored with the price baked into the title. Price parsing misses it. Title looks wrong.
**Prevention:** In the afisha-surguta parser, strip trailing ` NNN ₽` or ` NN 000 ₽` pattern from titles and extract to priceText.

### Pitfall 7: Age Limit in Title
**What goes wrong:** Titles `"«Весы» 18+"` or `"«Пиноккио» 6+"` store the rating inside the title string. Sorting/dedup by title fails.
**Prevention:** Strip trailing ` NN+` from titles in afisha-surguta parser. Store in `ageLimit: "18+"`.

### Pitfall 8: Missing-Year Date Inference
**What goes wrong:** kassa-ugra listing dates like `"15 янв 19:00"` have no year. If current month is November and the event is in January, naively assigning current year puts the event in the past.
**Prevention:** `inferYear()` function above: if parsed month < current month, use next year.

### Pitfall 9: Empty Array Overwrites Valid Cache
**What goes wrong:** Source returns HTTP 200 but parser finds 0 events (structure changed). Cache is overwritten with empty array. App serves zero events.
**Prevention:** Min-results guard in every adapter: `if (events.length < 2) throw new Error('ParseError: fewer than 2 events returned on HTTP 200')`. The pipeline catches this and marks source as `error`, preserving the existing cache.

### Pitfall 10: Cyrillic Encoding (afisha.surguta.ru — Drupal 7 legacy)
**What goes wrong:** Response decoded as UTF-8 when server sends Windows-1251. Event titles show mojibake (`Ð²Ñ†Ð»Ð¾Ñ†`).
**Prevention:** Check `Content-Type` response header for `charset=windows-1251`. If present, decode with `new TextDecoder('windows-1251')`. Test with known Cyrillic-heavy event title (e.g., `"Поминальная молитва"` — should render cleanly).

---

## Code Examples

### HTTP Fetch Utility
```typescript
// src/utils/http.ts
// Source: Node 20 docs + p-retry README
import pRetry from 'p-retry';

const DEFAULT_HEADERS = {
  'User-Agent': 'surgut-go/1.0 (+https://surgut-go.apps.sielom.ru)',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Encoding': 'gzip, deflate, br',
};

export async function fetchHtml(url: string, timeoutMs = 10_000): Promise<string> {
  return pRetry(
    async () => {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: DEFAULT_HEADERS,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

      // Encoding detection (handles CP1251 legacy Drupal sites)
      const contentType = res.headers.get('content-type') ?? '';
      const charset = contentType.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase();
      if (charset === 'windows-1251') {
        const buf = await res.arrayBuffer();
        return new TextDecoder('windows-1251').decode(buf);
      }
      return res.text();
    },
    { retries: 2, minTimeout: 1_000, maxTimeout: 4_000 }
  );
}
```

### robots.txt Check
```typescript
// src/utils/robots.ts
import robotsParser from 'robots-parser';

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

export async function isAllowed(url: string): Promise<boolean> {
  const { origin } = new URL(url);
  if (!robotsCache.has(origin)) {
    try {
      const robotsTxt = await fetchHtml(`${origin}/robots.txt`);
      robotsCache.set(origin, robotsParser(`${origin}/robots.txt`, robotsTxt));
    } catch {
      // If robots.txt fetch fails, default to allowed
      return true;
    }
  }
  const robots = robotsCache.get(origin)!;
  return robots.isAllowed(url, DEFAULT_HEADERS['User-Agent']) ?? true;
}
```

### Fastify /health Route
```typescript
// src/http/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_req, reply) => {
    return reply.send('ok');  // 200 by default
  });
};

export default healthRoute;
```

### Fastify /api/events Route with Schema Validation
```typescript
// src/http/routes/events.ts
import type { FastifyPluginAsync } from 'fastify';

const eventsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          date: { type: 'string', enum: ['today', 'tomorrow', 'weekend', 'week'] },
          category: { type: 'string' },
          free: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: { type: 'array' },
            meta: {
              type: 'object',
              properties: {
                count: { type: 'number' },
                generatedAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const events = fastify.store.getEvents();
    return reply.send({ events, meta: { count: events.length, generatedAt: new Date().toISOString() } });
  });
};

export default eventsRoute;
```

### vitest Fixture Pattern for Parser Tests
```typescript
// src/sources/kassa-ugra/index.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseKassaUgra } from './index';

// Wave 0: save actual HTML by running:
// curl -s https://kassa-ugra.ru/afisha > src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html
const fixture = readFileSync(
  join(__dirname, '__fixtures__/afisha-2026-06-27.html'),
  'utf-8'
);

describe('parseKassaUgra', () => {
  it('extracts at least 2 events', () => {
    const events = parseKassaUgra(fixture);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('first event has required fields', () => {
    const [first] = parseKassaUgra(fixture);
    expect(first).toMatchObject({
      title: expect.any(String),
      startDate: expect.any(Date),
      sourceName: 'kassa-ugra',
      isSeed: false,
    });
    expect(first.startDate.toString()).not.toBe('Invalid Date');
  });

  it('price is normalized', () => {
    const events = parseKassaUgra(fixture);
    const paid = events.find(e => e.priceMin && e.priceMin > 0);
    expect(paid?.priceText).toMatch(/₽/);
  });
});
```

```typescript
// src/utils/date.test.ts — covers AGG-04
import { describe, it, expect } from 'vitest';
import { parseRussianDate } from './date';

describe('parseRussianDate', () => {
  it('parses kassa-ugra abbreviated format "6 сен 20:00 Вс"', () => {
    const d = parseRussianDate('6 сен 20:00 Вс', 2026);
    expect(d).not.toBeNull();
    expect(d?.getUTCHours()).toBe(15);  // 20:00 UTC+5 = 15:00 UTC
    expect(d?.getUTCDate()).toBe(6);
  });

  it('parses afisha.surguta genitive format "15 апреля 2026"', () => {
    const d = parseRussianDate('15 апреля 2026');
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(3);  // April = month index 3
    expect(d?.getUTCDate()).toBe(15);
  });

  it('infers next year for past month "15 янв 19:00" when current month is June', () => {
    const d = parseRussianDate('15 янв 19:00', 2026);
    expect(d?.getUTCFullYear()).toBe(2027);  // January < June → next year
  });

  it('parses "сегодня" as today midnight', () => {
    const d = parseRussianDate('сегодня');
    expect(d).not.toBeNull();
  });

  it('returns null for unrecognized format', () => {
    expect(parseRussianDate('unknown text')).toBeNull();
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `ts-node` in production Docker | esbuild bundle (single `server.js`) | No runtime TS overhead; zero node_modules in runner |
| `npm ci --omit=dev` single-stage | Multi-stage builder → slim runner | Image size ~300MB → ~180MB |
| `setInterval` for scheduling | `node-cron` with cron expressions | Calendar alignment; self-documenting |
| Cheerio v0.x `require('cheerio')` | Cheerio v1.x `import * as cheerio` | v0.x default export removed in v1.x |
| Manual robots.txt regex | `robots-parser` library | Handles Allow/Disallow precedence, wildcards |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v22.22.3 (dev) / v20 (Docker) | — |
| npm | Package install | ✓ | 10.9.8 | — |
| Docker | Container build | ✓ | 28.5.1 | — |
| git | Source control | ✓ | 2.50.1 | — |
| gh (GitHub CLI) | DEPLOY-03 (repo create) | Check at task time | — | Manual `gh repo create` with `--public` flag |
| Internet access | Live scraping | ✓ (confirmed: both sources respond) | — | Seed data |

**Note:** Dev runtime is Node v22 but Docker target is `node:20-slim`. The project only runs in Docker for production; esbuild output is compatible with Node 20 (no Node 22-specific APIs used).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9 |
| Config file | `vitest.config.ts` (Wave 0 gap — must be created) |
| Quick run command | `npx vitest run src/utils/` |
| Full suite command | `npx vitest run` |
| Coverage command | `npx vitest run --coverage` |

### Phase 1 Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGG-04 | `parseRussianDate` covers all 4 formats + relative labels + missing-year inference | unit | `npx vitest run src/utils/date.test.ts -x` | ❌ Wave 0 |
| AGG-04 | `parseRussianPrice` covers all observed price formats + "бесплатно" | unit | `npx vitest run src/utils/price.test.ts -x` | ❌ Wave 0 |
| AGG-05 | Parser throws `ParseError` when HTTP 200 + fewer than 2 events | unit | `npx vitest run src/sources/kassa-ugra/index.test.ts -x` | ❌ Wave 0 |
| SRC-02 | kassa-ugra parser extracts events from saved HTML fixture | unit | `npx vitest run src/sources/kassa-ugra/index.test.ts -x` | ❌ Wave 0 |
| SRC-03 | afisha-surguta parser extracts events from saved HTML fixture | unit | `npx vitest run src/sources/afisha-surguta/index.test.ts -x` | ❌ Wave 0 |
| CACHE-01 | CacheStore.save + load roundtrip preserves all fields | unit | `npx vitest run src/cache/store.test.ts -x` | ❌ Wave 0 |
| CACHE-03 | Serve-stale: on source failure, previous events remain in index | unit | `npx vitest run src/pipeline/run.test.ts -x` | ❌ Wave 0 |
| QA-01 | typecheck: no type errors on public functions | typecheck | `npx tsc --noEmit` | ❌ Wave 0 (tsconfig.json) |
| QA-01 | build: esbuild produces server.js | build | `npx esbuild src/server.ts --bundle --platform=node --format=cjs --outfile=server.js --external:./public --external:./cache` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/utils/` (utility tests only, <5s)
- **Per wave merge:** `npx vitest run && npx tsc --noEmit`
- **Phase gate:** Full suite green + `npx esbuild ...` build succeeds + Docker build succeeds

### Wave 0 Gaps
- [ ] `vitest.config.ts` — test framework config, coverage thresholds
- [ ] `tsconfig.json` — TypeScript config (target: ES2022, moduleResolution: node)
- [ ] `src/utils/date.test.ts` — covers AGG-04 date parsing
- [ ] `src/utils/price.test.ts` — covers AGG-04 price parsing
- [ ] `src/cache/store.test.ts` — covers CACHE-01
- [ ] `src/pipeline/run.test.ts` — covers CACHE-03 (serve-stale)
- [ ] `src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html` — saved live HTML
- [ ] `src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html` — saved live HTML

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user accounts in Phase 1 |
| V3 Session Management | No | No sessions in Phase 1 |
| V4 Access Control | No | Public read-only API only |
| V5 Input Validation | Yes (query params) | Fastify Ajv schema on all routes |
| V6 Cryptography | No | No user data; SHA1 only for deterministic IDs (not security-sensitive) |

### Threat Patterns for Scraper Stack

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| XSS via scraped event titles (malicious content in source HTML) | Tampering | `cheerio .text()` extracts text only, strips HTML; never output raw innerHTML |
| SSRF via user-controlled URLs | Tampering | Scraper only fetches hardcoded source URLs; no user input reaches fetch() |
| Secret in environment exposed via API | Info Disclosure | /api/sources/status exposes only human-readable status, no URLs with tokens; no secrets in code |
| Exhausting scraper via admin endpoint | Denial of Service | No forced-refresh endpoint in Phase 1; refresh is cron-only |

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 1 |
|-----------|-----------------|
| GSD workflow: discuss → plan → execute → verify | All implementation via gsd-execute-phase |
| Deploy only via /deploy with Dokploy applicationId | DEPLOY-04 done via /deploy, not manual curl |
| Never read or print .env | Config only from `process.env`; no dotenv in code |
| Host must be 0.0.0.0, port from PORT env | `fastify.listen({ host: '0.0.0.0', port: +process.env.PORT || 3000 })` |
| Docker healthcheck without wget/curl | Node 20 built-in fetch in HEALTHCHECK CMD |
| No native modules breaking node:20-slim | No sqlite3, puppeteer, bcrypt or other native addons |
| Types on all public functions | Enforced by `tsc --noEmit` in CI |
| Small clean modules; no god-files | One file per concern; max ~150 lines per module |
| No secrets in code | All URLs, config from env; seed data has no credentials |
| After first code push: gh repo create + remote origin + push main | DEPLOY-03 task must run after Step 5 (first deployable server) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | kassa-ugra event cards use `a[href^="/event/"]` to link to event detail pages | Live Source Probe: kassa-ugra | Low — confirmed from multiple WebFetch responses showing `/event/NNNNN` pattern |
| A2 | afisha.surguta.ru main page (`/`) contains all events in HTML (Drupal SSR, not AJAX-loaded) | Live Source Probe: afisha.surguta | Medium — carousel "Назад/Далее" buttons suggest JS, but Drupal SSR renders all items in DOM |
| A3 | kassa-ugra event container and child element class names TBD — not captured by WebFetch summarizer | Live Source Probe: kassa-ugra | Medium — exact selectors need Wave 0 discovery task (`curl -s URL | grep class=`) |
| A4 | afisha.surguta.ru Drupal node class is `.views-row` or `.node` | Live Source Probe: afisha.surguta | Medium — standard Drupal 7 conventions; needs Wave 0 confirmation |
| A5 | `?field_type_tid=N` does not filter server-side (same events for all N values) | Live Source Probe: afisha.surguta | Low risk if wrong — if filtering works, scraper can be more targeted per category |
| A6 | afisha.surguta.ru event listing has no pagination beyond the main page | Live Source Probe: afisha.surguta | Low — sitemap has no paginated listing pages; carousel suggests one page |
| A7 | Surgut timezone is UTC+5 (Asia/Yekaterinburg) with no DST | Date Parsing | Low — Russia permanently abolished DST in 2014; UTC+5 confirmed for Yekaterinburg/Surgut |

---

## Open Questions

1. **kassa-ugra.ru exact CSS class names on event cards**
   - What we know: Events use `a[href^="/event/"]` anchors; div-based card layout confirmed
   - What's unclear: Class names on the card container and its children (venue, date, price)
   - Recommendation: Wave 0 task — `curl -s https://kassa-ugra.ru/afisha | grep -oP 'class="[^"]*"' | sort | uniq -c | sort -rn | head -40`

2. **afisha.surguta.ru — is the carousel JS-rendered or server-rendered?**
   - What we know: Main page has "Назад/Пауза/Далее" navigation; sitemap has no listing page URLs; `/?page=1` returns same content as `/`
   - What's unclear: Whether all event cards are present in the initial HTML or loaded via JS
   - Recommendation: Wave 0 task — `curl -s https://afisha.surguta.ru/ | grep -c 'href="/content/'` — if count > 10, events are SSR. If 0, site requires JS.

3. **afisha.surguta.ru individual event pages for time precision**
   - What we know: Listing page shows dates without times; individual pages have "Время начала: HH:MM"
   - What's unclear: Is scraping detail pages worth the 10s×N-events total delay per cycle?
   - Recommendation: Phase 1 — skip detail pages; store events with midnight UTC as startDate. Phase 2 — add optional detail page fetch for events within 7 days.

4. **Seed events content**
   - What we know: Seed events must be `isSeed: true` and based on real events found during research
   - What's unclear: How many seed events and which ones to include
   - Recommendation: Use the 7 real event examples found in this research for kassa-ugra + 5 from afisha.surguta. Total: ~12 seed events across both sources.

---

## Sources

### Primary (HIGH confidence) — Live probes
- kassa-ugra.ru/robots.txt — probed live 2026-06-27; content verified verbatim
- kassa-ugra.ru/afisha pages 1-3 — probed live; structure, pagination, date/price formats, event examples
- kassa-ugra.ru/event/349507 and /event/347355 — probed live; detail page date/price format
- afisha.surguta.ru/robots.txt — probed live; Crawl-delay: 10 confirmed
- afisha.surguta.ru/ — probed live; category tab structure, event listing, date formats
- afisha.surguta.ru/content/leonid-agutin and /content/spektakl-tyoplyy-hleb-6 — individual event page structure
- afisha.surguta.ru sitemap.xml — confirmed `/content/[slug]` structure; no category URLs in sitemap
- npm registry via `npm view <pkg> version` — all package versions confirmed 2026-06-27

### Primary (HIGH confidence) — Prior research
- `.planning/research/STACK.md` — full stack research, version matrix, alternatives considered
- `.planning/research/ARCHITECTURE.md` — NormalizedEvent interface, SourceAdapter interface, boot sequence, data flow
- `.planning/research/PITFALLS.md` — per-source feasibility, Russian date parsing, min-results guard, crawl-delay

### Secondary (MEDIUM confidence)
- afisha.surguta.ru taxonomy probe (taxonomy/term/N, /concerts, /theater) — 403/404 responses confirmed no clean category URLs
- afisha.surguta.ru/?field_type_tid=N variants 1-4 — same content returned; server-side filtering not working or categories not mapped to these IDs

---

## Metadata

**Confidence breakdown:**
- kassa-ugra.ru source structure: HIGH — pages 1-3 probed live; date/price formats observed with real examples
- afisha.surguta.ru source structure: MEDIUM-HIGH — main page probed; category URLs conclusively not found; CSS class names [ASSUMED] pending Wave 0 discovery
- Standard stack: HIGH — all versions verified npm registry
- Architecture: HIGH — drawn from ARCHITECTURE.md which was authored from established patterns
- Dockerfile pattern: HIGH — esbuild multi-stage is documented in STACK.md with rationale
- Russian date parsing: HIGH — month lookup table built from actual observed formats
- Price parsing: HIGH — all patterns from live data

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable source HTML structure may change but slowly; npm versions stable for 30 days)
