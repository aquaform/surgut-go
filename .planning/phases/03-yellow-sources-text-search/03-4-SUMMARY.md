---
phase: 03-yellow-sources-text-search
plan: 4
subsystem: pipeline-integration
tags: [sources, registry, pipeline, 403-blocked, disabled-sources, env-toggle, quality-gate]
dependency_graph:
  requires: [03-2, 03-3]
  provides: [afisha-ru-active, kassir-sur-blocked, yandex-blocked-toggleable, 403-blocked-mapping]
  affects: [src/pipeline/run.ts, src/sources/registry.ts, src/cache/refresh.ts, src/server.ts, src/config.ts]
tech_stack:
  added: []
  patterns: [disabled-sources-list, 403-to-blocked-mapping, env-gated-adapter, buildSources-assembly]
key_files:
  created: []
  modified:
    - src/config.ts
    - src/sources/registry.ts
    - src/pipeline/run.ts
    - src/pipeline/run.test.ts
    - src/cache/refresh.ts
    - src/server.ts
decisions:
  - "[03-4]: DisabledSource list pattern (Option B from RESEARCH) — keeps sourceRegistry clean; disabled sources appear in status as blocked without ever being scraped"
  - "[03-4]: 403/blocked message detection in run.ts rejection handler — cleanest approach without adapter interface changes"
  - "[03-4]: buildSources(config) assembly function returns active+disabled — single call site in server.ts; toggles yandex cleanly"
  - "[03-4]: stale events retained on blocked status (same as error) — consistency with CACHE-03"
metrics:
  duration: 25
  completed_date: 2026-06-27
  tasks: 3
  files_modified: 6
---

# Phase 03 Plan 4: Source Registry Integration — Summary

**One-liner:** Wire afisha-ru into the active pipeline; surface kassir-sur + yandex-afisha as `blocked` with reasons; map HTTP 403 → `blocked` without crashing the refresh loop; env-gate Yandex via `ENABLE_YANDEX_AFISHA`.

## What Was Built

This plan is the Wave-3 integration layer that connects the three adapters built in 03-2/03-3 into the live pipeline:

### Task 1: Register afisha-ru, DisabledSource assembly, Yandex env-gate
- `src/config.ts`: added `enableYandexAfisha: boolean` read from `process.env['ENABLE_YANDEX_AFISHA'] === 'true'` (default false)
- `src/sources/registry.ts`: added `afishaRuAdapter` to the static `sourceRegistry`; imported `kassirSurAdapter`, `yandexAfishaAdapter`; exported `DisabledSource` interface and `buildSources(config)` helper that returns `{ active: SourceAdapter[]; disabled: DisabledSource[] }` — kassir always disabled, yandex disabled unless the env flag is on
- `src/server.ts`: replaced `sourceRegistry` direct import with `buildSources(config)` call; passed both `registry: active` and `disabledSources: disabled` to `startRefreshLoop`

### Task 2: 403→blocked mapping + disabledSources merge (TDD)
- **RED:** 7 new tests covering 403→blocked, generic→error, blocked stale serve, disabled-list entries, backward compat
- **GREEN:** `src/pipeline/run.ts` — `runPipeline` extended with optional `disabled?: DisabledSource[]` third parameter; rejection handler detects `HTTP 403` or `blocked` in error message → sets `status: 'blocked'` (stale events retained in both cases); disabled sources appended as `SourceResult` entries with `status: 'blocked'`, `eventCount: 0`, `fetchedAt: null`, `error: reason`
- `src/cache/refresh.ts` — `RefreshOptions` extended with `disabledSources?: DisabledSource[]`; passed through to `runPipeline`

### Task 3: Quality gate + boot smoke
All gates passed (see below).

## Quality Gate Results

```
npm run lint        PASS (no output = clean)
npx tsc --noEmit    PASS (no errors)
npx vitest run      PASS  216 tests / 16 files / 0 failures
npm run build       PASS  server.js 1.9 MB in 49ms
node server.js      PASS  /health → "ok" (200)
```

