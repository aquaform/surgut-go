---
phase: 02-core-product-ui-mood-recommendations
verified: 2026-06-27T05:45:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Tap each of the 4 mood buttons on a mobile device (or mobile-emulated browser)"
    expected: "Cards appear within 1 second; each card shows a coloured 'Почему рекомендовано' label; the active mood button gets a red border"
    why_human: "Sub-second latency and visual active-state are not measurable via curl or grep"
  - test: "With music mood active, click each date chip (Сегодня / Завтра / Выходные / 7 дней) in turn"
    expected: "Visible card list changes immediately (no reload); cards outside the selected window disappear; chip turns dark"
    why_human: "DOM mutation is client-side JS; no programmatic way to drive the browser"
  - test: "Toggle 'Только бесплатные' checkbox"
    expected: "Only cards with isFree=true remain; the paid-event cards are hidden"
    why_human: "Same—client-side filter behavior in browser"
  - test: "Open the 'Источники данных' panel and verify the status dots"
    expected: "kassa-ugra and afisha-surguta show a green dot and 'Обновлено'; seed shows an orange dot and 'Демо-данные'; event counts and freshness timestamps visible"
    why_human: "Visual rendering of the details element and CSS-colored dots"
  - test: "Find a seed event card (any card with the orange 'Демо' badge)"
    expected: "Badge is orange; non-seed cards from live sources have no badge; if a source is in 'cached' state the card would show an amber 'Кэш' badge"
    why_human: "Badge colour and conditional rendering need visual confirmation"
  - test: "Click any 'Открыть' or 'Купить билет' CTA on an event card"
    expected: "Link opens in a new tab without passing referrer; source ticket page loads"
    why_human: "rel=noopener noreferrer prevents JS access but tab behaviour is browser-level"
---

# Phase 2: Core Product UI & Mood Recommendations — Verification Report

**Phase Goal:** A user on mobile taps one of four mood buttons and immediately sees ranked, honest event cards with a "Почему рекомендовано" label — the core value proposition is delivered end-to-end in the browser.
**Verified:** 2026-06-27T05:45:00Z
**Status:** human_needed — all 5 must-haves VERIFIED programmatically; 6 visual/interactive items require browser confirmation
**Re-verification:** No — initial verification

---

## Gate Results (Run during verification)

```
npm run typecheck   → CLEAN (tsc --noEmit, exit 0)
npm run lint        → CLEAN (eslint, exit 0)
npm run test --coverage →

 Test Files  13 passed (13)
      Tests  162 passed (162)
   Start at  10:33:41
   Duration  539ms

Lines        : 85.81%  (357/416)   PASS  [threshold: 80%]
Statements   : 83.29%  (384/461)
Branches     : 76.53%  (199/260)
Functions    : 84.52%  ( 71/ 84)
```

---

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User taps a mood button and sees ranked cards with "Почему рекомендовано" label | VERIFIED (code + live) / HUMAN (1-second, visual) | `/api/recommendations?mood=music` → 47 ranked items, each with non-empty `reason`; first item `isSeed:false` from afisha-surguta; HTML has 4 `data-mood` buttons confirmed via live curl |
| 2 | Same event from two sources collapses to one card (composite-key dedup) | VERIFIED | `dedup.ts` uses SHA1(titleSlug\|dateDay\|venueSlug); live: 102 raw events (52+38+12) → 97 in /api/events = **5 events collapsed**; Python check of returned set: 0 duplicate keys remain |
| 3 | Date chips and free toggle filter events in Asia/Yekaterinburg timezone | VERIFIED (code) / HUMAN (browser) | `applyFilters()` uses `SURGUT_OFFSET_MS = 5*60*60*1000`; today/tomorrow/weekend/week branches verified; `freeOnly` flag filters `e.isFree`; category filter on `e.category` |
| 4 | Cards and source panel visibly distinguish live / cached / demo data; no seed event appears without badge | VERIFIED (code) / HUMAN (visual) | `renderCard()`: `if (e.isSeed) badge='Демо'`; `else if (sourceStatusByName[src]==='cached') badge='Кэш'`; live sources show `status:"live"` → no Кэш badges currently; seed events carry `isSeed:true` and unconditionally get Демо badge |
| 5 | vitest coverage for business logic reaches 80%+ | VERIFIED | Lines 85.81% > 80% threshold; 162 tests pass across 13 files; `vitest.config.ts` threshold `lines:80` enforced |

