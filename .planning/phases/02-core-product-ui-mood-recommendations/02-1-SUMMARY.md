---
phase: 02-core-product-ui-mood-recommendations
plan: 1
subsystem: recommend
tags: [recommendation-engine, pure-functions, tdd, mood-mapping, ranking]
dependency_graph:
  requires: [src/types/events.ts]
  provides: [src/recommend/mood-map.ts, src/recommend/recommend.ts]
  affects: [plan 02-3 API route consumes getRecommendations]
tech_stack:
  added: []
  patterns: [pure-function module, TDD red-green cycle, injected-now for determinism]
key_files:
  created:
    - src/recommend/mood-map.ts
    - src/recommend/mood-map.test.ts
    - src/recommend/recommend.ts
    - src/recommend/recommend.test.ts
  modified: []
decisions:
  - "title-keyword matching primary (not tags) because live data shows tags: [] on 85%+ of events"
  - "still-running exhibitions pinned to 'today' via effectiveDate = now when startDate < now AND endDate > now"
  - "now injected as parameter throughout — no new Date() inside engine (deterministic tests)"
  - "venue match takes reason-text precedence over keyword match for higher user confidence"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-27"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 02 Plan 1: Mood-to-Event Recommendation Engine Summary

Pure recommendation engine: static MOOD_MAPPINGS table (4 moods × categories/keywords/venues) plus deterministic isEventMatchForMood/scoreEvent/buildReasonText/getRecommendations functions with tonight-first ranking, past-event filtering, exhibition pinning, and "Почему рекомендовано" reason precedence (venue > keyword > category).

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 RED | Failing mood-map tests | ca82f7c | src/recommend/mood-map.test.ts |
| 1 GREEN | MOOD_MAPPINGS implementation | d5a20d7 | src/recommend/mood-map.ts |
| 2 RED | Failing recommend engine tests | 6ac98f6 | src/recommend/recommend.test.ts |
| 2 GREEN | Recommendation engine implementation | ef0a13e | src/recommend/recommend.ts |

## Verification Results

```
Test Files  10 passed (10)
      Tests  138 passed (138)
   Start at  08:49:29
   Duration  335ms
```

- 30 mood-map structural tests green
- 29 recommend engine tests green (all 10 branches from plan covered)
- 79 pre-existing tests: no regressions
- `npx tsc --noEmit`: clean (no TypeScript errors)
- No bare `new Date()` in executable code in recommend.ts (only in comments)

## Key Decisions

1. **Title-keyword matching as primary path** (not tags): Live data shows `tags: []` on 85%+ of events; category + title.toLowerCase().includes(keyword) + venue is the reliable match path.

2. **Exhibition pinning** (`effectiveDate = now` when `startDate < now AND endDate > now`): Still-running exhibitions (e.g., gallery shows) have a past `startDate` but are ongoing; pinning to "today" lets them appear in `learn` recommendations instead of being silently filtered.

3. **`now` always injected**: `scoreEvent` and `getRecommendations` never call `new Date()` — callers pass `now` explicitly. This makes all tests deterministic with fixed Date fixtures (satisfies T-02-01).

4. **Reason text precedence** (venue > keyword > category): Venue match is highest-confidence ("Площадка подходит: Компромат"); title keyword match exposes up to 2 capitalized matched terms joined with ` · `; category label is the fallback.

5. **50-item cap**: Slices top 50 after descending score sort — covers the entire Surgut event set with no pagination needed (75 future events in live data).

## TDD Gate Compliance

- RED gate: `test(02-1)` commits (ca82f7c, 6ac98f6) precede GREEN commits
- GREEN gate: `feat(02-1)` commits (d5a20d7, ef0a13e) follow RED commits
- Both gate commits exist in git log

## Deviations from Plan

None — plan executed exactly as written. MOOD_MAPPINGS table copied verbatim from 02-RESEARCH.md. All 10 test branches from the plan spec covered.

## Known Stubs

None — the engine is fully implemented with no hardcoded empty returns or placeholder logic.

## Threat Flags

None — pure functions with no new network endpoints, auth paths, file access, or schema changes.

## Self-Check: PASSED

- [x] src/recommend/mood-map.ts exists
- [x] src/recommend/mood-map.test.ts exists
- [x] src/recommend/recommend.ts exists
- [x] src/recommend/recommend.test.ts exists
- [x] Commits ca82f7c, d5a20d7, 6ac98f6, ef0a13e exist in git log
- [x] 138 tests pass with no failures
