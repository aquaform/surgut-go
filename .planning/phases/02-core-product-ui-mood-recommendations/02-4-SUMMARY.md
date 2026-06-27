---
phase: 02-core-product-ui-mood-recommendations
plan: 4
subsystem: browser-ui
tags: [html, css, vanilla-js, mobile-first, xss-safety, honesty-badges]
dependency_graph:
  requires: [02-3]
  provides: [public/index.html, public/app.js, public/app.css]
  affects: [GET /, GET /app.css, GET /app.js, UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, QA-02]
tech_stack:
  added: []
  patterns:
    - Static HTML shell with client fetch (no SSR, no bundler)
    - escHtml() entity-escape before every innerHTML assignment
    - sourceStatusByName map for Кэш badge without re-fetching
    - UTC+5 offset arithmetic in surgutDate() for Surgut local time
key_files:
  created:
    - public/app.css
    - public/app.js
  modified:
    - public/index.html
decisions:
  - Кэш badge driven by sourceStatusByName map populated once at page load; re-render on cards after loadSources() updates the map
  - CTA href escaped via escHtml(e.sourceUrl) — covers javascript: and data: URI injection vectors
  - priceText also escaped even though it is server-controlled, per belt-and-suspenders XSS policy
  - loadSources() re-renders visible cards after populating sourceStatusByName so badges appear immediately
metrics:
  duration: 12min
  completed: 2026-06-27
  tasks_completed: 3
  tasks_total: 4
  checkpoint_remaining: true
---

# Phase 02 Plan 4: Mobile UI Shell + Honesty Badges — Summary

**One-liner:** Mobile-first Russian city-navigator HTML shell with vanilla-JS fetch, isSeed/Кэш honesty badges, XSS-safe escHtml(), and client-side date/free/category filters.

## What Was Built

Three files replace the placeholder homepage and deliver the browser slice of the vertical product slice:

- **`public/index.html`** — Russian mobile shell (lang="ru") with 4 mood buttons (`data-mood` drink/dance/learn/music), date chips (Все/Сегодня/Завтра/Выходные/7 дней), free toggle, category select, `#results` main, and `#source-panel` details. Linked to `/app.css` in head and `/app.js` before body close.

- **`public/app.css`** — ~160 lines of mobile-first CSS: CSS variables, 2×2 mood grid, horizontal-scroll chip row, event card with all sub-elements, `.badge--demo` (orange) / `.badge--cached` (amber) honesty badges, `.dot--live/cached/error/blocked/seed` status dots, and `.hidden` utility. No web fonts, no framework, no CDN.

- **`public/app.js`** — 323-line vanilla-JS client (strict mode, no imports, no framework):
  - `escHtml(s)`: 4-entity replacement applied to every field before innerHTML use, including `e.sourceUrl` (CTA href).
  - `humanizeDate(isoString)`: Returns "Сегодня/Завтра/пн, 4 июл, 20:00" using UTC+5 arithmetic.
  - `sourceStatusByName` map: populated by `loadSources()` from `/api/sources/status`; drives the Кэш badge in `renderCard()`.
  - `renderCard(item)`: Демо badge when `e.isSeed === true`; Кэш badge when `sourceStatusByName[e.sourceName] === 'cached'`; otherwise no badge.
  - `applyFilters()`: Client-side only — no refetch on date/free/category change.
  - `loadMood(mood)`: Fetches `/api/recommendations?mood=<mood>`, shows loading/error states, renders all cards.
  - `loadSources()`: Fetches `/api/sources/status`, renders dot+name+count+freshness list, re-renders cards so badges update immediately.
  - DOMContentLoaded handler wires all controls.

## QA-02 Coverage Gate

```
Test Files  13 passed (13)
Tests       161 passed (161)

Lines:      85.81% (357/416)  — PASS (threshold: 80%)
Statements: 83.29% (384/461)
Branches:   76.53% (199/260)
Functions:  84.52% (71/84)
```

vitest.config.ts threshold (`lines: 80`) is unchanged. Zero test failures.

## Deviations from Plan

### Auto-added (not deviations — correctness requirements)

**[Rule 2 - Security] escHtml applied to priceText**
- The research sketch omitted `escHtml(e.priceText)` — added per belt-and-suspenders XSS policy.
- **Files:** public/app.js (line ~161)

**[Rule 2 - Security] escHtml applied to source displayName in loadSources()**
- The research sketch inserted `src.displayName` raw into innerHTML — escaped to prevent potential XSS.
- **Files:** public/app.js (loadSources rendering)

None of the above required plan changes — all are covered by the threat model T-02-07 mitigate disposition.

### Plan order deviation

Task 4 (QA-02 coverage gate) was executed before Task 3 (human-verify checkpoint) per the orchestrator's explicit instruction: "Execute through the build + coverage gate. When you reach the human-verify checkpoint task, STOP."

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1: HTML shell + CSS | 8c45eaa | public/index.html (replaced), public/app.css (new) |
| 2: Vanilla client JS | 6693bb0 | public/app.js (new) |
| 4: QA-02 gate | (no file changes — gate passed without additions) | — |

## Known Stubs

None. The UI fully consumes real API endpoints and renders real data.

## Threat Flags

No new security surface beyond the threat model. All T-02-07/08/09/10 mitigations confirmed implemented:
- T-02-07: escHtml() wraps every field including href
- T-02-08: rel="noopener noreferrer" on every CTA anchor
- T-02-09: isSeed badge rendered unconditionally when true
- T-02-10: No Fastify route added for GET / — static serving intact

## Checkpoint Status

**Task 3 (human-verify) is PENDING.** The plan is NOT marked complete in ROADMAP.md. The orchestrator must run `/deploy` and confirm visual rendering, mood flow, filters, source panel, and honesty badges before the plan is closed.

## Self-Check: PASSED

All created files confirmed present. Commits 8c45eaa (Task 1) and 6693bb0 (Task 2) verified in git log. Coverage 85.81% > 80% threshold.