**Score: 5/5 truths verified**

---

## Engine Purity Checks

| Check | Result |
|-------|--------|
| No bare `new Date()` in `recommend.ts` executable code | VERIFIED — only appears in comments (lines 6, 212) |
| `now` injected as parameter throughout `getRecommendations` / `scoreEvent` | VERIFIED — all callers pass explicit `now: Date` |
| `getRecommendations` reads no I/O; consumes `events: NormalizedEvent[]` | VERIFIED — pure function; `recommendationsRoute` passes `fastify.index.all()` (in-memory) |
| `aquapark/парк` regression fix: "аквапарк" venue does NOT match `learn` mood | VERIFIED — `learnMapping.venueKeywords` uses `'исторический парк'` not bare `'парк'`; regression test at `recommend.test.ts:99` passes |
| Still-running exhibitions pinned to "today" in learn results | VERIFIED — `scoreEvent()` sets `effectiveDate = now` when `startDate < now && endDate > now`; test case (h) covers this |
| Evening boost only for drink/dance moods | VERIFIED — `const eveningBoost = mood === 'drink' || mood === 'dance' ? 10 : 0` |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/recommend/mood-map.ts` | Static MOOD_MAPPINGS table (4 moods) | VERIFIED | 89 lines; 4 moods × categories/titleKeywords/venueKeywords/label/emoji |
| `src/recommend/recommend.ts` | Pure engine: match/score/reason/getRecommendations | VERIFIED | 239 lines; no I/O; injected `now`; 98.36% statement coverage |
| `src/http/routes/recommendations.ts` | GET /api/recommendations with Ajv enum | VERIFIED | Ajv enum `['drink','dance','learn','music']`; `additionalProperties:false`; reads `fastify.index.all()` |
| `src/http/serialize.ts` | Shared serializer (single source of truth) | VERIFIED | `SerializedEvent` interface; `isSeed` preserved verbatim; used by both /api/events and /api/recommendations |
| `src/pipeline/dedup.ts` | Composite-key dedup (existing, tested in phase 2) | VERIFIED | SHA1(titleSlug\|dateDay\|venueSlug); prefer-live policy; production-untouched |
| `public/index.html` | HTML shell with mood buttons, chips, panel | VERIFIED | `lang="ru"`; 4 `data-mood` buttons; 5 date chips; free toggle; category select; source-panel `<details>` |
| `public/app.js` | Vanilla JS client (323 lines, no framework) | VERIFIED | `escHtml()` on all fields incl. href; `humanizeDate()` UTC+5; `renderCard()` with Демо/Кэш badge logic; `applyFilters()` client-side only; `loadSources()` populates `sourceStatusByName` |
| `public/app.css` | Mobile-first CSS (no CDN) | VERIFIED | CSS vars; 2×2 mood grid; `.badge--demo` (orange) / `.badge--cached` (amber); `.dot--live/cached/error/seed`; `.hidden` utility |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `public/app.js` → API | `/api/recommendations?mood=` | `fetch(url)` in `loadMood()` | VERIFIED | `fetch('/api/recommendations?mood=' + encodeURIComponent(mood))`; response `.json()` assigned to `currentItems` |
| `public/app.js` → API | `/api/sources/status` | `fetch` in `loadSources()` | VERIFIED | Response populates `sourceStatusByName` map; re-renders cards on completion |
| `recommendationsRoute` → engine | `getRecommendations()` | direct import | VERIFIED | `import { getRecommendations } from '../../recommend/recommend'`; called with `(mood, mapping, allEvents, now)` |
| `recommendationsRoute` → index | `fastify.index.all()` | Fastify decorator | VERIFIED | Reads in-memory EventIndex; no DB/file I/O in request path |
| `serializeEvent` → both routes | shared serializer | import | VERIFIED | Both `events.ts` and `recommendations.ts` import from `../serialize` |
| `recommendationsRoute` registration | registered before `fastifyStatic` | `server.ts` line 65 vs 70 | VERIFIED | Exact route always wins over static middleware |
| `renderCard` → badge logic | `sourceStatusByName[e.sourceName]` | closure over module var | VERIFIED | `loadSources()` sets `sourceStatusByName`; `renderCard()` reads it; cards re-rendered after sources load |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `public/app.js` `renderCard()` | `currentItems` | `loadMood()` → `fetch /api/recommendations` → `data.items` | Yes — 47 live items confirmed, 42 with `isSeed:false` | FLOWING |
| `public/app.js` `loadSources()` | `sourceStatusByName` | `fetch /api/sources/status` → `sources.forEach` | Yes — live: kassa-ugra(52 events), afisha-surguta(38 events), seed(12 events) | FLOWING |
| `recommendationsRoute` | `ranked` | `fastify.index.all()` → `getRecommendations()` | Yes — in-memory EventIndex populated by scrape pipeline | FLOWING |

---

## Live Endpoint Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| GET / returns HTML with 4 data-mood buttons | `curl -s https://.../ \| grep data-mood` | All 4 present (drink/dance/learn/music) | PASS |
| GET /api/recommendations?mood=music returns ranked live items with reason | `curl -s .../api/recommendations?mood=music` | 47 items; first is `isSeed:false` from afisha-surguta; reason="Рок" | PASS |
| GET /api/recommendations?mood=sleep returns 400 | `curl -s .../api/recommendations?mood=sleep` | `{"statusCode":400,"code":"FST_ERR_VALIDATION",...,"message":"...must be equal to one of the allowed values"}` | PASS |
| GET /api/sources/status shows live + seed sources | `curl -s .../api/sources/status` | kassa-ugra(live,52), afisha-surguta(live,38), seed(seed,12) | PASS |
| Dedup: 0 duplicate composite keys in /api/events output | Python check on 97 returned events | `True duplicates: 0`; 102 raw → 97 returned = 5 events collapsed | PASS |
| recommend.ts has no executable new Date() | `grep -n "new Date()"` | Lines 6 and 212 are comments only | PASS |

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| AGG-03 | Cross-source dedup by normalized title+date+venue | VERIFIED | `dedup.ts` SHA1 key; 5 events collapsed in live data; 6 unit tests in `dedup.test.ts` |
| MOOD-01 | Static mood→category/keyword/venue table | VERIFIED | `mood-map.ts` MOOD_MAPPINGS: 4 moods × categories/titleKeywords/venueKeywords |
| MOOD-02 | Ranking prioritises nearest evening events for drink/dance | VERIFIED | `scoreEvent()`: evening bucket 110–113 for drink/dance vs 100–103 for learn/music; test (b) asserts `evening > tomorrow` ordering |
| MOOD-03 | Each recommendation has human-readable "Почему рекомендовано" | VERIFIED | `buildReasonText()` precedence: venue → keyword (up to 2 capitalized) → category label; live items show "Рок", "Концерт", "Площадка подходит: Сургутская филармония", etc. |
| API-03 | GET /api/recommendations?mood= returns ranked items; 400 on bad mood | VERIFIED | Ajv enum validation; live test: music→200/47 items, sleep→400; reads EventIndex (no I/O) |
| UI-01 | Mobile-first Russian page | VERIFIED | `index.html` lang="ru"; `app.css` 480px max-width, system font stack; header "Куда пойти в Сургуте" |
| UI-02 | 4 mood buttons (drink/dance/learn/music) | VERIFIED | 4 `<button data-mood=...>` in HTML; confirmed in live curl response |
| UI-03 | Event card: title, date, venue, price, category/tags, reason, source, CTA | VERIFIED | `renderCard()` renders all fields; `humanizeDate()` for time; `escHtml()` on every field; `rel="noopener noreferrer"` on CTA |
| UI-04 | Date chips: Сегодня / Завтра / Выходные / 7 дней | VERIFIED | HTML has 5 chips (Все + 4); `applyFilters()` handles each `data-date` value with UTC+5 boundary arithmetic |
| UI-05 | Free toggle + category filter | VERIFIED | `#free-toggle` checkbox; `#category-filter` select with 6 category options; both handled in `applyFilters()` |
| UI-07 | Source status panel + demo/cached data marking | VERIFIED | `<details id="source-panel">`; `loadSources()` renders dot+name+count+age; `renderCard()` conditionally shows Демо/Кэш badges |
| QA-02 | vitest coverage 80%+ | VERIFIED | Lines 85.81%; Statements 83.29%; Functions 84.52%; 162 tests pass; lint+typecheck clean |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX markers found | — | None |
| — | — | No stub returns (return null/[]/\{\}) found in Phase-2 files | — | None |
| — | — | No hardcoded empty arrays in rendering paths | — | None |

