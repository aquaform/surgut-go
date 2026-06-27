---
phase: 03-yellow-sources-text-search
plan: 5
subsystem: browser-client
tags: [ux, date-fix, search, vanilla-js, ui]
dependency_graph:
  requires: [03-1]
  provides: [UX-01-browser, UI-06]
  affects: [public/app.js, public/index.html, public/app.css]
tech_stack:
  added: []
  patterns: [UTC-midnight inference, client-side filter chain, input event binding]
key_files:
  created: []
  modified:
    - public/app.js
    - public/index.html
    - public/app.css
decisions:
  - humanizeDate(isoString, hasTime) — hasTime===false wins; undefined+UTC-midnight inference suppresses fake 05:00 for cached data
  - searchQuery filter appended at end of applyFilters() chain so all existing filters compose correctly
  - search-input lives inside #filters (hidden until mood tap) — consistent with existing filter UX
metrics:
  duration: 10
  completed_date: "2026-06-27T10:47:49Z"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 3
---

# Phase 03 Plan 5: UX-01 Date-Only Fix + UI-06 Keyword Search Summary

**One-liner:** UTC-midnight inference in humanizeDate kills the fake "05:00" artefact; a full-width search input filters loaded cards by title+venue+reason+tags, case-insensitive, no reload.

## What Was Built

### Task 1 — humanizeDate date-only fix (UX-01 Tier 1) — commit 532fd0c

Changed `humanizeDate(isoString)` to `humanizeDate(isoString, hasTime)` in `public/app.js`.

Precedence logic:
1. `hasTime === false` → always suppress time (explicit flag from adapter)
2. `hasTime === undefined` AND `rawUtcDate.getUTCHours() === 0` AND `rawUtcDate.getUTCMinutes() === 0` → suppress time (UTC-midnight inference for cached/old data without `hasTime` field)
3. Otherwise → show `, HH:MM`

Updated the single call site in `renderCard` to `humanizeDate(e.startDate, e.hasTime)`.

Backward-compatible: `e.hasTime` is `undefined` for any cached event data that predates the `hasTime` field; the UTC-midnight inference fires as fallback, which correctly identifies all afisha-surguta.ru events (stored at `Date.UTC(Y,M,D,0,0,0)` by Format 2 in `parseRussianDate`).

### Task 2 — Client-side keyword search (UI-06) — commit 75d230a

Three files changed:

**public/index.html** — `<input type="search" id="search-input" class="search-input">` added inside `#filters` as the first control, before `.chips`. Has `placeholder`, `aria-label`, `autocomplete="off"`.

**public/app.js** changes:
- `let searchQuery = '';` — module-level state variable (5th reference required by plan)
- `applyFilters()` — new branch after all date-chip logic: when `searchQuery` is non-empty, builds `haystack = [e.title, e.venue, item.reason, e.tags.join(' ')].join(' ').toLowerCase()` and returns `false` if `haystack.indexOf(searchQuery) === -1`
- `loadMood()` — `searchQuery = ''; document.getElementById('search-input').value = '';` resets search on mood change
- `DOMContentLoaded` — `input` event listener: `searchQuery = ev.target.value.trim().toLowerCase(); renderCards(applyFilters());` — no `fetch()`, no reload

**public/app.css** — `.search-row` + `.search-input` rules: full-width block, `border-radius: 8px`, focus ring via `border-color: var(--clr-accent)`, consistent with `.filter-row` controls.

## Verification Results

```
node --check public/app.js          → PASS (no syntax error)
grep -c "searchQuery" public/app.js → 5 (≥4 required)
grep "search-input" public/index.html → FOUND (id + class attributes)
grep "search-input" public/app.css  → FOUND (.search-input, .search-input:focus, ::placeholder)
npm test                             → 209 passed (16 test files) — no regressions
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both features are fully wired. `humanizeDate` uses `e.hasTime` from `SerializedEvent`; the search reads from the already-loaded `currentItems` array.

## Threat Flags

None. Security review confirmed:
- T-03-10: `searchQuery` used only in `.indexOf()` against in-memory data — never sent to server, never inserted into HTML (mitigated as designed)
- T-03-11: All event fields rendered via `escHtml()` — no change to renderCard XSS posture

## Checkpoint Status

**STOPPED at Task 3 (checkpoint:human-verify)** — automated tasks complete, awaiting human visual verification of:
1. Date-only event cards show NO time (no "05:00")
2. Timed event cards keep their real time
3. Search input filters live with no page reload / no network request
4. Mood change clears the search box and resets results

## Self-Check: PASSED

- public/app.js modified: FOUND (532fd0c + 75d230a)
- public/index.html modified: FOUND (75d230a)
- public/app.css modified: FOUND (75d230a)
- Commit 532fd0c exists: VERIFIED
- Commit 75d230a exists: VERIFIED
- 209 tests passing: VERIFIED