## Live Boot Smoke — /api/sources/status

Booted with `CACHE_DIR=/tmp PORT=3098 node server.js`, waited 30 s for refresh cycle, then:

```json
[
  {
    "name": "kassa-ugra",
    "displayName": "Касса Югра",
    "status": "live",
    "eventCount": 52,
    "fetchedAt": "2026-06-27T10:56:44.520Z"
  },
  {
    "name": "afisha-surguta",
    "displayName": "Афиша Сургута",
    "status": "live",
    "eventCount": 38,
    "fetchedAt": "2026-06-27T10:56:44.520Z"
  },
  {
    "name": "afisha-ru",
    "displayName": "Афиша.ру Сургут",
    "status": "error",
    "eventCount": 0,
    "fetchedAt": null,
    "error": "ParseError: afisha-ru returned <2 events across all pages (got 0)"
  },
  {
    "name": "seed",
    "displayName": "Демо-данные",
    "status": "seed",
    "eventCount": 12,
    "fetchedAt": "2026-06-27T10:56:44.520Z"
  },
  {
    "name": "kassir-sur",
    "displayName": "Кассир Сургут",
    "status": "blocked",
    "eventCount": 0,
    "fetchedAt": null,
    "error": "Требует браузера; источник полностью клиентский — отключён в MVP"
  },
  {
    "name": "yandex-afisha",
    "displayName": "Яндекс Афиша Сургут",
    "status": "blocked",
    "eventCount": 0,
    "fetchedAt": null,
    "error": "Отключён по умолчанию — риск ToS; включается ENABLE_YANDEX_AFISHA"
  }
]
```

**Note on afisha-ru status: `error` (live parse miss):** The `[role=listitem]` selectors returned 0 events from the live afisha.ru page during the smoke test. This is a live-site selector fragility issue (Pitfall 1 in RESEARCH: CSS module classes rotate on Next.js deploys). The min-results guard fired correctly (ParseError), the refresh loop kept running, and no stale events were served (no prior cache). The Phase-03-2 fixture tests (which test the parser against captured HTML) all pass. This matches the plan's acceptance for Task 3: "If afisha-ru shows 'error' due to a live parse miss, that is acceptable here as long as the fixture tests in 03-2 pass." kassir-sur and yandex-afisha are correctly surfaced as `blocked` with their reasons.

## Deviations from Plan

None. Plan executed exactly as written.

## Known Stubs

None. All sources are honestly reported (no invented data, no placeholders).

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes beyond what the plan's `<threat_model>` documented. All T-03-12 through T-03-15 mitigations are in place:

| Threat | Mitigation Status |
|--------|------------------|
| T-03-12: 403 crash loop | Mitigated — 403/blocked message → status 'blocked'; loop never crashes |
| T-03-13: Disabled source shown as if it had data | Mitigated — eventCount 0, fetchedAt null, scrape never called |
| T-03-14: Error/reason strings in status response | Mitigated — human-readable only (existing T-01-14 invariant) |
| T-03-15: Yandex enabled without operator intent | Mitigated — defaults to disabled; explicit ENABLE_YANDEX_AFISHA=true required |

## Self-Check: PASSED

- [x] `src/config.ts` exists and contains `enableYandexAfisha`
- [x] `src/sources/registry.ts` exports `DisabledSource`, `buildSources`, `sourceRegistry` with `afishaRuAdapter`
- [x] `src/pipeline/run.ts` contains `blocked` mapping and `disabledSources` merge
- [x] `src/pipeline/run.test.ts` has 7 new TDD cases (216 total, all green)
- [x] `src/cache/refresh.ts` has `disabledSources` in `RefreshOptions`
- [x] `src/server.ts` calls `buildSources(config)` and passes both lists
- [x] Commits: 66289d8 (Task 1), c8c25d5 (RED tests), 802bfac (Task 2 GREEN)
- [x] Build: server.js produced, boot smoke passed, /health 200, /api/sources/status correct
