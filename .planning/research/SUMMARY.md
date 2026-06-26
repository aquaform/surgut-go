# Project Research Summary

**Project:** surgut-go — «Куда пойти в Сургуте»
**Domain:** Multi-source city-events aggregator with mood-based entry, server-rendered mobile-first web app
**Researched:** 2026-06-26
**Confidence:** HIGH (stack, architecture, source feasibility verified live); MEDIUM (mood UX patterns, ranking heuristics)

---

## Executive Summary

surgut-go is a mood-driven city-guide aggregator for Surgut: users tap one of four mood buttons (drink / dance / learn / music) and receive ranked, honest event cards aggregated from local and national afisha sources. The technical approach is a single Node.js 20 + TypeScript + Fastify container that scrapes public HTML sources on a background schedule, caches results to a JSON file on disk, and serves every request from an in-memory index with zero per-request scraping. Server-rendered HTML (no SPA framework) keeps the deploy contract to `node server.js` in `node:20-slim`, which satisfies Dokploy constraints exactly.

The recommended build order is infrastructure-first, then data, then UI. The scraper pipeline (fetch → parse → normalize → dedup → cache) is the single root dependency of every feature: mood buttons, date filters, dedup, and source status all require normalized events in cache before they can function. Two GREEN sources — kassa-ugra.ru/afisha (cleanest HTML, no crawl delay) and afisha.surguta.ru (Drupal SSR, mandatory 10 s crawl delay) — provide sufficient events for a working MVP without touching YELLOW or RED sources.

The dominant risks are not architectural but operational: silent stale-cache serving, Russian date parsing failures, brittle CSS selectors overwriting good cache with empty arrays, and crawl-politeness violations triggering IP blocks. Every one of these must be addressed at the HTTP fetch / shared-utilities layer in Phase 1, before any individual source parser is written. The sources afisha.yandex.ru (Yandex ToS §3.1 risk) and tbank.ru (client-rendered, requires headless browser) are explicitly out of MVP scope. tbank.ru is RED and must not be implemented under the current node:20-slim single-container constraint.

---

## Key Findings

### Recommended Stack

The stack is fully locked and version-verified. Node.js 20 built-in `fetch` (undici-backed) handles all HTTP with native gzip and `AbortSignal.timeout()` — no additional HTTP client needed. `cheerio` v1.2.0 is the HTML parser of choice (30M weekly downloads, first-party TS types); raw parse speed is irrelevant because parsing happens once per TTL refresh, not per request. Production build uses esbuild to produce a single bundled `server.js`, eliminating the need for `node_modules/` in the runner stage and satisfying the `node server.js` entrypoint contract exactly. Development uses `tsx watch`. Testing is vitest v4.1.9 with HTML fixture files per source (snapshot a real response once, run parser tests against it forever).

**Core technologies:**
- **Node.js 20 + TypeScript 5.x**: Runtime and language — built-in `fetch`, `AbortSignal.timeout`, LTS lifecycle
- **Fastify 5.8.5**: HTTP framework — schema-first, fast, first-class TS, built-in Ajv validation on API routes
- **cheerio 1.2.0**: HTML parsing — jQuery-familiar API, first-party types, handles JSON-LD and `__NEXT_DATA__` extraction
- **p-retry 8.0.0**: Exponential back-off retries — ESM-only, bundles cleanly via esbuild `--format=cjs`
- **robots-parser 3.0.1**: Robots.txt compliance — mandatory check before each source is scraped
- **node-cron 4.5.0**: In-process scheduling — calendar-aligned refresh intervals
- **esbuild 0.28.1** (dev): Production bundler — tree-shakes, inlines node_modules, outputs single `server.js`
- **vitest 4.1.9** (dev): Testing — HTML fixture pattern per source, 80% line coverage threshold

**What NOT to use:** puppeteer/playwright (breaks node:20-slim), sqlite3/better-sqlite3 (native C++ addons), jsdom (25 MB, wrong tool), ts-node in production, axios, node-fetch.

### Expected Features

The scraper pipeline is the root dependency of everything. Build it first.

**Must have — table stakes:**
- 4 large mood buttons as the primary landing-page entry point
- Event cards: title, humanized Russian date/time, venue, price, CTA ("Открыть" / "Купить билет"), source attribution badge
- Date quick-filters: Сегодня / Завтра / Выходные / 7 дней (horizontal chip row, no date picker, server-side)
- Source status per card: green (live) / yellow (cached) / red (blocked) / orange (demo)
- Honest demo/seed fallback labeled "Демо-данные" — never mixed unlabeled with live
- `/health`, `/api/events`, `/api/recommendations?mood=`, `/api/sources/status` endpoints