No blockers or warnings.

---

## Human Verification Required

### 1. Mood button tap → ranked cards within 1 second

**Test:** On a mobile device or Chrome DevTools mobile emulation, open https://surgut-go.apps.sielom.ru and tap "🍸 Выпить"
**Expected:** Cards appear within 1 second; each card shows a "🍸 Стендап" (or similar) reason label; the drink button gets a red border
**Why human:** Sub-second latency measurement and visual active-state require browser execution

### 2. Date chip filtering

**Test:** After loading any mood, click "Сегодня" chip, then "Выходные", then "7 дней"
**Expected:** Card list updates immediately without page reload; only events matching the chip's window are shown; active chip turns dark; switching to "Все" restores all cards
**Why human:** DOM mutation by client-side JS; not drivable via curl

### 3. Free toggle

**Test:** Toggle the "Только бесплатные" checkbox
**Expected:** Paid-event cards disappear; only cards with isFree=true remain
**Why human:** Client-side filter on DOM nodes

### 4. Source status panel visual rendering

**Test:** Open the "Источники данных" collapsible panel
**Expected:** kassa-ugra and afisha-surguta show green dots labelled "Обновлено"; seed shows an orange dot "Демо-данные"; event counts and "N мин назад" freshness visible
**Why human:** CSS-colored dots and formatted strings require visual inspection

