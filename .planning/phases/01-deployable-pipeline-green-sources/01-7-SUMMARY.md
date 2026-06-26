---
phase: 01-deployable-pipeline-green-sources
plan: 01-7
subsystem: sources/adapters
tags: [cheerio, scraper, kassa-ugra, afisha-surguta, tdd, fixture-testing, registry, robots, crawl-delay, dedup, normalisation]

# Dependency graph
requires:
  - 01-1 (esbuild build, cheerio in deps)
  - 01-2 (src/utils/date.ts + price.ts + http.ts + robots.ts)
  - 01-3 (CacheStore, EventIndex, SourceAdapter interface)
  - 01-5 (runPipeline, withTimeout, startRefreshLoop)
provides:
  - src/sources/kassa-ugra/index.ts (kassaUgraAdapter + parseKassaUgra)
  - src/sources/kassa-ugra/index.test.ts (7 fixture tests)
  - src/sources/afisha-surguta/index.ts (afishaSurgutaAdapter + parseAfishaSurguta)
  - src/sources/afisha-surguta/index.test.ts (12 fixture tests)
  - src/sources/registry.ts (kassaUgraAdapter + afishaSurgutaAdapter + seedAdapter)
  - src/pipeline/run.ts (seed-status fix: status 'seed' not 'live')
  - src/pipeline/run.test.ts (new seed-status assertion)
affects:
  - 01-8 (routes now serve real live events from both adapters in EventIndex)

# Tech tracking
tech-stack:
  added:
    - "import * as cheerio from 'cheerio'" (v1.x namespace import per Pitfall 3)
    - resolveRangeStartYear() — custom algorithm for afisha.surguta range dates
    - CRAWL_DELAY_MS constant (10_000) in afisha-surguta adapter (SRC-07 anchor)
  patterns:
    - "TDD: RED (failing test + commit) → GREEN (impl + commit) per adapter"
    - "parseFunc(html) + Adapter: parser testable offline; adapter handles network"
    - "SHA-1 id: sha1(sourceName+sourceUrl+day) — deterministic dedup key"
    - "cheerio div.event selector (kassa-ugra) and div.event-element (afisha-surguta)"
    - "age suffix strip: /\\s+(\\d{1,2}\\+)\\s*$/ → ageLimit field"
    - "price-in-title strip: /\\s+(\\d[\\d\\s]*\\s*₽)\\s*$/ → parseRussianPrice"
    - "range date: resolveRangeStartYear from end date + start month comparison"
    - "robotsCache: checked once per origin per process lifetime"

key-files:
  created:
    - src/sources/kassa-ugra/index.ts
    - src/sources/kassa-ugra/index.test.ts
    - src/sources/afisha-surguta/index.ts
    - src/sources/afisha-surguta/index.test.ts
  modified:
    - src/sources/registry.ts
    - src/pipeline/run.ts
    - src/pipeline/run.test.ts

key-decisions:
  - "cheerio namespace import required: 'import * as cheerio' — v1.x removed default CJS export"
  - "kassa-ugra adapter timeoutMs=30000: covers 3 pages x 8s + 2x2s delays (< 30s)"
  - "afisha-surguta range-date year resolution: resolveRangeStartYear() uses endDate year; avoids inferYear giving wrong year for months already past in current year"
  - "seed status fix: adapter.name==='seed' ? 'seed' : 'live' in runPipeline — seed was incorrectly reported as 'live' before this fix"
  - "CRAWL_DELAY_MS exported as const: enforcement anchor for future detail-page fetches (Phase 1 single-request => no delay applied yet)"

# Metrics
duration: ~25min
completed: 2026-06-27
---

# Phase 01 Plan 7: kassa-ugra + afisha.surguta Source Adapters Summary

**Two GREEN source adapters implemented and fixture-tested with TDD: kassa-ugra.ru (3 pages, 2s politeness) and afisha.surguta.ru (listing-only, 10s crawl-delay constant), both normalising to NormalizedEvent with isSeed:false, registered alongside seed; seed status no longer reported as "live"**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-06-27
- **Tasks:** 3 (Tasks 1–2 each have RED + GREEN sub-commits)
- **Files created:** 4 | **Files modified:** 3

## Accomplishments

- `parseKassaUgra(html)`: cheerio namespace import; `div.event` container hierarchy from SELECTORS.md; title/venue/date/price/image extraction; whitespace normalisation on `icon-calendar` span; year inference via `parseRussianDate`; category heuristics (theater/exhibition/club/lecture/standup/concert); SHA-1 ID; min-results guard (< 2 → ParseError). **7 fixture tests green.**
- `kassaUgraAdapter`: robots.txt check, 3-page scrape (`/afisha`, `?page=2`, `?page=3`) with 2s politeness, `timeoutMs: 30 000`, in-adapter ID dedup, isSeed:false, per-page ParseError propagation.
- `parseAfishaSurguta(html)`: cheerio `div.event-element`; age suffix stripped `/\s+(\d{1,2}\+)\s*$/` → `ageLimit`; price-in-title stripped `/\s+(\d[\d\s]*\s*₽)\s*$/` → `parseRussianPrice`; range date with `resolveRangeStartYear()` (extracts year from `date-display-end`, resolves start year correctly for months in same calendar year); free-entry badge `img[alt="Свободный вход"]`; category heuristics (exhibition/theater/concert/club/lecture/other). **12 fixture tests green.**
- `afishaSurgutaAdapter`: robots.txt check, single listing page (`/`), `timeoutMs: 12 000`, `CRAWL_DELAY_MS = 10_000` constant present for future detail-page fetches. Phase 1 makes one request — no inter-request delay needed.
- Registry updated: `[kassaUgraAdapter, afishaSurgutaAdapter, seedAdapter]` — pipeline now runs all three adapters in parallel.
- **Seed status fix (Rule 2 deviation):** `runPipeline` was reporting `status: 'live'` for the seed adapter. Fixed to return `'seed'` when `adapter.name === 'seed'`. Test added to verify.