**Should have — competitive differentiators:**
- "Почему рекомендовано" badge derived at query time from mood→tag intersection (e.g., "Стендап · Open mic")
- Tonight-first ranking: today ≥17:00 → today <17:00 → tomorrow → next 7 days ascending
- Deduplication by composite fingerprint (normalizedTitle + startDate day + venueSlug)
- Free/paid toggle filter (`isFree: boolean` extracted at ingest time, not at filter time)
- Known Surgut venue normalization via static lookup table (O(1) at ingest)
- Persistent JSON cache surviving container restarts (configurable via `CACHE_DIR` env var)

**Defer to v1.x (add after validation):**
- Text keyword search
- Category tabs/filter
- Additional YELLOW scrapers (afisha.ru, kassir.ru, yandex afisha)

**Defer to v2+ (explicit scope boundaries):**
- User accounts / favorites / personalization
- Map view / geolocation
- In-app ticket purchase / payments
- ML/collaborative filtering recommendations

### Architecture Approach

The architecture enforces strict separation: sources → pipeline → cache → in-memory index → HTTP routes. Routes never call the pipeline; the pipeline never touches routes. Fastify starts within ~100ms of container launch (seed/cached data loaded before any network call). All scraping runs in a background loop so Dokploy healthchecks never fail during scrape windows.

**Major components:**
1. **`src/sources/<name>/`** — One directory per source implementing `SourceAdapter` interface. Adding/removing a source is one directory + one registry.ts edit.
2. **`src/sources/seed/`** — Static fallback events (all `isSeed: true`), structurally identical to live adapters.
3. **`src/pipeline/`** — `run.ts` (parallel scrape via `Promise.allSettled`, per-source timeout + error isolation), `dedup.ts` (SHA1 composite key), `index-events.ts` (in-memory lookup maps).
4. **`src/cache/store.ts` + `cache/refresh.ts`** — File I/O isolated here; failure keeps last known-good events in index.
5. **`src/recommend/`** — Pure functions with no I/O: `mood-map.ts` (static `MOOD_MAPPINGS` constant), `recommend.ts` (filter + rank logic, fully unit-testable).
6. **`src/http/routes/`** — Fastify plugins per endpoint group, read from `EventIndex` only.
7. **`src/web/views/`** — Server-rendered HTML via typed template literal functions (`(data) => string`), zero dependencies.
8. **`server.ts` entrypoint** — load seed/cache → build index → `fastify.listen({ host: '0.0.0.0' })` → background refresh.

### Critical Pitfalls

**Source feasibility — load-bearing for roadmap:**

| Tier | Sources | Action |
|------|---------|--------|
| GREEN — start here | kassa-ugra.ru/afisha, afisha.surguta.ru | Phase 1 — plain SSR HTML, no JS required |
| YELLOW — add with guards | afisha.ru/surgut, sur.kassir.ru (AJAX), afisha.yandex.ru (ToS risk, off by default) | Phase 2+ only |
| RED — never implement in this stack | tbank.ru/gorod/afisha/surgut | Client-rendered skeleton, requires headless browser, violates node:20-slim |

**tbank.ru is RED and must not be attempted.** The page is a CSR skeleton with zero event data in static HTML. No public Afisha API exists in T-Bank's developer portal. Headless browser is the only option and violates the node:20-slim single-container constraint.

**afisha.yandex.ru must be `enabled: false` by default.** Yandex ToS §3.1 explicitly authorizes Yandex to block automated access unilaterally. Never include in the "2 sources must be live" resilience guarantee.

1. **Silently serving stale cache as live** — Every cached response must carry `fetchedAt` and `sourceStatus`. Build this in Phase 1 before first live source; retrofitting requires a full redeploy.
2. **Russian date parsing failures** — `new Date("27 июн 23:00")` returns `Invalid Date`. Build `parseRussianDate()` utility with unit tests covering all 4 observed formats plus relative labels (сегодня/завтра) before any parser. All dates in `Asia/Yekaterinburg` (UTC+5).
3. **Brittle CSS selectors overwriting good cache** — HTTP 200 + fewer than 2 events = `parseError`, not an empty-array cache overwrite. Selectors in per-source config objects, not hardcoded in loops.
4. **Crawl politeness violations** — afisha.surguta.ru robots.txt mandates `Crawl-delay: 10`. All other sources: 2 s minimum per-domain. Never `Promise.all` all sources simultaneously. IP block = total data loss from that source.
5. **Price text normalization** — `isFree: boolean` must be extracted at parse time. The free-events filter breaks if "бесплатно" is not normalized to a boolean at ingest.