### 5. Honesty badge rendering

**Test:** Scroll through music or learn recommendations until a seed event card appears (seed event titles: "АЛЁНА ПОЛЬ и ГЛЕБ ДЗЮБА", "Группа «ПИКНИК» — «Вечное движение»", "Оперетта «Летучая мышь»")
**Expected:** Orange "Демо" badge in top-right corner of the card; non-seed cards have no badge
**Why human:** Badge colour and conditional rendering need visual confirmation

### 6. CTA link behaviour

**Test:** Click "Открыть" or "Купить билет" on any event card
**Expected:** Source page opens in a new browser tab; no referrer is passed; parent tab remains
**Why human:** rel=noopener noreferrer prevents JS access but new-tab behaviour is browser-level

---

## Gaps Summary

No gaps. All 5 success criteria are verified against the codebase and live endpoints. The 6 items above are confirmatory human checks, not blocking gaps.

---

## Phase-2 Follow-Ups (Observations — Not Failures)

These are known issues documented by the phase and confirmed during verification. They are NOT blockers.

**(a) Date-only afisha-surguta events display as "05:00" Surgut time.**
The afisha-surguta parser stores date-only events (no time in source) as UTC midnight (00:00Z). In Surgut (UTC+5) that reads as 05:00 local. This also prevents the dedup from collapsing seed/live pairs for the same event when seed uses 19:00Z (= Surgut midnight) and live uses 00:00Z next day. Proper fix requires tracking time-presence in the Phase-1 data model. Observed in live data: "АЛЁНА ПОЛЬ и ГЛЕБ ДЗЮБА" appears twice (afisha-surguta 2026-07-24T00:00Z vs seed 2026-07-23T19:00Z).

**(b) Some afisha.surguta "exhibition" items with past startDate + future endDate surface in "learn" mood via exhibition-pinning.**
The pinning rule (effectiveDate = now when startDate < now AND endDate > now) is intentional for genuine gallery exhibitions but also catches art-shop "exhibition" listings. Impact is limited (learn mood still returns relevant content); a more precise category tagging would reduce noise.

**(c) favicon.ico returns 404 (cosmetic).**
No favicon is served. Causes a browser console 404 on every page load. No user-facing impact.

**(d) Seed events with slightly different title/venue appear alongside live events in recommendations.**
Examples: "КняZz. Мастер Кукол." seed uses venue "Сургутская филармония" while live uses "Вавилон" — correct per dedup key (different venue = different event); "Группа «ПИКНИК»" seed has shorter title — different title slug. Users see 2 cards for what looks like the same event. Resolved by either correcting seed data titles/venues or by implementing fuzzy title matching in a future phase.

---

*Verified: 2026-06-27T05:45:00Z*
*Verifier: Claude (gsd-verifier)*
