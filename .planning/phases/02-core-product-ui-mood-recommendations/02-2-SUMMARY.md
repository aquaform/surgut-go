---
phase: 02-core-product-ui-mood-recommendations
plan: 2
subsystem: pipeline/dedup
tags: [tests, dedup, event-index, AGG-03, QA-02, pipeline]
dependency_graph:
  requires: []
  provides: [AGG-03-verified, EventIndex-coverage]
  affects: [QA-02-coverage-gate]
tech_stack:
  added: []
  patterns: [vitest describe/it/expect, makeEvent fixture helper, pure-function unit tests]
key_files:
  created:
    - src/pipeline/dedup.test.ts
    - src/pipeline/index-events.test.ts
  modified: []
decisions:
  - Used makeEvent() helper with sensible defaults and explicit Date overrides (matches events.test.ts style)
  - Asserted on identifying fields (title, sourceName, isSeed, length) rather than object identity to keep tests resilient
  - Exercised prefer-live threat mitigation T-02-03 by placing seed first and asserting live survivor
metrics:
  duration: ~5 min
  completed: 2026-06-27T04:50:12Z
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 2: Pipeline Dedup + EventIndex Tests Summary

## One-liner

AGG-03 proven via 6 dedup test cases (cross-source, prefer-live, Cyrillic slug) and 8 EventIndex cases (sort/byCategory/rebuild/empty) — both modules at 100% coverage, production files untouched.

## What Was Built

Two new test files covering previously-untested pipeline modules:

**src/pipeline/dedup.test.ts** (14 tests across both files, 6 for dedup):
- Cross-source collapse: same composite key from two sources → length 1
- Prefer-live policy (T-02-03 mitigation): seed first, live second → live survives
- First-seen-wins stability: both live → first source survives
- Distinct dates preserved: two events on different days → length 2
- Same-day 31-min window: key is date-day only — still collapses to 1
- Cyrillic slug stability: two different Cyrillic titles produce distinct keys → length 2

**src/pipeline/index-events.test.ts** (8 tests):
- all() sorted ASC regardless of input order
- byCategory() returns correct subset, sorted ASC
- byCategory() returns [] for category with no events; empty index
- rebuild() atomically replaces all contents (old events absent after swap)
- rebuild() to empty clears index
- byCategory() reflects new set post-rebuild

## Production Changes

None. `src/pipeline/dedup.ts` and `src/pipeline/index-events.ts` were not modified (`git diff --quiet` confirmed clean).

## Verification Output

```
 RUN  v4.1.9 /Users/aquaform/Projects/surgut-go

 Test Files  12 passed (12)
      Tests  152 passed (152)
   Start at  09:50:05
   Duration  404ms
```

Coverage report for pipeline modules:
```
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
(pipeline files) | 100%    | 100%     | 100%    | 100%    |
-----------------|---------|----------|---------|---------|-------------------
Statements  : 100% (30/30)
Branches    : 100% (10/10)
Functions   : 100% (9/9)
Lines       : 100% (30/30)
```

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1 — dedup.test.ts | 5772b39 | src/pipeline/dedup.test.ts |
| Task 2 — index-events.test.ts | c3361fd | src/pipeline/index-events.test.ts |

## Deviations from Plan

None — plan executed exactly as written. No production code was added, modified, or deleted.

## Threat Flags

None — test-only plan adds no new runtime boundaries.

## Known Stubs

None.

## Self-Check: PASSED

- src/pipeline/dedup.test.ts exists: FOUND
- src/pipeline/index-events.test.ts exists: FOUND
- Commit 5772b39 exists: FOUND
- Commit c3361fd exists: FOUND
- dedup.ts unchanged (git diff empty): CONFIRMED
- index-events.ts unchanged (git diff empty): CONFIRMED
- Full suite: 152 tests, 12 files, 0 failures: CONFIRMED