---

## Implications for Roadmap

Based on combined research, the natural phase structure follows the dependency chain: infrastructure → data pipeline → core UI → breadth expansion.

### Phase 1: Foundation and Data Pipeline

**Rationale:** The scraper pipeline is the root dependency of every feature. Shared utilities (date parsing, price parsing, fetch layer with crawl delay, charset detection) must exist before any source adapter to avoid per-parser rework. The deploy contract (`/health`, `0.0.0.0:3000`) must work from day one. All Phase 1 pitfalls must be addressed here before any live source is connected.

**Delivers:**
- Deployable container (`/health` returns 200) at phase milestone — satisfies Dokploy contract
- Scraper pipeline for both GREEN sources: kassa-ugra.ru + afisha.surguta.ru
- Shared utilities: `parseRussianDate()`, `parseRussianPrice()`, per-domain crawl-delay queue, charset detection
- JSON file cache with TTL, `sourceStatus` per source, `fetchedAt` timestamps
- `/api/events` and `/api/sources/status` returning real data
- Seed fallback adapter (all events `isSeed: true`, labeled "Демо-данные")
- All Phase 1 pitfall guards: minimum-results assertion, robots.txt check, empty-array-overwrite prevention

**Addresses:** Scraper pipeline, cache persistence, `/health`, `/api/events`, `/api/sources/status`, demo seed

**Avoids:** Pitfalls 1 (stale cache), 2 (date parsing), 3 (selector fragility), 5 (price normalization), 6 (crawl rate), 7 (encoding), 10 (afisha.surguta.ru category URL mapping — discovery task at phase start)

**Build order within phase (ARCHITECTURE.md Steps 1–9):**
types → config → seed adapter → cache store → health + Fastify boot → pipeline/dedup/refresh → event index → API routes → kassa-ugra adapter → afisha-surguta adapter

**Research flag:** No additional phase research needed — patterns fully specified in STACK.md and ARCHITECTURE.md.

---

### Phase 2: Core Product UI and Mood Recommendations

**Rationale:** With real events in cache and all API endpoints working, this phase delivers the user-facing core value: mood buttons + ranked event cards. This is the "vertical MVP slice" milestone. Deduplication and cross-source ranking belong here because multi-source behavior requires both GREEN sources live simultaneously to observe real merge rates.

**Delivers:**
- Server-rendered main page with 4 mood buttons
- Event cards: humanized Russian date, venue, price, CTA, source badge, "почему рекомендовано" badge
- `/api/recommendations?mood=` with `MOOD_MAP`, tonight-first ranking (today ≥17:00 → today <17:00 → tomorrow → 7 days)
- Date quick-filters chip row (Сегодня / Завтра / Выходные / 7 дней), server-side, `Asia/Yekaterinburg`
- Free/paid toggle filter
- Cross-source deduplication by composite key (normTitle + date-day + venueSlug)
- Source status panel in UI (colored dots + "данные от [timestamp]")
- Mobile-first CSS layout, no JS framework

**Addresses:** All P1 features from FEATURES.md prioritization matrix; core value proposition validated and deployed to surgut-go.apps.sielom.ru

**Avoids:** Anti-pattern of blocking HTTP start on scraping (resolved in Phase 1); dedup false positives (composite key, not title-only)

**Research flag:** No additional research needed — mood-map, ranking algorithm, dedup key, and date filter logic fully specified.

---

### Phase 3: Source Breadth and Polish

**Rationale:** Once the core product is deployed with GREEN sources and the mood experience is validated, add YELLOW sources to increase event coverage. Each YELLOW source carries a documented complication; add individually with guards.

**Delivers:**
- afisha.ru/surgut adapter (YELLOW — selector fragility risk; re-probe HTML structure at implementation time)
- sur.kassir.ru adapter (YELLOW — AJAX complication; use date-filtered URLs or DevTools AJAX endpoint discovery)
- afisha.yandex.ru adapter (YELLOW — `enabled: false` by default, `tosRisk: true`, `volatility: "high"` documented in config)
- Category filter / tabs
- Text keyword search
- UI polish: image placeholders, age limits, address display

**Addresses:** v1.x backlog; P2 features from FEATURES.md prioritization matrix

**Avoids:** Pitfall 8 (kassir.ru AJAX — never Playwright); Pitfall 9 (Yandex ToS — off by default, trivially disabled on block)

**Research flag:** sur.kassir.ru AJAX endpoint unknown — 1–2 hour DevTools investigation required at phase start. afisha.ru HTML structure needs fresh live probe at implementation time.

---

### Phase Ordering Rationale

