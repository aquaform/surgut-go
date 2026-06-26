---
phase: 01-deployable-pipeline-green-sources
plan: 01-6
subsystem: http/routes
tags: [fastify, ajv, events-api, sources-api, schema-validation, utc5, seed-honesty, api-05, src-08]

# Dependency graph
requires:
  - 01-4 (createServer factory, FastifyInstance store/index decorations)
  - 01-3 (CacheStore.getSources, EventIndex.all, NormalizedEvent types)
provides:
  - GET /api/events → { events[], meta: {count, generatedAt} } with Ajv querystring validation (API-02, API-05)
  - GET /api/sources/status → SourceResult[] with human-readable status/error (API-04, SRC-08)
  - Both routes wired into createServer() between health and @fastify/static
affects:
  - DEPLOY (both routes now live in the deployed container)
  - Phase 2 UI (frontend can fetch events with filters and source freshness)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ajv querystring schema with enum + additionalProperties:false → 400 on invalid values (T-01-13)"
    - "Surgut UTC+5 date filtering: surgutDayBoundaryMs() shifts UTC epoch to compute today/tomorrow/week/weekend boundaries"
    - "serializeEvent(): spreads NormalizedEvent then overrides Date fields with .toISOString() before reply.send()"
    - "fast-json-stringify item schema defined per NormalizedEvent field — avoids empty-object serialization pitfall"
    - "nullable: true on fetchedAt in sources response schema — fast-json-stringify v6.4.0 native support"
    - "Module augmentation (declare module 'fastify') in server.ts is globally applied by tsc when all src/ files are in the compilation"
    - "Test pattern: Fastify.decorate('store', mock) + Fastify.decorate('index', mock) + register(plugin) + inject()"

key-files:
  created:
    - src/http/routes/events.ts
    - src/http/routes/events.test.ts
    - src/http/routes/sources.ts
    - src/http/routes/sources.test.ts
  modified:
    - src/http/server.ts (added eventsRoute + sourcesRoute imports and registrations)
    - .gitignore (added .cache-test*/ pattern)

key-decisions:
  - "filterByDate() uses surgutDayBoundaryMs(offset) — computes UTC start-of-day by offsetting Date.now() into local UTC+5 space then shifting back"
  - "date=weekend matches Saturday(6) or Sunday(0) in UTC+5 regardless of past/future — all weekends, not just upcoming"
  - "serializeEvent() enumerates all NormalizedEvent fields explicitly — avoids relying on fast-json-stringify's items:{type:object} with no properties (which serializes {} for every event)"
  - "free=true filter only — free=false does not filter to paid-only (UX: default is 'show all', not 'show paid')"
  - "Inline module augmentation in server.ts is picked up by tsc globally via include:[src] — route files need no import of server.ts"
  - "nullable: true (fast-json-stringify extension) used for fetchedAt in sources schema instead of anyOf:[string,null] — confirmed supported in fjs v6.4.0"

# Metrics
duration: ~25min
completed: 2026-06-27
---

# Phase 01 Plan 6: Read API Endpoints (events + sources/status) Summary

**GET /api/events and GET /api/sources/status — Ajv-validated routes reading from in-memory store/index; date/category/free filters in UTC+5; sources expose honest freshness status; 21 new tests; all 59 tests green**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-27
- **Tasks:** 3
- **Files created/modified:** 6 (4 created, 2 modified)

## Accomplishments

- `GET /api/events` returns `{ events: NormalizedEvent[], meta: { count, generatedAt } }` from the in-memory EventIndex. Querystring schema enforces `date` enum (today|tomorrow|weekend|week), `category` enum (EventCategory), `free` boolean, `additionalProperties: false`. Invalid values like `?date=bogus` return 400 (`FST_ERR_VALIDATION`) with a machine-readable Ajv error body — no crashes (API-05, T-01-13).
- Date filtering computed in UTC+5 (Asia/Yekaterinburg / Surgut): `surgutDayBoundaryMs()` converts current UTC to Surgut local day boundaries. Seed event on Sep 6 2026 (Sunday) correctly appears in `?date=weekend`; Thursday Sep 10 is excluded.
- `isSeed` flag preserved honestly — seed events carry `isSeed: true` in every response (AGG-02). No mislabelling.
- `GET /api/sources/status` returns `SourceResult[]` with `name`, `displayName`, `homeUrl`, `status` (enum), `eventCount`, `fetchedAt` (ISO string or null), `error?` (human-readable only). Stack traces are never exposed — only `err.message` stored in `SourceResult.error` by the pipeline layer (T-01-14).
- Both routes registered in `createServer()` between `healthRoute` and `@fastify/static` — exact-path routes always win over the static wildcard regardless of registration order in Fastify.
- `npm run build` → 1.6 MB CJS bundle; `npm run typecheck` → 0 errors; 59 tests pass.

## Task Commits

1. **Task 1: GET /api/events + test** — `d2aaf85` (feat)
   - `src/http/routes/events.ts`, `src/http/routes/events.test.ts`
2. **Task 2: GET /api/sources/status + test** — `050c25c` (feat)
   - `src/http/routes/sources.ts`, `src/http/routes/sources.test.ts`
3. **Task 3: Register routes in createServer** — `7829566` (feat)
   - `src/http/server.ts`

## Real Verification Output

### vitest full suite (59 tests)

```
 Test Files  6 passed (6)
      Tests  59 passed (59)
   Start at  02:05:08
   Duration  299ms (transform 194ms, setup 0ms, import 365ms, tests 266ms, environment 0ms)
```

### GET /api/events (real server, seed data)

