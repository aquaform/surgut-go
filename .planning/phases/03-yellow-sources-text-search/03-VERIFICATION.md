---
phase: 03-yellow-sources-text-search
verified: 2026-06-27T16:30:00Z
status: passed
score: 4/4 success criteria verified
overrides_applied: 0
re_verification: false
---

# Phase 3: Yellow Sources & Text Search — Verification Report

**Phase Goal:** Event coverage is expanded with three YELLOW source adapters added cautiously with documented guards, and users can search events by keyword.
**Verified:** 2026-06-27T16:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Quality Gate Output (Ground Truth)

All three gates run locally against current HEAD.

### typecheck
```
npm run typecheck → tsc --noEmit
Exit 0. No output. Clean.
```

### lint
```
npm run lint → eslint .
Exit 0. No output. Clean.
```

### test --coverage
```
Test Files  16 passed (16)
      Tests  216 passed (216)
   Duration  644ms

Coverage summary (v8):
  Statements : 80.93%  (518/640)  ✓ exceeds 80%
  Branches   : 72.13%  (277/384)
  Functions  : 84.00%   (84/100)
  Lines      : 85.38%  (485/568)  ✓ exceeds 80%
```

All gates PASS.

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | afisha.ru ParseError guard: HTTP 200 + <2 events → logs error, retains cache (honest: 0 events live due to anti-bot) | VERIFIED | `parseAfishaRu()` throws `ParseError:` when `events.length < 2` (lines 207-213); `runPipeline` treats any throw as rejection → serve-stale (line 141-143); fixture test at `index.test.ts:89-100` proves guard fires on empty HTML |
| SC-2 | kassir-sur honest stub: `enabled:false`, reason documented, `scrape()` throws, never fakes data, surfaces as `blocked` | VERIFIED | `kassirSurAdapter.enabled = false as const` (line 51); `reason` string set (line 58); `scrape()` unconditionally throws (line 67); `buildSources()` places it in `disabled[]` not `active[]`; tests at `index.test.ts:41-48` confirm throw. Zero event data fabricated — no `return []` or event object construction anywhere in the file. |
| SC-3 | yandex-afisha: `enabled:false`, `tosRisk:true`, `ENABLE_YANDEX_AFISHA` toggle, HTTP 403 → `blocked`, isolation keeps loop alive | VERIFIED | `enabled: false` (line 217); `tosRisk: true` (line 223); `config.ts:43` parses `ENABLE_YANDEX_AFISHA=true`; `buildSources()` conditionally moves adapter to `active[]`; 403 rethrown as `'HTTP 403 — source blocked'` (yandex/index.ts line 239); `run.ts:138` maps `HTTP 403` to `isBlocked=true`; `Promise.allSettled` guarantees isolation. Tests at `yandex-afisha/index.test.ts:164` prove 403-tagged throw. |
| SC-4 | Text search filters visible cards by keyword (case-insensitive, Russian, no reload) | VERIFIED | `searchQuery` variable evaluated at `app.js:116-124` **before** `if (!activeDateChip) return true` guard at line 126 — search applies on default "Все" view. `ev.target.value.trim().toLowerCase()` at line 352 handles Russian case-insensitive. No fetch call in the event handler. `#search-input` element present in `index.html:29`. |

**Score: 4/4 truths verified**

**UX-01 (folded in): date-only time fix**

