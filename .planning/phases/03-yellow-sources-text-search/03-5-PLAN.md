---
phase: 03-yellow-sources-text-search
plan: 5
type: execute
wave: 2
depends_on: ["03-1"]
files_modified:
  - public/index.html
  - public/app.js
  - public/app.css
autonomous: false
requirements: [UI-06, UX-01]
must_haves:
  truths:
    - "Date-only events (UTC midnight) display the date with NO time — the fake '05:00' is gone"
    - "Events with an explicit hasTime:false render date-only; hasTime:true (or a real non-midnight time) render date + time"
    - "A search input in #filters filters visible cards by keyword over title+venue+reason+tags, case-insensitive Russian, with no page reload and no extra network request"
    - "Changing mood resets the search query and clears the input"
  artifacts:
    - path: "public/index.html"
      provides: "search-input inside #filters"
      contains: "search-input"
    - path: "public/app.js"
      provides: "humanizeDate(isoString, hasTime) date-only fix + searchQuery filter branch + input binding + reset"
      contains: "searchQuery"
    - path: "public/app.css"
      provides: "styling for .search-row / .search-input"
  key_links:
    - from: "public/app.js search-input listener"
      to: "applyFilters → renderCards"
      via: "input event updates searchQuery then re-renders"
      pattern: "searchQuery"
    - from: "public/app.js humanizeDate"
      to: "e.hasTime / UTC-midnight inference"
      via: "date-only detection"
      pattern: "getUTCHours\\(\\)\\s*===\\s*0"
---

<objective>
Phase Goal (user story): As a Surgut resident, I want events without a known start time to show just the date (not a misleading "05:00"), and I want to type a keyword to narrow the list instantly, so that the times I see are trustworthy and I can find a specific event fast.

This plan delivers the browser half of UX-01 (the visible "05:00" fix) and UI-06 (client-side keyword search). Both are pure vanilla-JS changes to the existing `public/` client — no framework, no build step, no new network calls. `humanizeDate` gains a `hasTime` parameter and a UTC-midnight inference fallback so date-only events (all afisha.surguta.ru events and future date-only adapter events) stop showing a fabricated time, while cached data without the flag still renders correctly. UI-06 adds one search input, one state variable, one branch in `applyFilters()`, and a reset on mood change.