- **Infrastructure before parsers**: Shared utilities must exist before any parser to prevent per-parser reinvention and dedup breakage caused by inconsistent date representations.
- **GREEN sources before YELLOW**: kassa-ugra and afisha.surguta.ru are confirmed SSR HTML. Real data without AJAX complications, ToS risks, or selector fragility.
- **API before UI**: `/api/events` and `/api/recommendations` are built and tested independently before HTML views. No duplication, easy to test in isolation.
- **Core product before breadth**: Deploy with 2 GREEN sources + mood UX to validate the core hypothesis before investing in YELLOW adapters.
- **tbank.ru never**: RED from research; documented as deferred; no implementation, no rollback needed.

### Research Flags

**Phases with well-documented patterns (no `--research-phase` needed):**
- **Phase 1**: Full step-by-step dependency build order in ARCHITECTURE.md Steps 1–9. All shared utilities specified with concrete code patterns.
- **Phase 2**: Mood-map constant, tonight-first ranking algorithm, composite dedup key, and date filter logic fully specified in FEATURES.md and ARCHITECTURE.md.

**Phases needing targeted discovery during planning:**
- **Phase 3 — sur.kassir.ru**: AJAX endpoint unknown. 1–2 hour DevTools investigation required before adapter implementation. Fallback: date-filtered URL iteration.
- **Phase 3 — afisha.ru**: Large commercial site, documented redesign history. Re-probe HTML structure at Phase 3 planning time; selectors from research date may be stale.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry 2026-06-26; esbuild multi-stage Dockerfile confirmed; vitest fixture pattern well-established |
| Features | HIGH (table stakes, algorithm), MEDIUM (UX heuristics) | Table stakes and dedup algorithm high-confidence; mood ranking heuristics (tonight-first, 17:00 cutoff) reasonable but untested with real users |
| Architecture | HIGH | Adapter + serve-stale-on-failure + in-memory index patterns well-established; aligns exactly with project constraints |
| Pitfalls | HIGH (source verdicts), MEDIUM (ToS/legal) | All 6 sources probed live 2026-06-26; Russian date/price format tables observed directly; Yandex ToS risk confirmed from live ToS text |

**Overall confidence: HIGH**

### Gaps to Address During Implementation

- **afisha.surguta.ru category URL mapping**: Drupal taxonomy `href` values were not captured in research. Requires `curl -s https://afisha.surguta.ru/ | grep -o 'href="[^"]*"'` before Phase 1 parser. Estimated 30-minute discovery task.
- **kassa-ugra.ru image CDN stability**: Images from `tickets.s3.yandex.net`; external CDN may change. Cache `imageUrl` per event but do not treat as permanent.
- **Real-world dedup accuracy**: Composite fingerprint accuracy measurable only once both GREEN sources produce events simultaneously. Reserve parameter tuning for Phase 2 after observing real merge rates.
- **sur.kassir.ru AJAX endpoint**: Unknown at research time. DevTools discovery required at Phase 3 start.

---

## Sources

### Primary (HIGH confidence — verified live or via official docs)
- afisha.surguta.ru, kassa-ugra.ru, afisha.ru, afisha.yandex.ru, sur.kassir.ru, tbank.ru — all probed live 2026-06-26 (robots.txt, page structure, data availability)
- Yandex General User Agreement §3.1 — fetched live; automated access prohibition confirmed
- npm registry — all package versions via `npm show <pkg> version` on 2026-06-26
- cheerio official docs (Context7) — load API, TS import syntax confirmed
- esbuild docs — `--bundle --platform=node --format=cjs --external` flags confirmed
- Fastify TypeScript plugin docs — fastify.dev/docs/latest/Reference/TypeScript/
- vitest docs — coverage threshold config, fixture test pattern

### Secondary (MEDIUM confidence — community sources)
- ScrapeOps: Best NodeJS HTML Parsing Libraries — cheerio vs alternatives comparison
- npmtrends: cheerio vs jsdom vs linkedom — download volume comparison
- pkgpulse: got vs undici vs node-fetch — HTTP client comparison 2026
- WebScraping.AI: JSON-LD extraction with Cheerio — JSON-LD and `__NEXT_DATA__` patterns
- Grepsr: Data Deduplication and Normalization in Web Pipelines — fingerprint dedup rationale
- Groupbwt: Events Data Scraping Architecture Guide — adapter pattern for event aggregators
- Tacnode: Stale Data, Freshness SLAs — serve-stale-on-failure pattern rationale
- arxiv: Explainability in Music Recommender Systems — "Because you…" trust pattern research

---

*Research completed: 2026-06-26*
*Ready for roadmap: yes*
