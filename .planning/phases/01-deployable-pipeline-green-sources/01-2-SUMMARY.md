---
phase: 01-deployable-pipeline-green-sources
plan: 01-2
subsystem: utils
tags: [typescript, vitest, date-parsing, price-parsing, http, robots, p-retry, tdd]

# Dependency graph
requires:
  - 01-1 (project scaffold, tsconfig, vitest, p-retry and robots-parser installed)
provides:
  - parseRussianDate(text, refYear?) → Date|null covering all 4 observed formats
  - parseRussianPrice(raw) → ParsedPrice with isFree, minRub, maxRub, displayText
  - fetchHtml(url, timeoutMs?) → string with p-retry + charset + User-Agent + timeout
  - isAllowed(url) → boolean via robots-parser with per-origin cache
affects:
  - 01-3 (kassa-ugra parser imports parseRussianDate + parseRussianPrice + fetchHtml)
  - 01-4 (afisha-surguta parser same; also imports isAllowed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED/GREEN cycle: test file committed RED before implementation
    - UTC+5 offset only applied when explicit local time is known (Format 1); date-only formats stored as UTC midnight on same calendar date
    - p-retry v8 onFailedAttempt receives RetryContext{error, attemptNumber, …}, not FailedAttemptError
    - robots.txt cache is per-origin Map (stateless, clearable for tests)

key-files:
  created:
    - src/utils/date.ts
    - src/utils/date.test.ts
    - src/utils/price.ts
    - src/utils/price.test.ts
    - src/utils/http.ts
    - src/utils/robots.ts
  modified: []

key-decisions:
  - "Date-only formats (no explicit time) stored as UTC midnight on same calendar date — not offset to UTC+5, because exact event time is unknown for these formats"
  - "p-retry v8 API: onFailedAttempt receives RetryContext destructured as {error, attemptNumber} — auto-fixed during Task 3 typecheck"
  - "crawl-delay enforcement is left to each source adapter, not to robots.ts — keeps the robots layer stateless and testable without timing"
  - "clearRobotsCache() exported from robots.ts for test isolation and long-running process use"

# Metrics
duration: 3min
completed: 2026-06-27
---

# Phase 01 Plan 2: Russian Date/Price Parsing + Polite HTTP Layer Summary

**TDD-built parseRussianDate + parseRussianPrice (20 tests, all green) and polite fetchHtml/isAllowed layer covering all observed kassa-ugra + afisha.surguta formats**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-26T20:09:40Z
- **Completed:** 2026-06-26T20:12:35Z
- **Tasks:** 3 (2 TDD, 1 implementation)
- **Files created:** 6

## Accomplishments

- 20 vitest tests written test-first and passing green for all observed date and price formats from both GREEN sources
- parseRussianDate covers: abbreviated (kassa-ugra listing), full genitive (afisha.surguta), genitive+comma+year (kassa-ugra headers), date ranges (afisha.surguta exhibitions), missing-year inference (month < current → next year), relative labels (сегодня/завтра)
- parseRussianPrice covers: space-separated ranges, tight ranges, single prices, Russian suffix (руб.), thousands with space (33 000 ₽), free-entry detection (бесплатно/Вход свободный), empty/no-digits → "Цена не указана"
- fetchHtml: native fetch wrapped in pRetry(retries:2, 1–4s), AbortSignal.timeout(10s), descriptive User-Agent, windows-1251 charset decode, throws on non-2xx
- isAllowed: robots-parser per-origin cache, default-to-allowed when robots.txt unreachable
- typecheck exits 0, full vitest suite passes (20/20)

## Task Commits

| Task | Description | Commit | Type |
|------|-------------|--------|------|
| Task 1 RED | Failing tests for parseRussianDate | `3698fa5` | test |
| Task 1 GREEN | parseRussianDate implementation | `0b0c657` | feat |
| Task 2 RED | Failing tests for parseRussianPrice | `8bd004d` | test |
| Task 2 GREEN | parseRussianPrice implementation | `77b653d` | feat |
| Task 3 | fetchHtml + isAllowed (http + robots) | `8f82f8e` | feat |

## Files Created/Modified

- `src/utils/date.test.ts` — 10 vitest cases: all 4 formats + relative labels + year-boundary + null path
- `src/utils/date.ts` — parseRussianDate, RU_MONTHS, SURGUT_UTC_OFFSET, toUTC, inferYear
- `src/utils/price.test.ts` — 10 vitest cases: ranges, single, rubles suffix, thousands, free variants, empty
- `src/utils/price.ts` — ParsedPrice interface, parseRussianPrice, FREE_PATTERNS regex
- `src/utils/http.ts` — fetchHtml with pRetry + AbortSignal.timeout + windows-1251 decode; DEFAULT_HEADERS exported
- `src/utils/robots.ts` — isAllowed with robots-parser + per-origin Map cache + clearRobotsCache()

## Decisions Made

- UTC+5 offset applied ONLY for Format 1 (explicit time known); Format 2 (date-only) stored as UTC midnight on the same calendar date, matching test expectations that `getUTCDate()` equals the source date number
- p-retry v8 changed `onFailedAttempt` parameter from `FailedAttemptError` to `RetryContext` — auto-fixed (Rule 1)
- Crawl-delay enforcement NOT in robots.ts — adapters are responsible per their robots.txt; afisha-surguta adapter enforces 10s, kassa-ugra enforces 2s inter-page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] p-retry v8 onFailedAttempt API change**
- **Found during:** Task 3 typecheck
- **Issue:** `onFailedAttempt: (err) => { ... err.attemptNumber ... err.message }` — TypeScript error: `Property 'message' does not exist on type 'RetryContext'`. p-retry v8 changed the callback parameter from `FailedAttemptError` (extends Error) to `RetryContext` object with a nested `error` field.
- **Fix:** Changed callback signature to `({ error, attemptNumber }) => { ... error.message ... }` — destructures the RetryContext correctly.
- **Files modified:** `src/utils/http.ts`
- **Commit:** Inline fix in `8f82f8e` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (p-retry API mismatch, low severity)

## TDD Gate Compliance

Both TDD tasks follow the correct RED/GREEN sequence:
1. `test(01-2): RED parseRussianDate` commit `3698fa5` precedes `feat(01-2): implement parseRussianDate` commit `0b0c657` ✓
2. `test(01-2): RED parseRussianPrice` commit `8bd004d` precedes `feat(01-2): implement parseRussianPrice` commit `77b653d` ✓

## Known Stubs

None — all exported functions are fully implemented with passing tests.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced beyond what the plan's threat model already covers (T-01-02 SSRF-safe by construction; T-01-03 polite rate-limiting applied).

## Next Phase Readiness

- Plans 01-3 (kassa-ugra parser) and 01-4 (afisha-surguta parser) can now import `parseRussianDate`, `parseRussianPrice`, `fetchHtml`, and `isAllowed` from `src/utils/`
- All utilities fully typed; typecheck green
- 20 unit tests provide regression coverage for every format observed in live source HTML