Purpose: Make displayed times honest and let users filter the loaded list by keyword.
Output: search input + styling, humanizeDate date-only fix, search filter + binding + reset. Owns all of public/* (no contention).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/03-yellow-sources-text-search/03-RESEARCH.md

<interfaces>
From public/app.js — humanizeDate(isoString) (currently 1 arg; called once in renderCard as humanizeDate(e.startDate)); surgutDate(utcDate); applyFilters() returns currentItems.filter(...); loadMood(mood) resets activeDateChip/freeOnly/activeCategory; currentItems = [{ event: SerializedEvent, reason: string }]; escHtml(s). Module-level state declared near top (activeMood, activeDateChip, freeOnly, activeCategory).
From src/http/serialize.ts (03-1) — SerializedEvent now includes hasTime: boolean | undefined.
From public/index.html — #filters section contains .chips then .filter-row; results in <main id="results">.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix date-only time display in humanizeDate (UX-01 Tier 1)</name>
  <files>public/app.js</files>
  <read_first>
    - public/app.js (humanizeDate lines ~20-43, renderCard call site ~170)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (section "UX-01: Date-Only Time Display Fix", "Tier 1", "Precedence in humanizeDate")
  </read_first>
  <action>
    Change `humanizeDate(isoString)` to `humanizeDate(isoString, hasTime)`. Compute `isDateOnly = hasTime === false || (hasTime === undefined && rawUtcDate.getUTCHours() === 0 && rawUtcDate.getUTCMinutes() === 0)` where `rawUtcDate = new Date(isoString)` (raw UTC, NOT surgutDate-shifted). Build `timeStr` as `''` when `isDateOnly`, else the existing `, HH:MM` from the surgut-shifted date. Keep the Сегодня/Завтра/`day, D mon` branches unchanged otherwise. Update the single call site in renderCard to `humanizeDate(e.startDate, e.hasTime)` (e.hasTime is undefined for old cached data → inference fallback fires; backward compatible). Precedence: explicit hasTime:false always wins; undefined falls back to UTC-midnight inference; otherwise show time.
  </action>
  <acceptance_criteria>
    - `grep -n "humanizeDate(e.startDate, e.hasTime)" public/app.js` shows the updated call site
    - `grep -n "getUTCHours() === 0" public/app.js` shows the inference guard
    - `node --check public/app.js` passes (no syntax error)
  </acceptance_criteria>
  <verify>
    <automated>node --check public/app.js</automated>
  </verify>
  <done>humanizeDate accepts hasTime, suppresses time for date-only/UTC-midnight events, and is called with e.hasTime; no fabricated "05:00".</done>
</task>

<task type="auto">
  <name>Task 2: Add client-side keyword search (UI-06)</name>
  <files>public/index.html, public/app.js, public/app.css</files>
  <read_first>
    - public/app.js (applyFilters ~88-114, loadMood reset block ~202-237, DOMContentLoaded bindings ~290-323)
    - public/index.html (#filters section lines 24-47)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (section "UI-06: Text Search" — design, fields searched, reset on mood change, Russian toLowerCase)
  </read_first>
  <action>
    In public/index.html, add inside `#filters` (before `.chips`) a `.search-row` containing `<input type="search" id="search-input" class="search-input" placeholder="Поиск по названию, месту…" aria-label="Поиск событий" autocomplete="off">`. In public/app.js: declare module-level `let searchQuery = '';` (lowercased; '' = no filter). In `applyFilters()`, after the existing free/category/date filters, add a branch: when `searchQuery` is non-empty, build `haystack = [e.title, e.venue, item.reason, e.tags.join(' ')].join(' ').toLowerCase()` and `return false` if `haystack.indexOf(searchQuery) === -1`. Do NOT search sourceName, category, or priceText (those have dedicated controls). In `loadMood()`, reset `searchQuery = ''` and set `document.getElementById('search-input').value = ''`. In DOMContentLoaded, bind the input's `input` event: `searchQuery = ev.target.value.trim().toLowerCase(); renderCards(applyFilters());` — no fetch, no reload. Add `.search-row`/`.search-input` styling to public/app.css (full-width mobile input, consistent with existing filter controls).
  </action>
  <acceptance_criteria>
    - `grep -n "search-input" public/index.html` shows the input inside #filters
    - `grep -n "searchQuery" public/app.js` shows declaration, applyFilters branch, loadMood reset, and the input binding (≥4 hits)
    - search branch references title, venue, reason, and tags; not sourceName/category/priceText
    - No `fetch(` added in the search binding (no extra network)
    - `node --check public/app.js` passes; `.search-input` rule present in public/app.css
  </acceptance_criteria>
  <verify>
    <automated>node --check public/app.js && grep -q "search-input" public/index.html && grep -c "searchQuery" public/app.js && grep -q "search-input" public/app.css</automated>
  </verify>
  <done>A keyword search input filters visible cards over title+venue+reason+tags, case-insensitive, no reload/network, and resets on mood change.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of date display + search</name>
  <files>public/index.html, public/app.js</files>
  <action>
    Pause for human visual verification of the UX-01 date fix and the UI-06 search in the running UI, following the how-to-verify steps below. This checkpoint confirms rendered behavior (time strings and live filtering) that the DOM-free automated checks cannot assert. Build and boot the server first, then hand off to the operator.
  </action>
  <what-built>UX-01 date-only fix (no "05:00") and UI-06 keyword search in the live UI.</what-built>
  <how-to-verify>
    1. Run `npm run build && node server.js` (or `npm run dev`) and open http://localhost:3000 on a narrow/mobile viewport.
    2. Tap any mood button. Confirm afisha.surguta.ru / date-only event cards show a date with NO ", 05:00" (date-only), while kassa-ugra timed events still show their real time.
    3. Type a Russian keyword (e.g. a venue like "Вавилон" or part of a title) in the search box. Confirm the visible cards filter instantly with no page reload and no network request (DevTools Network tab stays idle).
    4. Clear the box → all cards return. Switch mood → search box clears and resets.
  </how-to-verify>
  <verify>
    <human-check>Operator confirms date-only cards show no time, timed cards keep their time, and search filters live without reload/network.</human-check>
  </verify>
  <done>Operator approves the date display and search behavior, or files specific issues to fix.</done>
  <resume-signal>Type "approved" or describe what looked wrong.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user keyboard → search filter | User-supplied query string used only in-browser |
| event fields → DOM | Scraped strings inserted via innerHTML |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-10 | Tampering/XSS | searchQuery used in DOM | mitigate | searchQuery used only in String.indexOf against in-memory data; never inserted into HTML, never sent to server or a URL |
| T-03-11 | Information Disclosure/XSS | scraped title/venue rendered | accept | renderCard already wraps every field in escHtml() before innerHTML |
| T-03-SC | Tampering | npm/pip/cargo installs | accept | Zero new packages (RESEARCH Package Legitimacy Audit) — gate N/A |
</threat_model>

<verification>
- `node --check public/app.js` passes
- search-input present in index.html and styled in app.css
- Human checkpoint confirms no "05:00" on date-only cards and instant no-reload search
</verification>

<success_criteria>
Date-only events show date only (UX-01 visible fix); keyword search filters loaded cards case-insensitively in Russian with no reload or network and resets on mood change (UI-06).
</success_criteria>

<output>
Create `.planning/phases/03-yellow-sources-text-search/03-5-SUMMARY.md` when done.
</output>