| Item | Status | Evidence |
|------|--------|----------|
| `parseDateFull()` exported with `{ date, hasTime }` result | VERIFIED | `date.ts:44-54` defines `ParsedDate` interface; function returns `hasTime: true` for Formats 1/3/4 (explicit HH:MM), `hasTime: false` for Format 2 and relative labels |
| Format 3 `"DD месяца в HH:MM"` and Format 4 `"DD месяца, HH:MM"` parsed before Format 2 | VERIFIED | `date.ts:95-115` checks m3 and m4 before m2 (line 120); comment at line 13-14 documents ordering requirement |
| `hasTime` passed through serializer to client | VERIFIED | `serialize.ts:37,66` — field declared in `SerializedEvent` and mapped from `NormalizedEvent.hasTime` |
| `humanizeDate` omits time when `hasTime===false` or UTC-midnight inference | VERIFIED | `app.js:26-29`: `isDateOnly = hasTime === false || (hasTime === undefined && utcHours===0 && utcMinutes===0)`; `timeStr = isDateOnly ? '' : ', HH:MM'` (line 43-45) |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sources/afisha-ru/index.ts` | SRC-04 adapter: cheerio/slim, href-pattern selectors, ParseError guard | VERIFIED | `import * as cheerio from 'cheerio/slim'` (line 37); selectors `a[href^="/concert/"]`, `a[href^="/performance/"]`, `a[href^="/event/"]` (line 127); `ParseError:` guard at line 207 and 280 |
| `src/sources/kassir-sur/index.ts` | SRC-05 honest disabled stub | VERIFIED | 69-line module; `enabled: false as const`; `reason` string; `scrape()` throws; no event data |
| `src/sources/yandex-afisha/index.ts` | SRC-06 disabled-by-default adapter with 403 handling | VERIFIED | `enabled: false`; `tosRisk: true`; 403 → tagged rethrow; `parseYandexAfisha()` parser substantive (247 lines) |
| `src/sources/registry.ts` | `buildSources()` with toggle + disabled list assembly | VERIFIED | `afishaRuAdapter` in both `sourceRegistry[]` (line 64) and `buildSources().active[]` (line 93); kassir always in `disabled[]` (lines 101-106); yandex conditionally active/disabled (lines 95, 107-118) |
| `src/config.ts` | `ENABLE_YANDEX_AFISHA` env toggle | VERIFIED | `enableYandexAfisha: process.env['ENABLE_YANDEX_AFISHA'] === 'true'` (line 43); typed in `AppConfig` interface |
| `src/pipeline/run.ts` | 403→blocked mapping + disabledSources path | VERIFIED | Lines 137-138: `isBlocked = includes('HTTP 403') || includes('blocked')`; lines 160-172: disabled sources appended as `status:'blocked'` |
| `src/utils/date.ts` | `parseDateFull()` with Format 3/4 + `hasTime` | VERIFIED | `ParsedDate` interface; m3 (line 95), m4 (line 108), both before m2 (line 120); `hasTime: true/false` returned in all branches |
| `public/app.js` | `humanizeDate` omits time for date-only; search before date-chip guard | VERIFIED | Lines 24-45: `humanizeDate` with `isDateOnly` logic; lines 113-126: search block before `if (!activeDateChip) return true` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server.ts` | `buildSources()` | import + call at line 54 | WIRED | `const { active, disabled } = buildSources(config)` |
| `buildSources()` | `runPipeline(active, prev, disabled)` | `startRefreshLoop({registry: active, disabledSources: disabled})` | WIRED | `server.ts:55` passes both lists |
| `runPipeline` | per-source serve-stale | `Promise.allSettled + prevEventsFor()` | WIRED | Lines 103,141-143: stale events retained on any rejection |
| `kassirSurAdapter` | disabled list | `buildSources().disabled[]` always includes it | WIRED | Lines 101-106 in registry.ts |
| `yandexAfishaAdapter` | active/disabled conditional | `config.enableYandexAfisha` toggle | WIRED | Lines 95,107-118 in registry.ts |
| `parseDateFull` | afisha-ru/yandex adapters | imported and used in both | WIRED | `afisha-ru/index.ts:41`; `yandex-afisha/index.ts:39`; called at lines 164,152 respectively |
| `NormalizedEvent.hasTime` | `SerializedEvent.hasTime` → `app.js humanizeDate` | `serialize.ts:66` → API → `app.js:24` | WIRED | Serializer maps field; client renders from serialized JSON |
| `#search-input` listener | `applyFilters()` | `addEventListener('input')` at `app.js:351` | WIRED | `searchQuery` set then `renderCards(applyFilters())` called |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `applyFilters()` (search) | `searchQuery` | `ev.target.value.trim().toLowerCase()` on `#search-input` | Yes — user input, no fetch | FLOWING |
| `humanizeDate` (date-only) | `hasTime` | `NormalizedEvent.hasTime` → serializer → API JSON → client | Yes — set by `parseDateFull()` in adapters | FLOWING |
| `kassir-sur` status panel | `status: 'blocked'` | `buildSources().disabled[]` → `runPipeline` T-03-13 path | Yes — hardcoded constraint, not fabricated | FLOWING (intentionally static) |

---

### Behavioral Spot-Checks

Step 7b: Not run against live network (would require starting server). Replaced by test-suite evidence (216/216 pass) and static code analysis above. Key behaviors are fixture-tested:
- `parseAfishaRu` ParseError guard: `index.test.ts:89-100`
- `kassirSurAdapter.scrape()` throws: `index.test.ts:41-48`
- `yandexAfishaAdapter` 403 rethrow: `index.test.ts:164`
- `parseDateFull` Format 3/4/hasTime: covered in `date.test.ts` (part of 216 passing tests)

---

### Probe Execution