## Task Commits

1. **Task 1 RED** — `7066ea3` (test): `src/sources/kassa-ugra/index.test.ts` — 7 failing fixture tests
2. **Task 1 GREEN** — `96d193e` (feat): `src/sources/kassa-ugra/index.ts` — parser + adapter (7 tests pass)
3. **Task 2 RED** — `b59af3c` (test): `src/sources/afisha-surguta/index.test.ts` — 12 failing fixture tests
4. **Task 2 GREEN** — `67ece66` (feat): `src/sources/afisha-surguta/index.ts` — parser + adapter (12 tests pass)
5. **Task 3** — `04998c7` (feat): registry + seed status fix + seed status test (79 tests pass; build green)

## Real Verification Output

### vitest run src/sources/kassa-ugra/index.test.ts
```
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  273ms
```

### vitest run src/sources/afisha-surguta/index.test.ts
```
 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  356ms
```

### Full suite (79 tests)
```
 Test Files  8 passed (8)
      Tests  79 passed (79)
   Duration  461ms
```

### npm run build
```
  server.js  3.7mb (cheerio bundled)
⚡ Done in 58ms
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Seed source was reported as status "live" in /api/sources/status**
- **Found during:** Task 3 (registry registration)
- **Issue:** `runPipeline` in `src/pipeline/run.ts` set `status: 'live'` for ALL fulfilled adapters, including the seed adapter. This violates the honesty requirement — seed should never appear as "live" (AGG-02, CACHE-04, plan critical_rules).
- **Fix:** Added `const status = adapter.name === 'seed' ? 'seed' : 'live'` before the `sources.push(...)` call. Added a test asserting seed reports `'seed'` not `'live'`.
- **Files modified:** `src/pipeline/run.ts`, `src/pipeline/run.test.ts`
- **Commit:** `04998c7`

**2. [Rule 2 - Missing Critical Functionality] afisha.surguta.ru range-date year inference bug**
- **Found during:** Task 2 analysis (pre-implementation)
- **Issue:** `parseRussianDate("9 февраля")` called with `inferYear` when today is June 2026 → returns 2027. But the range `"9 февраля - 31 декабря 2026"` requires 2026 for the start. The end date provides the authoritative year.
- **Fix:** Implemented `resolveRangeStartYear(startDateStr, endDateStr)` in `afisha-surguta/index.ts`. Extracts year from end date, compares start/end months, returns correct year for start date. Test `'a range-date event has valid startDate...'` verifies September 2026 for Рюриковичи.
- **Files modified:** `src/sources/afisha-surguta/index.ts`
- **Commit:** `67ece66`

## Known Stubs

None — both adapters produce real normalized events from live HTML fixtures. All fields wired from real data. The `CRAWL_DELAY_MS` constant documents future work (detail-page fetches for time precision) but is not a stub — the Phase 1 listing-only approach is intentional per plan spec.

## Threat Flags

None — no new network endpoints or auth paths.

Threat mitigations applied:
- T-01-16 (XSS in scraped titles): `cheerio.text()` used throughout — strips HTML, extracts text only. Raw HTML never stored.
- T-01-17 (DoS via afisha.surguta rate-limit): `isAllowed()` called before fetch; `CRAWL_DELAY_MS=10000` constant present; `p-retry` bounded by timeoutMs; polite User-Agent via `fetchHtml`.
- T-01-18 (structure change → empty parse): `ParseError` thrown on < 2 events in both parsers → `runPipeline` catches as `'error'`, serves stale, does not overwrite cache (AGG-05).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/sources/kassa-ugra/index.ts | FOUND |
| src/sources/kassa-ugra/index.test.ts | FOUND |
| src/sources/afisha-surguta/index.ts | FOUND |
| src/sources/afisha-surguta/index.test.ts | FOUND |
| src/sources/registry.ts (kassaUgraAdapter) | FOUND |
| src/sources/registry.ts (afishaSurgutaAdapter) | FOUND |
| src/pipeline/run.ts (seed status fix) | FOUND |
| commit 7066ea3 (RED kassa-ugra) | FOUND |
| commit 96d193e (GREEN kassa-ugra) | FOUND |
| commit b59af3c (RED afisha-surguta) | FOUND |
| commit 67ece66 (GREEN afisha-surguta) | FOUND |
| commit 04998c7 (registry + seed fix) | FOUND |
| vitest: 79 tests pass | PASSED |
| npm run build (3.7mb) | PASSED |
| CRAWL_DELAY_MS in afisha-surguta/index.ts | FOUND |
| cheerio imported as `import * as cheerio` | FOUND |
