---
phase: 02-core-product-ui-mood-recommendations
plan: 3
subsystem: http-api
tags: [api, recommendations, serialization, mood, fastify, ajv]
dependency_graph:
  requires: [02-1]
  provides: [GET /api/recommendations, src/http/serialize.ts]
  affects: [src/http/routes/events.ts, src/http/server.ts]
tech_stack:
  added: []
  patterns: [FastifyPluginAsync, Ajv-enum-validation, shared-serializer, effective-date-filtering]
key_files:
  created:
    - src/http/serialize.ts
    - src/http/routes/recommendations.ts
    - src/http/routes/recommendations.test.ts
  modified:
    - src/http/routes/events.ts
    - src/http/routes/events.test.ts
    - src/http/server.ts
    - src/pipeline/dedup.test.ts
    - src/pipeline/index-events.test.ts
decisions:
  - "serializeEvent extracted to src/http/serialize.ts as single source of truth with explicit SerializedEvent interface"
  - "?upcoming=true strips additionalProperties:false-stripped unknown params return 200 not 400 per Fastify v5 default behavior"
  - "recommendationsRoute registered at server.ts line 65 before fastifyStatic at line 70"
metrics:
  duration_minutes: 11
  completed_date: 2026-06-27
  task_count: 3
  file_count: 8
requirements: [API-03]
---

# Phase 02 Plan 3: HTTP API — Recommendations Route + Serializer Extract Summary

**One-liner:** GET /api/recommendations?mood= endpoint backed by Ajv-validated enum, in-memory index reads, and a shared serializeEvent() extracted to serialize.ts; ?upcoming=true added non-breakingly to /api/events.

## Objective Achieved

Connected the plan 02-1 recommendation engine to HTTP by:
1. Extracting `serializeEvent()` to `src/http/serialize.ts` (single source of truth — Pitfall 5 eliminated)
2. Creating `GET /api/recommendations?mood=drink|dance|learn|music` with Ajv enum + `additionalProperties:false`
3. Registering the route before `@fastify/static` in `server.ts`
4. Adding non-breaking `?upcoming=true` filter to `GET /api/events` (same effective-date rule as the engine)

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Extract serialize.ts + add ?upcoming filter to /api/events | 4e97f6b | Done |
| 2 | recommendations route + server.ts registration (API-03) | c926e72 | Done |
| 3 | recommendations route tests (5 cases) | cac5a89 | Done |

## Test Results

```
npm run test: 161 tests passing (13 test files)
Baseline: 152 tests (12 files)
New tests: 9 (events: 4 upcoming cases + 1 strip-unknown; recommendations: 5 cases)

npx vitest run src/http/routes/ → 30 passed (3 files)
npx tsc --noEmit → CLEAN
```

## Live Server Smoke Test

```
GET /api/recommendations?mood=music → 200
  mood: music
  label: Хочу музыки
  emoji: 🎶
  meta.count: 7
  items[0].event.title: АЛЁНА ПОЛЬ и ГЛЕБ ДЗЮБА: летний концерт
  items[0].reason: Концерт
  items[0].event.isSeed: true

GET /api/recommendations → 400 ("must have required property 'mood'")
GET /api/recommendations?mood=sleep → 400 ("must be equal to one of the allowed values")
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS2783 duplicate-property errors in pipeline test helpers**
- **Found during:** Task 1 — `npx tsc --noEmit` gate
- **Issue:** `src/pipeline/dedup.test.ts` and `src/pipeline/index-events.test.ts` (created in plan 02-2) had `makeEvent()` helper functions where required properties (`title`, `startDate`, `venue`, `category`) were set explicitly AND then the whole `overrides` object was spread at the end, causing TypeScript TS2783 "specified more than once" errors
- **Fix:** Removed the explicit duplicate assignments; let the `...overrides` spread provide all required and optional field values. Defaults-before-spread pattern used instead.
- **Files modified:** `src/pipeline/dedup.test.ts`, `src/pipeline/index-events.test.ts`
- **Commit:** 4e97f6b (included in Task 1 commit)

**2. [Rule 1 - Bug / Behavioral Clarification] ?bogus=true returns 200, not 400**
- **Found during:** Task 1 new test for "unknown query param still yields 400"
- **Issue:** Plan expected `additionalProperties: false` to reject unknown querystring params with 400. Fastify v5's default Ajv configuration sets `removeAdditional: 'all'` — extra properties are stripped before the handler runs (security goal met) but the HTTP response is 200, not 400.
- **Fix:** Updated test to assert 200 and document the actual behavior. Security goal (unknown params never reach the handler) is still fully satisfied.
- **Files modified:** `src/http/routes/events.test.ts`
- **Commit:** 4e97f6b

## Key Decisions Made

1. `SerializedEvent` is an explicit interface (not `Record<string, unknown>`) — provides compile-time type safety when both routes use the shared serializer
2. `upcoming` filter effective-date rule mirrors `scoreEvent()` in the engine exactly: `startDate < now AND endDate exists AND endDate > now` → effective date = now (still-running exhibitions kept)
3. `recommendationsRoute` registered at server.ts line 65; `fastifyStatic` at line 70 — exact path always wins

## Threat Surface Scan

No new trust boundaries introduced. Threats T-02-04, T-02-05, T-02-06 mitigated as planned:
- T-02-04 (mood enum): Ajv enum + additionalProperties:false confirmed returning 400 in live test
- T-02-05 (error disclosure): Fastify default 400/500 shape, no stack traces in response body
- T-02-06 (isSeed honesty): `serializeEvent()` preserves `isSeed` verbatim; route test asserts `isSeed === true` on all seed items

## Known Stubs

None. All fields are wired from real NormalizedEvent data through serializeEvent(). The in-memory index may be seeded with demo data (`isSeed: true`) but that is intentional and correctly labeled.

## Self-Check: PASSED

Files created/exist:
- [x] src/http/serialize.ts — FOUND
- [x] src/http/routes/recommendations.ts — FOUND
- [x] src/http/routes/recommendations.test.ts — FOUND

Commits exist:
- [x] 4e97f6b — FOUND
- [x] c926e72 — FOUND
- [x] cac5a89 — FOUND

Tests: 161 passed, 0 failed
TypeScript: CLEAN
