---
phase: 01-deployable-pipeline-green-sources
plan: 01-3
subsystem: data-layer
tags: [seed, cache, event-index, atomic-write, ttl, tdd, agile-02]

# Dependency graph
requires:
  - 01-1 (NormalizedEvent, SourceAdapter, CacheFile types; config loader)
provides:
  - seedAdapter (SourceAdapter) with 12 real Surgut examples, all isSeed:true
  - src/sources/seed/events.json (~12 real events from kassa-ugra + afisha.surguta, isSeed:true)
  - src/sources/registry.ts (sourceRegistry = [seedAdapter])
  - CacheStore: load/save(atomic)/isStale/getEvents/getSources/loadOrSeed (12 tests green)
  - buildEventIndex + EventIndex with all()/byCategory()/rebuild()
  - AGG-02 honesty test: asserts no seed event has isSeed !== true
affects:
  - 01-5 (server.ts: loadOrSeed + buildEventIndex wired at boot)
  - 01-6 (refresh loop: store.save + index.rebuild called after each scrape cycle)
  - 01-7 (kassa-ugra + afisha-surguta adapters appended to sourceRegistry)
  - 01-8 (routes read from EventIndex.all() and EventIndex.byCategory())

# Tech tracking
tech-stack:
  added:
    - node:crypto (createHash sha1 for deterministic event IDs)
    - node:fs (promises: readFile/writeFile/rename/mkdir for atomic cache)
  patterns:
    - Atomic write: writeFile(.tmp) + rename — no partial reads on crash (T-01-05)
    - Date revival: JSON.parse(raw, dateReviver) converts ISO strings back to Date
    - Seed fallback: epoch savedAt makes isStale() always true for seed data
    - TDD RED→GREEN in single task: test file committed before implementation
    - In-memory atomic swap: new IndexData built then assigned in one step

key-files:
  created:
    - src/sources/seed/events.json
    - src/sources/seed/index.ts
    - src/sources/registry.ts
    - src/cache/store.ts
    - src/cache/store.test.ts
    - src/pipeline/index-events.ts
  modified:
    - tsconfig.json (added resolveJsonModule:true)
    - .gitignore (cache/ → /cache/ to allow src/cache/ source files)

key-decisions:
  - "resolveJsonModule:true added to tsconfig to support import of events.json with type inference"
  - ".gitignore fixed: cache/ matched src/cache/ accidentally — changed to /cache/ (root only)"
  - "epoch savedAt in loadOrSeed: guarantees isStale() returns true for seed data so refresh loop replaces it immediately"
  - "Date revival via dateReviver function in JSON.parse: Date instances survive disk roundtrip"
  - "EventIndex rebuild(): new IndexData built first, then single reference swap — no mid-rebuild observation"

# Metrics
duration: 12min
completed: 2026-06-27
---

# Phase 01 Plan 3: Seed + Cache + EventIndex Summary

**Honest seed fallback with 12 real Surgut events (all isSeed:true), atomic JSON cache with TTL + seed fallback, and pure in-memory EventIndex with atomic rebuild**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-27
- **Tasks:** 3
- **Files modified/created:** 8

## Accomplishments

- 12 real Surgut events from research (7 kassa-ugra + 5 afisha.surguta), all `isSeed:true` — honest demo data labelled as such
- `seedAdapter` implements `SourceAdapter`, revives ISO date strings to `Date`, stamps `fetchedAt=now` and `isSeed=true` defensively
- `sourceRegistry` exports ordered active-adapter array (currently `[seedAdapter]`; live adapters appended in 01-7)
- `CacheStore`: atomic write (`.tmp`→rename), TTL staleness, seed fallback on missing/corrupt, Date revival — 12 vitest tests green
- `buildEventIndex`: pure in-memory index, sorted by `startDate ASC`, O(1) category lookup, atomic `rebuild()` swap
- `AGG-02` honesty test committed: asserts every `events.json` entry has `isSeed===true` — structural guard against seed-as-live bug
- Full test suite: 32 tests passing across 3 files (store + date + price)

## Task Commits

1. **Task 1: Seed adapter + real events + registry** — `7d90c3d` (feat)
   - `src/sources/seed/events.json` (12 events), `src/sources/seed/index.ts`, `src/sources/registry.ts`, `tsconfig.json`
2. **Task 2 RED: CacheStore test file** — `c269a87` (test)
   - `src/cache/store.test.ts` (11 store tests + 1 AGG-02 honesty test), `.gitignore` fix
3. **Task 2 GREEN: CacheStore implementation** — `737ce86` (feat)
   - `src/cache/store.ts`
4. **Task 3: In-memory EventIndex** — `ec2c274` (feat)
   - `src/pipeline/index-events.ts`

## Files Created/Modified

- `src/sources/seed/events.json` — 12 real Surgut event examples, all `isSeed:true`
- `src/sources/seed/index.ts` — `seedAdapter`: revives Dates, computes SHA-1 IDs, defensive `isSeed:true` stamp
- `src/sources/registry.ts` — `sourceRegistry = [seedAdapter]`
- `src/cache/store.ts` — `CacheStore`: atomic save, TTL, seed fallback, Date revival
- `src/cache/store.test.ts` — 12 tests covering all CacheStore behaviors + AGG-02 honesty
- `src/pipeline/index-events.ts` — `buildEventIndex()` + `EventIndex` interface
- `tsconfig.json` — added `resolveJsonModule: true`
- `.gitignore` — `cache/` → `/cache/` (root only)

## Decisions Made

- `resolveJsonModule: true` added to `tsconfig.json` to support typed `import seedData from './events.json'`
- `.gitignore` pattern `cache/` was silently ignoring `src/cache/` — changed to `/cache/` to scope to root runtime dir only
- Seed data uses `savedAt: new Date(0).toISOString()` (epoch) so `isStale()` always returns `true` → refresh loop immediately replaces seed with live data
- `EventIndex.rebuild()` builds completely new `IndexData` before swapping the `current` reference — no mid-rebuild observation possible for concurrent readers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] .gitignore `cache/` pattern blocked `src/cache/` staging**
- **Found during:** Task 2 RED commit
- **Issue:** `.gitignore` contained `cache/` (no leading slash), which matched any `cache/` directory at any depth including `src/cache/`. `git add src/cache/store.test.ts` was rejected.
- **Fix:** Changed `cache/` to `/cache/` so only the root-level runtime cache directory is ignored, not source code.
- **Files modified:** `.gitignore`
- **Commit:** `c269a87` (Task 2 RED)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking issue)
**Impact on plan:** Zero scope creep; fix preserves all plan intent.

## Known Stubs

None — all three modules produce real output. `src/sources/registry.ts` contains only `[seedAdapter]` intentionally (live adapters added in plan 01-7 per plan spec).

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. T-01-05 (corrupt cache) and T-01-06 (seed-as-live spoofing) are both mitigated as planned.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/sources/seed/events.json | FOUND |
| src/sources/seed/index.ts | FOUND |
| src/sources/registry.ts | FOUND |
| src/cache/store.ts | FOUND |
| src/cache/store.test.ts | FOUND |
| src/pipeline/index-events.ts | FOUND |
| commit 7d90c3d | FOUND |
| commit c269a87 | FOUND |
| commit 737ce86 | FOUND |
| commit ec2c274 | FOUND |
| vitest: 32 tests pass | PASSED |
