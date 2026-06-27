---
phase: 03-yellow-sources-text-search
plan: 1
subsystem: date-parser, domain-model, serializer
tags: [date-parsing, hasTime, parseDateFull, Format3, Format4, model, serializer, tdd]
dependency_graph:
  requires: []
  provides: [parseDateFull, ParsedDate, NormalizedEvent.hasTime, SerializedEvent.hasTime]
  affects: [src/utils/date.ts, src/types/events.ts, src/http/serialize.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, delegation wrapper, anchored regex ordering]
key_files:
  created: []
  modified:
    - src/utils/date.ts
    - src/utils/date.test.ts
    - src/types/events.ts
    - src/http/serialize.ts
decisions:
  - "parseDateFull() is the canonical parser; parseRussianDate() delegates for backward compat"
  - "Format 3/4 checked before Format 2 to prevent regex swallowing explicit times"
  - "hasTime optional on NormalizedEvent; undefined = unknown (backward compat for all existing adapters)"
metrics:
  duration_seconds: 185
  completed_date: 2026-06-27
  tasks_completed: 2
  files_changed: 4
---

# Phase 03 Plan 1: Date Parser Foundation + hasTime Model Summary

**One-liner:** parseDateFull with Format 3 "в HH:MM" and Format 4 ", HH:MM", plus optional hasTime threaded through NormalizedEvent and SerializedEvent via TDD.

## What Was Built

Two changes to the shared high-contention files that all Phase-3 adapter plans depend on:

**Task 1 — Date parser (TDD):** Added `parseDateFull(text, refYear): ParsedDate | null` alongside the existing `parseRussianDate`. The new function handles:
- Format 3 (afisha.ru): `"DD месяца в HH:MM"` — hasTime: true
- Format 4 (afisha.yandex.ru): `"DD месяца, HH:MM"` — hasTime: true
- Format 1 (kassa-ugra): unchanged — hasTime: true
- Format 2 (date-only): unchanged — hasTime: false
- Relative labels: unchanged — hasTime: false

Formats 3 and 4 are inserted before Format 2 in the match chain (critical ordering per Pitfall 3 in RESEARCH.md — Format 2's optional-year regex would otherwise swallow the date portion and silently drop the time). `parseRussianDate` is rewritten to `return parseDateFull(text, refYear)?.date ?? null` — zero behavior change for all existing callers.

Exported `ParsedDate` interface for typed adapter consumers.

**Task 2 — Model + serializer:** Added `hasTime?: boolean` (optional) to `NormalizedEvent` and `hasTime: boolean | undefined` to `SerializedEvent`, with passthrough in `serializeEvent`. Optional field means all existing adapters, cached data, and toMatchObject assertions remain unaffected.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 — TDD: parseDateFull + Format 3/4 | cff2232 | src/utils/date.ts, src/utils/date.test.ts |
| 2 — hasTime model + serializer | 00d9001 | src/types/events.ts, src/http/serialize.ts |

## Test Results (real vitest output)

```
 RUN  v4.1.9 /Users/aquaform/Projects/surgut-go

 Test Files  13 passed (13)
      Tests  174 passed (174)
   Start at  13:59:14
   Duration  448ms (transform 582ms, setup 0ms, import 1.03s, tests 728ms, environment 1ms)
```

174 tests total = 162 baseline + 12 new date tests (Format 3 ×2, Format 4 ×2, hasTime flags ×6, backward-compat delegation ×2).

## Deviations from Plan

None — plan executed exactly as written.

TDD gate compliance:
- RED: 12 tests failing (`parseDateFull is not a function`; `parseRussianDate "7 октября в 19:00" → 0 UTC hours`)
- GREEN: all 22 date tests passing after implementation
- No REFACTOR step needed — implementation matched the design directly

## Threat Model Coverage

| Threat ID | Disposition | Evidence |
|-----------|-------------|---------|
| T-03-01 DoS (regex backtracking) | Mitigated | All three new regexes are anchored (`^`) with no nested quantifiers; linear time on adversarial input |
| T-03-02 Tampering (wrong Date silently) | Mitigated | never-throws contract returns null on unrecognised input; 12 new test cases pin Format 3/4 UTC outputs |
| T-03-SC Supply chain | Accept | Zero new packages installed |

## Known Stubs

None. This plan is foundation-only — no UI or adapter wiring. parseDateFull is ready for use by Phase-3 adapter plans.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

## Self-Check: PASSED

- [x] src/utils/date.ts exists and exports parseDateFull
- [x] src/types/events.ts contains hasTime
- [x] src/http/serialize.ts contains hasTime on both interface and map
- [x] cff2232 exists in git log
- [x] 00d9001 exists in git log
- [x] 174 tests pass, 0 failures
- [x] npx tsc --noEmit clean
- [x] npm run build produces server.js
