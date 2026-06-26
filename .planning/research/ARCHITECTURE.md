# Architecture Research

**Domain:** Multi-source event aggregator, single-container Node.js web app
**Researched:** 2026-06-26
**Confidence:** HIGH — patterns are well-established for this class of system; container/cache notes verified against project Dockerfile and Dokploy constraints from PROJECT.md

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     HTTP Layer (Fastify)                         │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │GET /api/    │  │GET /api/          │  │GET /api/sources/   │ │
│  │events       │  │recommendations    │  │status              │ │
│  │?date=&cat=  │  │?mood=drink|dance  │  │                    │ │
│  └──────┬──────┘  └────────┬─────────┘  └────────┬───────────┘ │
│         │                  │                      │             │
│  ┌──────┴──────────────────┴──────────────────────┴──────────┐  │
│  │              Web Views (server-rendered HTML)              │  │
│  │  routes/web.ts → views/*.html.ts → response string        │  │
│  └────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     Domain Services                              │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  recommend/          │  │  pipeline/index-events.ts        │ │
│  │  getRecommendations  │  │  (in-memory indexes:             │ │
│  │  (mood, events)      │  │   by category, date, mood)       │ │
│  └──────────────────────┘  └──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                     Pipeline                                     │
│                                                                  │
│   sources → fetch → parse → normalize → dedup → index           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  pipeline/run.ts: parallel scrape with per-source        │   │
│  │  timeout, error isolation, status tracking               │   │
│  └──────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                     Cache (JSON file + TTL)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  /app/cache/events.json                                  │   │
│  │  { version, savedAt, sources: SourceCacheEntry[],        │   │
│  │    events: NormalizedEvent[] }                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│  cache/store.ts (read/write) + cache/refresh.ts (background)    │
├─────────────────────────────────────────────────────────────────┤
│                     Sources                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ afisha-     │  │ kassa-ugra/ │  │ seed/       │             │
│  │ surguta/    │  │ index.ts    │  │ index.ts    │             │
│  │ index.ts    │  │             │  │ (fallback)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│           ↑ all implement SourceAdapter interface ↑              │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `sources/<name>/` | Fetch one source + parse HTML/JSON → NormalizedEvent[] | Per-source adapter module, isolated |
| `sources/seed/` | Static fallback events, always returns synchronously | JSON data file, isSeed: true |
| `sources/registry.ts` | Ordered list of active SourceAdapter instances | Array exported, pipeline iterates it |
| `pipeline/run.ts` | Parallel scrape with per-source error isolation | Promise.allSettled, timeout wrapping |
| `pipeline/dedup.ts` | Remove duplicate events from different sources | Hash on (title-slug + date-day + venue-slug) |
| `pipeline/index-events.ts` | Build in-memory lookup indexes | Map<category>, date-bucket arrays |
| `cache/store.ts` | Read/write events.json, TTL staleness check | fs.readFile/writeFile + JSON |
| `cache/refresh.ts` | Background refresh loop, serve-stale-on-failure | setInterval, fire-and-forget |
| `recommend/mood-map.ts` | Static MOOD_MAPPINGS constant | Plain object, no logic |
| `recommend/recommend.ts` | Filter+rank events for a mood | Pure function, testable |
| `http/routes/` | Fastify route plugins (one file per endpoint group) | Fastify plugin pattern |
| `web/views/` | Server-rendered HTML template functions | (data) => string, no framework |
| `web/static/` | CSS + minimal client JS | No bundler, served as-is |

---

## Recommended Project Structure

```
src/
├── types/
│   └── events.ts           # NormalizedEvent, SourceStatus, Mood, EventCategory
├── sources/
│   ├── base.ts             # SourceAdapter interface
│   ├── registry.ts         # ordered array of active adapters
│   ├── afisha-surguta/
│   │   └── index.ts        # scrape() → NormalizedEvent[]
│   ├── kassa-ugra/
│   │   └── index.ts
│   ├── afisha-ru/
│   │   └── index.ts
│   └── seed/
│       ├── index.ts        # SeedAdapter implements SourceAdapter
│       └── events.json     # verified real event examples, isSeed: true
├── pipeline/
│   ├── run.ts              # parallel scrape, wraps each adapter in try/catch
│   ├── dedup.ts            # deterministic hash deduplication
│   └── index-events.ts     # build in-memory EventIndex from flat array
├── cache/
│   ├── store.ts            # CacheStore: load(), save(), isStale()
│   └── refresh.ts          # startRefreshLoop(store, registry): void
├── recommend/
│   ├── mood-map.ts         # MOOD_MAPPINGS: Record<Mood, MoodMapping>
│   └── recommend.ts        # getRecommendations(mood, index) → RankedEvent[]
├── http/
│   ├── routes/
│   │   ├── health.ts       # GET /health
│   │   ├── events.ts       # GET /api/events
│   │   ├── recommendations.ts  # GET /api/recommendations?mood=
│   │   ├── sources.ts      # GET /api/sources/status
│   │   └── web.ts          # GET / (main page, server-rendered)
│   └── server.ts           # createServer(): FastifyInstance
└── config.ts               # typed env config (PORT, CACHE_DIR, CACHE_TTL_MS)
server.ts                   # entrypoint: boot sequence (seed → Fastify → background refresh)
```

### Structure Rationale

- **`types/`:** Single source of truth for domain types. All other modules import from here, never define their own event shapes.
- **`sources/<name>/`:** One directory per source. Changing or deleting a source is one directory removal + one registry.ts edit. No cross-source coupling.
- **`sources/seed/`:** The seed adapter is structurally identical to live adapters. It just returns static data synchronously. This makes the pipeline treat it uniformly.
- **`pipeline/`:** Three pure transformation stages. Each is independently testable. `run.ts` is the only place that touches `sources/`.
- **`cache/`:** File I/O isolated here. Everything else is pure or in-memory. `store.ts` has no knowledge of sources or pipeline.
- **`recommend/`:** Pure functions with no I/O. `mood-map.ts` is data, `recommend.ts` is logic. Easy to unit-test and iterate without touching the HTTP layer.
- **`http/routes/`:** Each route file is a Fastify plugin. Routes read from `CacheStore`/`EventIndex` — they never invoke the pipeline or call sources directly.

---

## Architectural Patterns

### Pattern 1: Source Adapter Interface

**What:** A common TypeScript interface that every source must satisfy. The pipeline only knows the interface, never the concrete implementation.

**When to use:** Whenever you have multiple external sources that return the same logical data in different formats.

**Trade-offs:** Slightly more boilerplate per source, but makes adding/removing sources safe and makes each adapter independently testable.

**Interface sketch:**

```typescript
// src/types/events.ts
export type SourceStatus = 'live' | 'cached' | 'blocked' | 'error' | 'seed';
export type EventCategory =
  | 'concert' | 'club' | 'theater' | 'exhibition'
  | 'lecture' | 'sport' | 'standup' | 'other';
export type Mood = 'drink' | 'dance' | 'learn' | 'music';

export interface NormalizedEvent {
  id: string;           // sha1(sourceName + sourceUrl + startDate.toISOString().slice(0,10))
  title: string;
  startDate: Date;
  endDate?: Date;
  venue: string;
  address?: string;
  priceText: string;    // "Бесплатно" | "от 500 ₽" | "Цена не указана"
  sourceName: string;
  sourceUrl: string;
  category: EventCategory;
  tags: string[];
  ageLimit?: string;
  imageUrl?: string;
  fetchedAt: Date;
  isSeed: boolean;      // true → never claim this is live
}

export interface SourceResult {
  name: string;
  displayName: string;
  homeUrl: string;
  status: SourceStatus;
  eventCount: number;
  fetchedAt: Date | null;
  error?: string;
}

// src/sources/base.ts
export interface SourceAdapter {
  readonly name: string;        // machine id: 'afisha-surguta'
  readonly displayName: string; // Russian: 'Афиша Сургута'
  readonly homeUrl: string;
  readonly timeoutMs: number;   // default 10_000
  scrape(): Promise<NormalizedEvent[]>;  // fetch + parse; throws on failure
}
```

**Per-source implementation contract:** `scrape()` either returns a non-empty array of normalized events or throws. It never returns partially-constructed events or mixed-quality data. Normalization (date parsing, price normalization, category mapping) happens inside `scrape()`.

### Pattern 2: Background Refresh with Serve-Stale-on-Failure

**What:** On startup, load the seed adapter immediately, start Fastify, then trigger a background scrape. Subsequent refreshes run on a timer. On any scrape failure, log the error, update the source status to `'error'` or `'cached'`, but keep serving the last known-good events.

**When to use:** Always, in any aggregator. Never block the HTTP server on external scrapes.

**Trade-offs:** Users may see stale data during source failures. This is the honest, correct behavior — acknowledged in the UI via source status indicators.

**Boot sequence:**

```typescript
// server.ts
async function main() {
  // 1. Load seed data synchronously — app is immediately useful
  const store = new CacheStore(config.cacheDir);
  await store.loadOrSeed(seedAdapter);

  // 2. Build in-memory index from whatever we have
  const index = buildEventIndex(store.getEvents());

  // 3. Start HTTP server — now serving seed/cached data
  const fastify = createServer({ store, index });
  await fastify.listen({ port: config.port, host: '0.0.0.0' });

  // 4. Start background refresh loop (fire-and-forget)
  startRefreshLoop({ store, index, registry: allAdapters, config });
}
```

**Refresh loop behavior:**

```typescript
// cache/refresh.ts
export function startRefreshLoop({ store, index, registry, config }) {
  const runRefresh = async () => {
    const results = await runPipeline(registry);   // pipeline/run.ts
    const deduped = dedup(results.events);
    store.save({ events: deduped, sources: results.sources });
    index.rebuild(deduped);  // atomic swap of in-memory indexes
  };

  runRefresh().catch(err => logger.warn('Initial refresh failed', err));
  setInterval(() => {
    runRefresh().catch(err => logger.warn('Refresh failed', err));
  }, config.cacheTtlMs);
}
```

### Pattern 3: Deduplication by Deterministic Hash

**What:** When multiple sources carry the same event (a concert may appear on afisha.ru AND kassa-ugra), dedup by hashing the normalized title slug + date (day only) + venue slug.

**When to use:** Any multi-source aggregator. Without this, users see duplicates.

**Trade-offs:** The hash is fuzzy (title normalization affects accuracy). False-negative dedup (missing a duplicate because of different title spellings) is safer than false-positive (merging different events).

**Implementation sketch:**

```typescript
// pipeline/dedup.ts
import { createHash } from 'node:crypto';

function eventKey(e: NormalizedEvent): string {
  const titleSlug = e.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const dateDay = e.startDate.toISOString().slice(0, 10);
  const venueSlug = e.venue.toLowerCase().replace(/\s+/g, '').slice(0, 20);
  return createHash('sha1')
    .update(`${titleSlug}|${dateDay}|${venueSlug}`)
    .digest('hex')
    .slice(0, 12);
}

export function dedup(events: NormalizedEvent[]): NormalizedEvent[] {
  const seen = new Map<string, NormalizedEvent>();
  for (const e of events) {
    const key = eventKey(e);
    const existing = seen.get(key);
    if (!existing || (e.isSeed === false && existing.isSeed === true)) {
      seen.set(key, e);  // prefer live over seed
    }
  }
  return Array.from(seen.values());
}
```

### Pattern 4: Mood Recommendation as Pure Function

**What:** The recommendation layer is a pure mapping function: `getRecommendations(mood, eventIndex) → NormalizedEvent[]`. The mapping (mood → categories/tags/venues) lives in a separate data constant. Ranking is: nearest-first, with a boost for tonight (today after 17:00 local time).

**When to use:** Keep the mood logic out of the pipeline and out of the HTTP layer. It is the core product logic and must be independently testable.

**Mood mapping data:**

```typescript
// recommend/mood-map.ts
export interface MoodMapping {
  categories: EventCategory[];
  tagKeywords: string[];          // substring match against event.tags
  venueKeywords: string[];        // substring match against event.venue (case-insensitive)
  label: string;
  emoji: string;
}

export const MOOD_MAPPINGS: Record<Mood, MoodMapping> = {
  drink: {
    categories: ['club', 'standup', 'other'],
    tagKeywords: ['бар', 'стендап', 'вечеринка', 'open mic', 'коктейль'],
    venueKeywords: ['Компромат', 'Brooklyn', 'Forte', 'Карасёвня', 'Piano'],
    label: 'Хочу выпить',
    emoji: '🍸',
  },
  dance: {
    categories: ['club'],
    tagKeywords: ['вечеринка', 'дискотека', 'хип-хоп', 'электроника', 'dancehall'],
    venueKeywords: ['Вавилон', 'Utopia', 'аквапарк', 'club'],
    label: 'Хочу потанцевать',
    emoji: '💃',
  },
  learn: {
    categories: ['lecture', 'exhibition', 'theater'],
    tagKeywords: ['лекция', 'квиз', 'выставка', 'музей', 'образование', 'история'],
    venueKeywords: ['музей', 'библиотека', 'парк', 'театр', 'галерея'],
    label: 'Хочу понимать',
    emoji: '🧠',
  },
  music: {
    categories: ['concert'],
    tagKeywords: ['концерт', 'филармония', 'джаз', 'рок', 'оркестр', 'живой звук'],
    venueKeywords: ['филармония', 'CAGMO', 'ДКиД', 'зал'],
    label: 'Хочу музыки',
    emoji: '🎶',
  },
};
```

---

## Data Flow

### Request: User Clicks Mood Button

```
Browser GET /api/recommendations?mood=music
    ↓
http/routes/recommendations.ts (Fastify route plugin)
    ↓ reads from
EventIndex (in-memory, rebuilt by refresh loop)
    ↓ calls
recommend/recommend.ts → getRecommendations('music', index)
    ↓ filters by categories=['concert'], boosts venue keywords
    ↓ sorts by startDate ASC (nearest first, tonight boosted)
    ↓
JSON response: { mood, label, events: NormalizedEvent[], sourcesMeta: SourceResult[] }
```

No I/O in the request path. Everything comes from the in-memory EventIndex.

### Background Refresh Flow

```
setInterval fires (every CACHE_TTL_MS, default 4h)
    ↓
cache/refresh.ts → runPipeline(registry)
    ↓
pipeline/run.ts → Promise.allSettled([
    adapter.scrape(),   // afisha-surguta
    adapter.scrape(),   // kassa-ugra
    ...
])                      // parallel, each with timeout
    ↓ per-source: success → NormalizedEvent[] | failure → SourceResult{ status: 'error' }
    ↓
pipeline/dedup.ts → dedup(allEvents) → unique NormalizedEvent[]
    ↓
pipeline/index-events.ts → buildEventIndex(events)
    ↓
cache/store.ts → save({ events, sources }) → writes /app/cache/events.json
    ↓
EventIndex.rebuild(events) → atomic in-memory swap
```

If every live adapter fails: seed events remain in the index, source statuses reflect 'error'.

### Startup Flow

```
server.ts main()
  1. config = loadConfig()
  2. store = new CacheStore(config.cacheDir)
     → try readFile(events.json)
     → if missing/expired: load seed events → isStale = true
  3. index = buildEventIndex(store.getEvents())   // in-memory, instant
  4. fastify = createServer({ store, index })
  5. fastify.listen({ port, host: '0.0.0.0' })   // HTTP live, serving seed/cached
  6. startRefreshLoop(...)                         // async, fire-and-forget
```

App is HTTP-live within ~100ms of container start, before any network scraping completes.

### Source Status Flow

```
Each pipeline run → SourceResult[]
    { name, status: 'live'|'cached'|'error'|'blocked', fetchedAt, eventCount }
    ↓
Stored in cache/events.json as sources[]
    ↓
GET /api/sources/status → returns sources array
    ↓
Web UI → shows source health indicators to user
```

---

## Cache: Single-Container Ephemeral Reality

The Dockerfile runs in `node:20-slim` with no volume mount by default. `/app/cache/events.json` lives on ephemeral container disk.

**Implications:**
- Cache is lost on every container restart or redeploy
- On startup, the seed adapter provides immediate data; background refresh re-populates within seconds if sources are available
- This is acceptable for a city-events cache with 4h TTL — stale-on-restart for seconds is not a user-facing problem
- `CACHE_DIR` env var allows adding a Dokploy volume mount later (`/app/cache` → persistent volume) without code changes
- `isSeed: true` flag ensures seed data is never presented as live data, even in the restart window

**Cache file location:** `${CACHE_DIR}/events.json` where `CACHE_DIR` defaults to `/app/cache`. Directory is created on startup if absent (`fs.mkdir(dir, { recursive: true })`).

**TTL config:** `CACHE_TTL_MS` env var, default `14400000` (4 hours). On container restart, if the cache file exists and is under TTL age, it is used immediately — no re-scrape needed.

---

## Anti-Patterns

### Anti-Pattern 1: Blocking HTTP Server Start on Scraping

**What people do:** `await runPipeline()` before `fastify.listen()`.
**Why it's wrong:** If any source is slow or down, the container healthcheck fails and Dokploy marks the deployment as unhealthy. Traefik 404s during the entire scrape window.
**Do this instead:** Start Fastify with seed/cached data immediately. Run scraping in the background.

### Anti-Pattern 2: Per-Request Scraping

**What people do:** Call `adapter.scrape()` inside a Fastify route handler.
**Why it's wrong:** HTTP request timeout (~30s) cannot accommodate multiple scrapers. Response time becomes seconds. External source DoS risk.
**Do this instead:** Routes read only from the in-memory EventIndex. Background loop handles scraping.

### Anti-Pattern 3: God-File Aggregator

**What people do:** One `aggregator.ts` that fetches all sources, parses, deduplicates, serves, and caches.
**Why it's wrong:** Impossible to test one source in isolation. A parse error in one source silently corrupts the whole result. Violates the "small clean modules" constraint in AGENTS.md.
**Do this instead:** One file per source adapter. Pipeline, dedup, and cache are separate modules.

### Anti-Pattern 4: Fabricating Live Status

**What people do:** Return seed data with `isSeed: false` to make the app look alive.
**Why it's wrong:** Directly violates the honesty constraint in PROJECT.md. Users may show up for fake events.
**Do this instead:** All seed events have `isSeed: true`. The UI shows a badge ("демо / кэш") and `/api/sources/status` reflects the real situation.

### Anti-Pattern 5: Tight HTTP-to-Pipeline Coupling

**What people do:** Import `runPipeline` inside a Fastify route to force-refresh on a GET request.
**Why it's wrong:** External parties can DoS your scrapers by hammering the endpoint. Pipeline and routes should communicate only through the shared `EventIndex`.
**Do this instead:** Force-refresh only via a POST `/api/admin/refresh` endpoint with a secret token, or only via the background loop.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| afisha.surguta.ru | HTTP GET + Cheerio HTML parse | Check robots.txt; handle 403 → status 'blocked' |
| kassa-ugra.ru | HTTP GET + Cheerio or JSON API if available | Verify ToS before scraping |
| afisha.ru/surgut | HTTP GET + Cheerio (known to be parseable) | May require User-Agent header |
| afisha.yandex.ru | HTTP GET + JSON embedded in HTML (`__YANDEX_DATA__`) | May block scrapers; handle gracefully |
| kassir.ru | HTTP GET + Cheerio | Standard HTML scrape |
| tbank.ru/gorod | HTTP GET + JSON API or HTML | Test stability before investing in adapter |

For all sources: set a realistic `User-Agent` (e.g., `Mozilla/5.0`), respect `Retry-After` headers, and wrap every fetch in `AbortSignal.timeout(adapter.timeoutMs)`.

### Internal Module Boundaries

| Boundary | Communication | Rule |
|----------|---------------|------|
| routes → pipeline | FORBIDDEN | Routes never call the pipeline directly |
| routes → cache/store | Read-only via EventIndex | `store.getEvents()` and `store.getSources()` |
| pipeline → sources | registry.ts array | Pipeline iterates adapters; no adapter-specific knowledge |
| recommend → pipeline | FORBIDDEN | Recommend reads from EventIndex only |
| cache/refresh → pipeline | Direct import | Refresh orchestrates pipeline; this coupling is intentional |
| web/views → http/routes | Function call | Views are functions returning strings; routes call them |

---

## Build Order (Vertical MVP Slice)

Dependencies flow strictly top-down. Build in this order to get a deployable vertical slice as early as step 5.

```
Step 1: src/types/events.ts
        └── NormalizedEvent, SourceAdapter, Mood, SourceStatus
            (zero deps — everything imports from here)

Step 2: src/config.ts
        └── PORT, CACHE_DIR, CACHE_TTL_MS from process.env

Step 3: src/sources/seed/ + src/sources/base.ts + src/sources/registry.ts
        └── Seed adapter returns static verified events immediately
        └── registry.ts exports [seedAdapter] initially

Step 4: src/cache/store.ts
        └── load() / save() / isStale() / getEvents() / getSources()
        └── Creates CACHE_DIR if absent

Step 5: src/http/routes/health.ts + src/http/server.ts + server.ts
        └── DEPLOYABLE: GET /health returns 200 "ok"
        └── GET / returns placeholder HTML
        └── Fastify starts with seed events in memory

Step 6: src/pipeline/run.ts + src/pipeline/dedup.ts + src/cache/refresh.ts
        └── Background refresh loop wired up
        └── Still only seed adapter in registry

Step 7: src/pipeline/index-events.ts
        └── EventIndex: Map<category>, date buckets

Step 8: src/http/routes/events.ts + src/http/routes/sources.ts
        └── GET /api/events (with filters: date, category, search)
        └── GET /api/sources/status

Step 9: src/sources/afisha-surguta/ (first real adapter)
        └── Add to registry.ts
        └── Validate with real HTTP; confirm NormalizedEvent output

Step 10: src/recommend/mood-map.ts + src/recommend/recommend.ts
         └── MOOD_MAPPINGS + getRecommendations()
         └── Unit-test with sample events

Step 11: src/http/routes/recommendations.ts
         └── GET /api/recommendations?mood=
         └── CORE VALUE SLICE: all API endpoints working

Step 12: src/web/views/ + src/http/routes/web.ts + src/web/static/
         └── Server-rendered main page with mood buttons
         └── Event cards with source/staleness badges
         └── Filter controls

Step 13+: Additional source adapters
          └── kassa-ugra → afisha-ru → yandex-afisha → kassir
          └── Each: add adapter, add to registry, test, verify dedup
```

Milestone for "vertical MVP slice" = Steps 1–11 + one live source (Step 9). At that point all API contracts are fulfilled and the app is deployable on Dokploy with real data.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users/day | Current single-container design is correct. No changes needed. |
| 1k–50k users/day | Add response caching headers (`Cache-Control: max-age=300`) on `/api/events`. EventIndex is already in-memory so reads are instant. |
| 50k+ users/day | Extract scraping into a separate worker process. Serve events from Redis instead of JSON file. Out of scope for this project. |

First bottleneck will be source scraping latency (external HTTP), not serving latency (in-memory reads). The architecture already isolates scraping from serving.

---

## Sources

- Fastify TypeScript plugin architecture: https://fastify.dev/docs/latest/Reference/TypeScript/
- Stale-while-revalidate pattern for Node.js: https://dev.to/boehner/http-caching-in-nodejs-apis-etag-cache-control-and-stale-while-revalidate-explained-9ce
- Adapter pattern in TypeScript: https://refactoring.guru/design-patterns/adapter/typescript/example
- Pipeline pattern for data processing: https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn
- Web scraping with TypeScript/Node.js: https://www.thisdot.co/blog/web-scraping-with-typescript-and-node-js

---
*Architecture research for: surgut-go multi-source event aggregator*
*Researched: 2026-06-26*