```
PORT=3015 CACHE_DIR=./.cache-test5 node server.js &
curl http://127.0.0.1:3015/api/events

HTTP 200
{
  "events": [
    {
      "id": "1b5e33aa3cec2466a0bbf9aa1fec5c5f07f4bfec",
      "title": "Летние каникулы",
      "startDate": "2026-04-14T19:00:00.000Z",
      "endDate": "2026-09-12T19:00:00.000Z",
      "venue": "Гончарная Школа «Колокол»",
      "priceText": "Цена не указана",
      "isFree": false,
      "sourceName": "seed",
      "sourceUrl": "https://afisha.surguta.ru/content/letnie-kanikuly",
      "category": "exhibition",
      "tags": ["выставка","мастерская"],
      "fetchedAt": "2026-06-26T21:05:52.879Z",
      "isSeed": true
    },
    ... (12 events total)
  ],
  "meta": {
    "count": 12,
    "generatedAt": "2026-06-26T21:05:54.999Z"
  }
}
```

### GET /api/events?date=bogus (400 validation)

```
curl http://127.0.0.1:3015/api/events?date=bogus

HTTP 400
{
  "statusCode": 400,
  "code": "FST_ERR_VALIDATION",
  "error": "Bad Request",
  "message": "querystring/date must be equal to one of the allowed values"
}
```

### GET /api/sources/status

```
curl http://127.0.0.1:3015/api/sources/status

HTTP 200
[
  {
    "name": "seed",
    "displayName": "Демо-данные",
    "homeUrl": "",
    "status": "live",
    "eventCount": 12,
    "fetchedAt": "2026-06-26T21:05:52.879Z"
  }
]
```

Note: `status: "live"` — the background refresh loop fires immediately on boot; the seed adapter runs successfully and is marked `live` by the pipeline. `error` field absent (no error on seed source). ✓

## Files Created/Modified

- `src/http/routes/events.ts` — `FastifyPluginAsync` registering `GET /api/events`; querystring Ajv schema; UTC+5 date filter helpers; `serializeEvent()` converting all Date fields to ISO strings; reads from `fastify.index.all()` only
- `src/http/routes/events.test.ts` — 12 tests: 200/400 status codes, category/free filters, date=weekend day-of-week logic, isSeed honesty, ISO serialization, combined filters
- `src/http/routes/sources.ts` — `FastifyPluginAsync` registering `GET /api/sources/status`; response schema with `nullable: true` on `fetchedAt`; human-readable error only; reads from `fastify.store.getSources()`
- `src/http/routes/sources.test.ts` — 9 tests: empty array, status/eventCount, ISO fetchedAt, null fetchedAt, error field present/absent, field completeness, multi-source ordering, no internal keys
- `src/http/server.ts` — added `import eventsRoute` / `import sourcesRoute`; registered both plugins between health and static
- `.gitignore` — added `.cache-test*/` pattern

## Decisions Made

- `filterByDate('weekend')` matches any Sat/Sun in UTC+5 — not just "next" weekend. Simpler to reason about; clients that want "upcoming only" combine with date range logic
- `serializeEvent()` enumerates all NormalizedEvent fields explicitly rather than spreading `...e` — ensures Date objects are never accidentally passed to fast-json-stringify without conversion
- `free=true` filter only (not `free=false` → paid-only) — default view returns all events; "show free" is an additive filter, "show paid" is not a typical UX need
- `fastify.d.ts` global ambient declaration approach was attempted and REJECTED: a `.d.ts` without top-level imports is a global script; `declare module 'fastify'` in a global script creates an AMBIENT MODULE DECLARATION that replaces (not augments) the module's types, losing all Fastify exports. The correct approach (module augmentation in a module file) is used in `server.ts` and is applied globally by `tsc` via `include: ["src"]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Infrastructure] Added .cache-test*/ to .gitignore**

- **Found during:** Task 3 verification (post-build curl test)
- **Issue:** Two `.cache-test*/` directories were created by the verification runs and showed as untracked after the server test
- **Fix:** Added `.cache-test*/` pattern to `.gitignore`
- **Files modified:** `.gitignore`
- **Impact:** Clean repository state; no functional change

## Known Stubs

None — both routes serve real events from the in-memory EventIndex/CacheStore. `isSeed: true` is the honest label for seed events, not a stub.

## Threat Flags

None beyond what was planned.

Threat mitigations confirmed:
- T-01-13 (Tampering via query params): Ajv enum schema on `date` and `category`; `free` coerced to boolean. `?date=bogus` → 400 FST_ERR_VALIDATION ✓
- T-01-14 (Info Disclosure via /api/sources/status): only `src.error` (human-readable message) is exposed; no stack traces, no retry state, no internal URLs with tokens ✓
- T-01-15 (DoS via per-request scraping): both handlers read from in-memory index/store; zero I/O, zero pipeline coupling in the request path ✓

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/http/routes/events.ts | FOUND |
| src/http/routes/events.test.ts | FOUND |
| src/http/routes/sources.ts | FOUND |
| src/http/routes/sources.test.ts | FOUND |
| src/http/server.ts (imports eventsRoute, sourcesRoute) | FOUND |
| commit d2aaf85 (events route + tests) | FOUND |
| commit 050c25c (sources route + tests) | FOUND |
| commit 7829566 (register in server) | FOUND |
| npm run typecheck | PASSED (0 errors) |
| npm run build | PASSED (1.6 MB CJS bundle) |
| vitest — 59 tests | PASSED |
| GET /api/events → 200 with events+meta | PASSED |
| GET /api/events?date=bogus → 400 FST_ERR_VALIDATION | PASSED |
| GET /api/sources/status → 200 with status+eventCount+fetchedAt | PASSED |
| GET /health → 200 ok | PASSED |
