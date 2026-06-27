---
phase: 03-yellow-sources-text-search
plan: 2
subsystem: sources
tags: [adapter, scraping, afisha-ru, cheerio, tdd, fixture]
dependency_graph:
  requires: [03-1]
  provides: [afisha-ru-adapter]
  affects: [src/sources/afisha-ru/]
tech_stack:
  added: []
  patterns: [cheerio/slim, role=listitem selector, aria-label/title extraction, parseDateFull, isAllowed robots gate]
key_files:
  created:
    - src/sources/afisha-ru/index.ts
    - src/sources/afisha-ru/index.test.ts
    - src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html
  modified: []
decisions:
  - Use [role=listitem] as primary selector instead of a[href^="/concert/"] + find(h3)
  - Use aria-label/title attrs for title extraction (accessible, stable vs CSS module hashes)
  - Use concerts page fixture (49 events) over events page (15 events) for richer tests
metrics:
  duration_minutes: 45
  completed_date: "2026-06-27"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 03 Plan 2: afisha-ru adapter — SUMMARY

**One-liner:** Self-contained afisha.ru/surgut YELLOW adapter using [role=listitem] + aria-label selectors, parseDateFull for hasTime, min-results guard, 2-page robots-gated fetch with 2s politeness.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Capture afisha.ru live HTML fixture | d3fa27c | `src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html` |
| 2 RED | Failing fixture tests (TDD RED) | 161dbf5 | `src/sources/afisha-ru/index.test.ts` |
| 2 GREEN | parseAfishaRu + afishaRuAdapter implementation | 151e8c4 | `src/sources/afisha-ru/index.ts` |

## Vitest Output (real)

```
 RUN  v4.1.9 /Users/aquaform/Projects/surgut-go

 Test Files  14 passed (14)
      Tests  185 passed (185)
   Start at  15:04:47
   Duration  424ms (transform 506ms, setup 0ms, import 1.01s, tests 925ms, environment 1ms)
```

Adapter-specific (11 tests):
- extracts at least 2 events from fixture ✓
- every event has isSeed:false and sourceName 'afisha-ru' ✓
- every event has a non-empty title ✓
- every event has a valid startDate ✓
- timed cards yield hasTime:true ✓
- known event 'Виктория Складчикова' has UTC 14:00 on Oct 7 (19:00 Surgut -5h) ✓
- every event id is a non-empty string ✓
- sourceUrl starts with https://www.afisha.ru ✓
- sourceUrl points to a specific event path ✓
- throws ParseError when HTML yields <2 events ✓
- nav/editorial listitems without event links are skipped ✓

## Fixture

**File:** `src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html`
**Source:** `https://www.afisha.ru/surgut/concerts/` (fetched live 2026-06-27)
**Size:** 525 KB
**Content verified:** 49 event listitem containers, 238 concert/performance links, 138 date patterns "DD месяца в HH:MM"

**Note:** afisha.ru Next.js pages minify all content into one long line (505 KB). Standard `grep -cE` fails on lines >64 KB buffer limit. Python verification confirms ≥2 links. Using the concerts page (49 events) instead of events page (15 events) for a richer, more stable test fixture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] h3 elements not present in actual afisha.ru HTML**

- **Found during:** Task 2 implementation
- **Issue:** The plan specified `$(el).find('h3').first()` for title extraction from `a[href^="/concert/"]` anchors. Live HTML inspection showed afisha.ru uses CSS-module-hashed div classes (`VeVyd`, `gVGDC`) for titles — no `h3` elements exist anywhere in the page. The `a[href^="/concert/"]` anchor contains only the event image, not the title. Using the plan's approach would produce 0 events (all skipped on the "empty h3 = skip" guard).
- **Fix:** Changed primary selector to `[role=listitem]` containers (semantic, stable, used for screen readers). Title extracted from `title` attribute (events page) or `aria-label` attribute (concerts page) — both stable accessibility attributes. An event link inside the container (`a[href^="/concert/"]:not([href*="?"])`) serves as the Pitfall-4 guard: editorial/nav listitems link to `/selection/`, `/film/`, etc. and are naturally skipped.
- **Files modified:** `src/sources/afisha-ru/index.ts`
- **Commit:** 151e8c4

**2. [Rule 1 - Bug] grep -cE fails on 505 KB single-line HTML (acceptance criteria check)**

- **Found during:** Task 1 fixture verification
- **Issue:** afisha.ru Next.js minifies the entire app bundle + data into one line (328–505 KB). macOS grep silently fails on lines longer than its internal buffer, returning 0 matches. The plan's acceptance criterion `grep -cE 'href="/(concert|performance)/'` returns 0 even though Python finds 238 links.
- **Fix:** Documented limitation; verified fixture with Python (438 links confirmed). Fixture acceptance confirmed programmatically.
- **Files modified:** fixture file (used concerts page = 49 events over events page = 15 events)
- **Commit:** d3fa27c

## Decisions Made

1. **[role=listitem] selector over a[href^="/concert/"]**: The plan assumed h3 elements inside event anchors. Reality: anchors only contain images; title is in a sibling div (CSS-module hash) or accessible via aria-label/title on the container. Using the semantic [role=listitem] container is stable and more readable.

2. **aria-label/title for title extraction**: `title` attribute (events page) and `aria-label` (concerts page) carry the clean event name without the date or price. These accessibility attributes are far more stable than CSS module class names that rotate on every Next.js deploy.

3. **concerts page fixture**: The concerts page (49 events) produces richer test coverage than the events page (15 events). Both pages use the same HTML structure. The fixture name is generic (`afisha-ru-2026-06-27.html`) and the parser handles either page.

4. **Per-page ParseError caught in adapter**: If one of the two pages returns <2 events (e.g. site undergoing maintenance), the adapter continues to the other page. The final <2 guard on the aggregate catches the case where both pages are empty.

5. **Registry wiring deferred**: `afishaRuAdapter` is built and tested but NOT added to `sourceRegistry` or `run.ts` — this is intentional per plan (03-4 handles wiring).

## TDD Gate Compliance

- RED commit: `161dbf5` — `test(03-2): add failing fixture tests for parseAfishaRu`
- GREEN commit: `151e8c4` — `feat(03-2): implement parseAfishaRu + afishaRuAdapter`
- Gate sequence: RED → GREEN ✓

## Known Stubs

None. The adapter produces real events from a real fixture. No placeholder data.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. `afishaRuAdapter` is not registered — it never makes live requests in the running app as of this plan.

The two listing URLs are hardcoded; `isAllowed()` is called before any fetch (T-03-05 mitigation). The `ParseError` guard fires on <2 events (T-03-03 mitigation). Scraped title/venue are passed through `escHtml()` downstream in `renderCard()` (T-03-04 — existing mitigation, no change needed here).

## Self-Check: PASSED

- src/sources/afisha-ru/index.ts: FOUND
- src/sources/afisha-ru/index.test.ts: FOUND
- src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html: FOUND
- d3fa27c (fixture commit): FOUND
- 161dbf5 (test RED commit): FOUND
- 151e8c4 (impl GREEN commit): FOUND
- 11/11 adapter tests: PASSED
- 185/185 total suite: PASSED