No `probe-*.sh` files declared or present in `scripts/*/tests/`. Step 7c: SKIPPED (no probe files for this phase).

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| SRC-04 | afisha.ru/surgut YELLOW adapter, selector guard | SATISFIED | `afisha-ru/index.ts` substantive (289 lines); registered in `buildSources().active[]`; fixture-tested (16 tests) |
| SRC-05 | kassir-sur YELLOW AJAX — honest disabled stub | SATISFIED | `kassir-sur/index.ts` explicit stub with documented reason; never fabricates; surfaces as `blocked` |
| SRC-06 | afisha.yandex.ru disabled-by-default, ToS risk, 403 handling | SATISFIED | `yandex-afisha/index.ts`: `enabled:false`, `tosRisk:true`, 403 → tagged error; toggle via `ENABLE_YANDEX_AFISHA` |
| UI-06 | Client-side keyword text search | SATISFIED | `app.js:116-124`: search in `applyFilters()` before date-chip guard; `#search-input` wired at line 351 |
| UX-01 (folded) | Date-only events show no spurious time (e.g. "05:00") | SATISFIED | `parseDateFull` hasTime field + `humanizeDate` isDateOnly logic; both implemented and connected |

---

### Anti-Patterns Found

Scan of all Phase-3 source files: `afisha-ru/index.ts`, `kassir-sur/index.ts`, `yandex-afisha/index.ts`, `registry.ts`, `config.ts`, `pipeline/run.ts`, `utils/date.ts`, `public/app.js`.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `pipeline/run.ts` | 70 | `return []` | INFO | Guard clause: `prevEventsFor()` returns `[]` when `prev` is `undefined`. This is the correct serve-stale bootstrap behavior, not a stub — it is not a data-rendering return path. |
| `utils/date.ts` | 70, 86, 99, 112, 124, 148, 150 | `return null` | INFO | All are early-exit guards on unrecognised input — the documented contract of `parseDateFull()`. Not stubs. |

**No TBD, FIXME, XXX, or unresolved debt markers found in any Phase-3 file.**

---

### Coverage Note (Per-File Detail)

The overall coverage of **80.93% statements / 85.38% lines** meets the 80% project threshold. Two per-file notes:

1. `sources/afisha-ru/index.ts`: 64.28% statements. Uncovered lines 238-286 are the network-facing `scrape()` method body (robots check + HTTP fetch loop). This code requires live network — not unit-testable without mocking. The critical ParseError guard and parser are unit-tested via fixtures. The per-file shortfall does not affect the passing aggregate.

2. `public/app.js`: Not tracked by v8 coverage (it is served static, not imported by Node). The search logic is therefore not unit-covered. Live browser verification (searching "храм": 37→1 card; clearing: 37 cards) confirms correctness. This is a known gap to address in a future QA phase.

---

### Human Verification Required

No automated check can verify the following without a running browser session. All items have been live-confirmed by the executing team per SUMMARY.md (noted here for completeness, not blocking):

1. **afisha-ru live scrape status**
   - **Test:** Navigate to https://surgut-go.apps.sielom.ru, check source status panel
   - **Expected:** `afisha-ru` shows `error` status (not `live`), reflecting 0 events returned from Next.js-rendered page under anti-bot protection. No stale cache wipe — other sources continue serving events.
   - **Why human:** Live network behavior; afisha.ru anti-bot gate not reproducible in tests.

2. **Date-only cards omit time**
   - **Test:** View any afisha.surguta.ru exhibition card (e.g. "чт, 1 янв" style card)
   - **Expected:** Date shown without time component; no "05:00" artefact.
   - **Why human:** `humanizeDate` + `hasTime` chain verified in code; visual rendering requires browser.

3. **kassir-sur in status panel**
   - **Test:** Open `/api/sources/status` or the UI source panel
   - **Expected:** `kassir-sur` entry with `status: "blocked"` and `reason: "Требует браузера…"`.
   - **Why human:** End-to-end integration from `buildSources` → `runPipeline` → API → UI; confirmed by live deploy only.

---

## Gaps Summary

None. All four success criteria and all five requirements (SRC-04, SRC-05, SRC-06, UI-06, UX-01) are satisfied by substantive, wired, and data-flowing implementation.

**Known Phase-3 Limitations (not failures — accepted and documented in ROADMAP):**

1. **afisha.ru yields 0 live events** — Next.js SSR fragility / SberID anti-bot returns HTML without event cards. The ParseError guard fires correctly (`status: error`), serve-stale is retained, and no fabricated events are produced. SC-1's failure clause is the expected operating mode. Deferred to a future resilience effort (CSS selectors or API discovery).

2. **kassir-sur is permanently blocked** — Fully client-rendered (AJAX). Cannot parse without a headless browser, which violates the `node:20-slim` single-container constraint in AGENTS.md. Correctly deferred to v2.

3. **app.js search not unit-tested** — Client-side JS outside vitest scope. Behavior verified by live browser test. Consider adding Playwright/Puppeteer tests in a future QA phase.

---

_Verified: 2026-06-27T16:30:00Z_
_Verifier: Claude (gsd-verifier) — goal-backward, adversarial stance_
