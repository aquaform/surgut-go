# Phase 3: Yellow Sources & Text Search — Research

**Researched:** 2026-06-27
**Domain:** Russian afisha scraping (YELLOW sources), client-side text search, date-only event display fix
**Confidence:** HIGH for source verdicts (all three sources probed live 2026-06-27); HIGH for UX-01 and UI-06 (codebase fully read); MEDIUM for afisha.ru selector stability (no CSS class names reachable via WebFetch)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRC-04 | afisha.ru/surgut parser with selector-fragility guard | Live-probed 2026-06-27; structure documented; cheerio selectors specified; min-results guard required |
| SRC-05 | sur.kassir.ru parser; AJAX pagination handled without headless browser | Live-probed 2026-06-27; all static HTML pages have 0 events; recommend `enabled:false`; full evidence below |
| SRC-06 | afisha.yandex.ru/surgut parser; disabled by default; HTTP 403 → blocked | Live-probed; events in SSR HTML; ToS §3.1 quoted; design specified |
| UI-06 | Keyword text search over loaded event cards; client-side; no page reload | Existing applyFilters() pattern studied; design fully specified |
| UX-01 | Fix "every date-only event shows 05:00" — folded-in fix per user request | Root cause confirmed in date.ts + humanizeDate; dual solution documented |
</phase_requirements>

---

## Summary

Three YELLOW sources were probed live. The feasibility split is sharper than prior research suggested:

**afisha.ru/surgut** (SRC-04): Confirmed SSR — real events appear in initial HTML. First event live: "Подыскиваю жену, недорого!" at Театр СурГУ, 23 октября в 19:00, от 2000 ₽. No `__NEXT_DATA__`, no JSON-LD. Selectors must use href-pattern matching (`a[href^="/concert/"]`, `a[href^="/performance/"]`), which is fragile but implementable. New date format "DD месяца в HH:MM" (with "в" separator) requires adding to `parseRussianDate`. The min-results guard (HTTP 200 + <2 events → throw ParseError) is the primary safety net. Verdict: **YELLOW — implement**.

**sur.kassir.ru** (SRC-05): Confirmed fully AJAX-rendered across ALL tested pages: `/bilety-na-koncert`, `/bilety-v-teatr`, `/detskaya-afisha`, and even the date-filtered `/bilety-na-koncert/segodnya`. Every page shows "Найдено N событий" but delivers zero event cards in static HTML. No public API endpoint discoverable. Verdict: **RED for Phase 3 — ship `enabled: false` with documented reason. Do not block the phase.**

**afisha.yandex.ru/surgut** (SRC-06): Confirmed SSR with events visible. First event: "Пикник" at Дворец искусств «Нефтяник», 15 сентября, 19:00, от 3 500 ₽. New date format "DD месяца, HH:MM" (comma-separated time). Only `/surgut` root works — `/surgut/concerts` returns 404. Yandex ToS §3.1 explicitly permits Yandex to block automated access without notice. Design: `enabled: false`, `tosRisk: true`. Verdict: **YELLOW — ship disabled by default**.

**UX-01 (date-only time fix)**: Root cause confirmed. `parseRussianDate` stores date-only events at UTC midnight (correct and documented). `humanizeDate` in `app.js` adds 5h Surgut offset → shows "05:00" for all date-only events. Two-tier fix: (1) immediate UI inference from raw UTC midnight — zero server changes, zero test risk; (2) add optional `hasTime?: boolean` to `NormalizedEvent` so new adapters carry explicit semantics. Both are in-scope for Phase 3.

**UI-06 (text search)**: Client-side only. Plugs directly into the existing `applyFilters()` function in `public/app.js`. One new module-level state variable, one `<input>` in HTML, one branch in the filter chain.

**Primary recommendation:** Implement SRC-04 and SRC-06 as described. Ship SRC-05 as a disabled stub (no scraping code needed — just a registry entry with `enabled: false` and a comment). Fix UX-01 with the dual approach. Add UI-06 as the final wave.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| afisha.ru scraping (SRC-04) | API / Backend (cheerio + fetchHtml) | — | Same as GREEN adapters; pipeline already isolates failures |
| afisha.yandex.ru scraping (SRC-06) | API / Backend (cheerio + fetchHtml) | — | Same; HTTP 403 already flows to SourceStatus "blocked" via existing error path |
| sur.kassir.ru (SRC-05, disabled) | API / Backend (registry entry only) | — | Stub with enabled:false; no HTTP, no parsing |
| `hasTime` field (UX-01, model) | API / Backend (NormalizedEvent + SerializedEvent) | — | Server owns the schema |
| Date-only display fix (UX-01, UI) | Browser / Client (app.js humanizeDate) | — | Pure client-side, no server change for minimal fix |
| Text search (UI-06) | Browser / Client (app.js applyFilters) | — | Filters already-loaded items; no new network or server work |

---

## Source Feasibility — Live Probe Results (2026-06-27)

### Master Verdict Table

| Source | HTTP | robots.txt | Data in static HTML | Structured data | Verdict |
|--------|------|-----------|---------------------|-----------------|---------|
| afisha.ru/surgut/events/ | 200 OK | ALLOWED `/surgut/events/`, `/surgut/concerts/` | YES — ~24 events SSR | None (no `__NEXT_DATA__`, no JSON-LD) | **YELLOW — implement** |
| sur.kassir.ru/bilety-na-koncert | 200 OK | ALLOWED `/bilety-na-koncert`, `/bilety-v-teatr`, `/detskaya-afisha` | NO — 0 cards despite "Найдено 30 событий" | None | **RED — ship `enabled:false`** |
| afisha.yandex.ru/surgut | 200 OK | ALLOWED `/surgut` content | YES — ~3 events SSR in carousel | None | **YELLOW — ship `enabled:false` + tosRisk** |

---

## SRC-04: afisha.ru/surgut — Detail

### Live Probe Evidence

Fetched live: `https://www.afisha.ru/surgut/events/` and `https://www.afisha.ru/surgut/concerts/`

**Real events observed in initial HTML:**

| Title | Date raw | Venue | Price raw | href |
|-------|----------|-------|-----------|------|
| Подыскиваю жену, недорого! | 23 октября в 19:00 | Театр СурГУ | От 2000 ₽ | /performance/podyskivayu-zhenu-nedorogo-85589/ |
| Виктория Складчикова. Стендап-концерт | 7 октября в 19:00 | Вавилон | От 2800 ₽ | /concert/... |
| Танго — моя жизнь | 22 октября в 19:00 | Театр СурГУ | От 2000 ₽ | /performance/... |

**Event count:** ~24 events visible in initial HTML on `/events/` page; ~50+ `<a href="/concert/...">` links on `/concerts/`. The "Показать еще 24 из 96" button exists — only first batch is SSR. For Phase 3, first-page scraping of both URL paths gives adequate breadth.

**Page type:** Next.js application (confirmed by routing patterns and image CDN `s5.afisha.ru`, `s3.afisha.ru`). However, no `<script id="__NEXT_DATA__">` is reachable — likely server-rendered pages where Next.js emits SSR HTML without a hydration payload, OR the WebFetch tool fails to capture the script tag. Either way: no structured data path available.

**robots.txt status (probed live):** `afisha.ru/robots.txt` confirms `/surgut/`, `/surgut/events/`, and `/surgut/concerts/` are NOT disallowed. Complex multi-agent file. [VERIFIED: live probe 2026-06-27]

### HTML Structure and Selectors

The card anchor element contains all fields. CSS module class names are not visible (Next.js hashed class names not captured in WebFetch). Use href-attribute selectors instead.

```typescript
// Card container selector — covers both pages
'a[href^="/concert/"], a[href^="/performance/"], a[href^="/event/"]'

// Title: h3 inside the card anchor
$(el).find('h3').first().text().trim()

// Price: span containing ₽ symbol
$(el).find('span').filter((_i, s) => $(s).text().includes('₽')).first().text().trim()

// Date + venue: the text node that contains a Russian month name
// Two formats observed:
//   (a) "23 октября в 19:00, Театр СурГУ"  — date+time+venue in one span
//   (b) "7 октября в 19:00" in one element + "Вавилон" in adjacent element
// Strategy: look for span text matching /\d{1,2}\s+[а-яёА-ЯЁ]+\s+в\s+\d{2}:\d{2}/
// Then strip trailing ", Venue" to separate date from venue
```

**Implementation approach for date+venue extraction:**

```typescript
// Within each card anchor element:
const fullText = $(el).text();  // all text inside the card

// Regex to find "DD месяца в HH:MM" optionally followed by ", Venue"
const dateVenueMatch = fullText.match(
  /(\d{1,2}\s+[а-яёА-ЯЁ]+\s+в\s+\d{2}:\d{2})(?:,\s*(.+?))?(?:От|\d+\s*₽|$)/
);
// Group 1: date string e.g. "7 октября в 19:00"
// Group 2: venue (may be absent if venue appears elsewhere in card)

// Fallback: find individual elements
const spans = $(el).find('span, div').toArray()
  .map(s => $(s).text().trim())
  .filter(t => /\d{1,2}\s+[а-яёА-ЯЁ]+/.test(t));
```

Note: Venue extraction for afisha.ru is best-effort. If no venue is found, leave blank — the title and date are the required fields. Missing venue does NOT trigger the min-results guard.

### New Date Format Required: parseRussianDate Format 3

**afisha.ru format:** `"DD месяца в HH:MM"` — e.g., `"7 октября в 19:00"`

Current `parseRussianDate` handles:
- Format 1: `"DD ммм HH:MM [weekday]"` — kassa-ugra abbreviated
- Format 2: `"DD месяца [,] [YYYY]"` — genitive month, optional year

New Format 3 (to add before Format 2 in the function body):

```typescript
// Format 3: "DD месяца в HH:MM" (afisha.ru — "в" preposition before time)
// e.g. "7 октября в 19:00", "23 октября в 19:00"
const m3 = startText.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+в\s+(\d{2}):(\d{2})/i);
if (m3) {
  const [, d, mon, hh, mm] = m3;
  const month = RU_MONTHS[mon.toLowerCase()];
  if (!month) return null;
  const resolvedYear = inferYear(+d, month, year);
  return toUTC(resolvedYear, month, +d, +hh, +mm);
}
```

**hasTime for Format 3:** true (explicit time present).

Must be inserted BEFORE Format 2 in the if-chain, because Format 2's regex `(\d{1,2})\s+([а-яёА-ЯЁ]+)\s*,?\s*(\d{4})?` would also match the "DD месяца" prefix of Format 3 and return a date-only result.

### Guard: Min-Results + Parse Error

Following the established GREEN adapter pattern:
- If HTTP 200 but fewer than 2 events extracted → throw `new Error('ParseError: afisha-ru returned <2 events...')`
- The pipeline's Promise.allSettled absorbs this; last valid cache is served
- Structural smoke test: if `$('h3').length === 0` → log warning (selector may be broken) and throw

### adapter config for afisha-ru

```typescript
export const afishaRuAdapter: SourceAdapter = {
  name: 'afisha-ru',
  displayName: 'Афиша.ру Сургут',
  homeUrl: 'https://www.afisha.ru',
  timeoutMs: 20_000,  // 2 pages × 8s + 2s politeness
  // No crawl-delay declared in robots.txt; 2s politeness between pages
};
```

Two pages to scrape: `/surgut/events/` and `/surgut/concerts/`. 2 s politeness between them (same as kassa-ugra pattern). Combined expected yield: 30–50 events.

---

## SRC-05: sur.kassir.ru — Detail

### Live Probe Evidence — Conclusive RED Verdict

Probed the following URLs live on 2026-06-27:

| URL | Static event cards | What IS in HTML |
|-----|-------------------|-----------------|
| `/bilety-na-koncert` | 0 | Calendar widget, genre filters, "Найдено 30 событий" |
| `/bilety-v-teatr` | 0 | Calendar widget, "Найдено 11 событий" |
| `/detskaya-afisha` | 0 | Calendar widget, "Найдено 6 событий" |
| `/bilety-na-koncert/segodnya` | 0 | Calendar, "Найдено 0 событий" |

Sitemap reveals Russian-language date-filtered URL structure: `/bilety-na-koncert/segodnya`, `/bilety-na-koncert/zavtra`, `/bilety-na-koncert/nedelja`. However, probing `/segodnya` also returns 0 event cards in static HTML.

No `__NEXT_DATA__`, no JSON-LD, no embedded JavaScript API endpoint URLs, no `window.__INITIAL_STATE__`. The guessed API path `/api/event/list?city=sur&type=concert&page=1` returned HTTP 404.

**Conclusion:** sur.kassir.ru is fully client-rendered. Events are loaded asynchronously by JavaScript after page load. No feasible path to ≥10 events without a headless browser. [VERIFIED: live probe 2026-06-27]

### Recommended Design: Disabled Stub

Ship a minimal registry entry that records the source as `enabled: false`. No scraping code is needed.

```typescript
// src/sources/kassir-sur/index.ts
/**
 * sur.kassir.ru source adapter — DISABLED in Phase 3.
 *
 * Confirmed fully client-rendered (2026-06-27): all category pages
 * (/bilety-na-koncert, /bilety-v-teatr, /detskaya-afisha) return 0 event
 * cards in static HTML despite showing "Найдено N событий". Events are
 * loaded via AJAX after JS execution. No public API discovered.
 *
 * Cannot be scraped without a headless browser, which violates the
 * node:20-slim single-container constraint. Deferred to v2.
 *
 * To enable in v2: replace scrape() with a headless sidecar strategy
 * or kassir.ru public API (if one becomes available).
 */
export const kassirSurAdapter: SourceAdapter & { enabled: false } = {
  name: 'kassir-sur',
  displayName: 'Кассир Сургут',
  homeUrl: 'https://sur.kassir.ru',
  timeoutMs: 0,
  enabled: false as const,

  async scrape(): Promise<NormalizedEvent[]> {
    throw new Error('kassir-sur: adapter disabled — fully client-rendered source');
  },
};
```

The registry wiring must check `enabled` before calling `scrape()`. The pipeline already uses Promise.allSettled — an adapter that throws immediately will produce a SourceResult with status `error` and no events. But for a cleaner UI, the status should be `blocked` (to distinguish "we chose not to scrape this" from "we tried and failed"). The registry or refresh loop should check `enabled` and set status `blocked` without calling scrape().

The `ctaText()` helper in `app.js` already has `'kassir'` in its ticketing-source list (line 119). If kassir-sur events are ever served in v2, this is already handled.

---

## SRC-06: afisha.yandex.ru/surgut — Detail

### Live Probe Evidence

Fetched live: `https://afisha.yandex.ru/surgut`

**Real events observed:**

| Title | Date raw | Venue | Price raw | href |
|-------|----------|-------|-----------|------|
| Пикник | 15 сентября, 19:00 | Дворец искусств «Нефтяник» | от 3 500 ₽ | /surgut/concert/piknik-vechnoye-dvizheniye |
| КняZz | 12 декабря, 19:00 | Вавилон | (not captured) | /surgut/concert/knyazz-... |

**Event count in initial HTML:** ~3 events visible in a carousel section. Very limited vs afisha.ru (24) — Yandex shows only a curated subset on the main page.

**Category pages:** `/surgut/concerts` returns HTTP 404. Only the root `/surgut` page works. This limits yield to the carousel events (~3–5).

**Page type:** React SPA with partial SSR. No `__NEXT_DATA__`, no JSON-LD visible.

**robots.txt status (confirmed from prior research):** ALLOWED for `/surgut` content paths; blocks `/api/` and account paths. [CITED: PITFALLS.md — probed 2026-06-26]

### Yandex ToS §3.1 — Exact Text

[CITED: yandex.ru/legal/rules/ — fetched live 2026-06-27]

> "Яндекс вправе устанавливать ограничения в использовании сервисов Яндекса для всех пользователей. Яндекс может запретить автоматическое обращение к своим сервисам, а также прекратить прием любой информации, сгенерированной автоматически."

Translation: "Yandex may establish restrictions on the use of Yandex services for all users. Yandex may prohibit automated access to its services and stop accepting any automatically generated information."

**No exceptions** are listed for specific User-Agents, public-data access, or read-only access.

### New Date Format Required: parseRussianDate Format 4

**Yandex Afisha format:** `"DD месяца, HH:MM"` — e.g., `"15 сентября, 19:00"`

This differs from Format 2 ("DD месяца YYYY") in that after the comma comes `HH:MM` not a 4-digit year. The current Format 2 regex `(\d{1,2})\s+([а-яёА-ЯЁ]+)\s*,?\s*(\d{4})?` would match "15 сентября, " but fail to find a 4-digit year and produce a date-only result with time "00:00 UTC" — **incorrectly suppressing the time**.

New Format 4 (insert before Format 2):

```typescript
// Format 4: "DD месяца, HH:MM" (afisha.yandex.ru — comma before time, no year)
// e.g. "15 сентября, 19:00"
const m4 = startText.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+),\s+(\d{2}):(\d{2})\b/i);
if (m4) {
  const [, d, mon, hh, mm] = m4;
  const month = RU_MONTHS[mon.toLowerCase()];
  if (!month) return null;
  const resolvedYear = inferYear(+d, month, year);
  return toUTC(resolvedYear, month, +d, +hh, +mm);
}
```

**hasTime for Format 4:** true.

Must be inserted BEFORE Format 2.

### adapter config and safety design

```typescript
export const yandexAfishaAdapter: SourceAdapter & { enabled: boolean; tosRisk: boolean } = {
  name: 'yandex-afisha',
  displayName: 'Яндекс Афиша Сургут',
  homeUrl: 'https://afisha.yandex.ru',
  timeoutMs: 10_000,
  enabled: false,   // OFF by default — ToS §3.1 risk
  tosRisk: true,    // Documented: Yandex may block without notice

  async scrape(): Promise<NormalizedEvent[]> {
    // scrape() body here — called ONLY when enabled:true in config
  },
};
```

**HTTP 403 handling:** When `fetchHtml` throws `HTTP 403`, the existing pipeline catch path sets source status to `'error'`. However, the ROADMAP success criterion 3 requires status `'blocked'` for 403. The adapter should catch HTTP 403 specifically and re-throw with a tagged message, OR the refresh loop should detect the 403 message and map to `'blocked'`. Cleanest: throw `new Error('HTTP 403 — source blocked')` and have the run loop check for "403" / "blocked" in the error message to set status `'blocked'` instead of `'error'`.

**Yield:** Only ~3–5 events from the carousel on `/surgut`. Low absolute count but the events are high-profile (Пикник, КняZz) that may not appear in other sources.

**Selectors for /surgut:**

```typescript
// Event cards: anchor tags with href matching /surgut/[category]/[slug]
'a[href*="/surgut/concert/"], a[href*="/surgut/performance/"]'

// Within each card:
//   title: look for the largest text element
//   date: text matching /\d{1,2}\s+[а-яё]+,\s+\d{2}:\d{2}/
//   price: text matching /от\s+[\d\s]+₽/i
```

---

## UX-01: Date-Only Time Display Fix

### Root Cause Confirmed

In `src/utils/date.ts`, Format 2 (date-only) explicitly stores UTC midnight:

```typescript
// Format 2 comment in date.ts (line 75–76):
// For date-only (no time specified), store as UTC midnight on the same calendar date.
// We do NOT apply the UTC+5 offset here because the exact start time is unknown.
return new Date(Date.UTC(resolvedYear, month - 1, +d, 0, 0, 0));
```

In `public/app.js`, `humanizeDate` adds 5h (SURGUT_OFFSET_MS) to get Surgut local time:

```javascript
function surgutDate(utcDate) {
  return new Date(new Date(utcDate).getTime() + SURGUT_OFFSET_MS);  // +5h
}

function humanizeDate(isoString) {
  const d = surgutDate(isoString);  // UTC midnight + 5h = 05:00 Surgut
  const h = d.getUTCHours();        // 5, not 0
  const m = d.getUTCMinutes();      // 0
  const timeStr = (h === 0 && m === 0)  // false — h is 5
    ? ''
    : `, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;  // shows ",05:00"
```

**Events with this bug:** all afisha-surguta.ru events (date-only: "15 апреля 2026" format) and all future date-only events from new adapters. kassa-ugra events are unaffected (all have explicit times).

### Fix Design

**Two-tier approach (do both):**

#### Tier 1 — Immediate UI inference (no server changes, no test impact)

Detect date-only by checking the raw UTC time of the ISO string. UTC midnight (00:00 UTC) means date-only. "Midnight Surgut local" (00:00 local = 19:00 UTC previous day) is stored differently, so there is no collision.

Change in `humanizeDate` in `public/app.js`:

```javascript
function humanizeDate(isoString, hasTime) {
  // hasTime: explicit flag if present; fall back to UTC midnight inference
  const rawUtcDate = new Date(isoString);
  const isDateOnly = hasTime === false
    || (hasTime === undefined && rawUtcDate.getUTCHours() === 0 && rawUtcDate.getUTCMinutes() === 0);

  const d   = surgutDate(isoString);
  // ... rest unchanged ...

  const timeStr = isDateOnly
    ? ''
    : `, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
```

All callers: `humanizeDate(e.startDate, e.hasTime)` — `hasTime` will be `undefined` for old cached data (backward compat) and the UTC inference fires as fallback.

**Impact:** 0 server files changed, 0 tests affected, 162 existing tests continue to pass.

#### Tier 2 — Explicit `hasTime` model field (future-proof)

Add to `src/types/events.ts`:

```typescript
export interface NormalizedEvent {
  // ... existing fields ...
  /**
   * True when the source included an explicit start time.
   * False (or absent) when the source gave a date only — startDate is stored at UTC midnight.
   * Absent means unknown; UI falls back to UTC midnight inference.
   */
  hasTime?: boolean;
}
```

Add to `src/http/serialize.ts`:

```typescript
export interface SerializedEvent {
  // ... existing fields ...
  hasTime: boolean | undefined;
}

// In serializeEvent():
hasTime: e.hasTime,
```

Add `parseDateFull()` sibling function to `src/utils/date.ts`:

```typescript
/**
 * Like parseRussianDate but also returns whether an explicit time was found.
 * Use in adapters that need to set NormalizedEvent.hasTime.
 * Existing parseRussianDate() callers are unchanged.
 */
export function parseDateFull(
  text: string,
  refYear?: number
): { date: Date; hasTime: boolean } | null {
  // Internal implementation: same as parseRussianDate but tracks which format matched.
  // Format 1, 3, 4 → hasTime: true
  // Format 2, relative labels → hasTime: false
  // Range → hasTime: false (start of range has no time)
}
```

`parseRussianDate` can then simply call `parseDateFull()` and return `.date` — same behavior, no callers break.

**Adapter changes:**

- `kassa-ugra/index.ts`: use `parseDateFull` → `hasTime: true` on all events (all have "DD ммм HH:MM")
- `afisha-surguta/index.ts`: use `parseDateFull` → `hasTime: false` for date-only events (format "DD месяца YYYY"), `hasTime: false` for range start
- New adapters: same pattern
- Seed events in `events.json`: add `"hasTime": false` to date-only seed events, `"hasTime": true` to timed ones. Leave absent for backward compat.

**Test impact:** Zero. `hasTime` is optional in NormalizedEvent. Existing adapter tests use `expect(event).toMatchObject({...})` which matches a subset of fields — adding `hasTime` to produced events does not break matching. The 9 `parseRussianDate` tests call the unchanged `parseRussianDate()` function directly.

**Precedence in humanizeDate:**
1. `e.hasTime === false` → never show time (explicit)
2. `e.hasTime === undefined` AND UTC hours=0 AND UTC minutes=0 → suppress time (inference for cached data)
3. Otherwise → show time as formatted

### Is UX-01 in scope for Phase 3?

**Yes. Recommend include.** Reasons:
- Tier 1 fix is 5 lines in one file with zero risk
- Tier 2 is naturally bundled with new adapter work (adapters already need to handle date-only)
- The bug visually affects every afisha-surguta.ru event shown to users
- Not fixing it makes new adapters produce the same bug

---

## UI-06: Text Search

### Design

**Location in HTML (`public/index.html`):**
Inside the `#filters` section (shown after mood tap), as the first control before the chips row. This matches the existing filter UX pattern — search is a filter, not a navigation element.

```html
<!-- UI-06: keyword text search — add inside #filters, before .chips -->
<div class="search-row">
  <input
    type="search"
    id="search-input"
    class="search-input"
    placeholder="Поиск по названию, месту…"
    aria-label="Поиск событий"
    autocomplete="off"
  >
</div>
```

**State and filter integration in `public/app.js`:**

```javascript
/** Active keyword search query (lowercased) — '' means no filter */
let searchQuery = '';

function applyFilters() {
  const q = searchQuery;  // already lowercase from input handler
  
  return currentItems.filter(function (item) {
    var e = item.event;

    // Existing filters first (unchanged)
    if (freeOnly && !e.isFree) return false;
    if (activeCategory && e.category !== activeCategory) return false;

    // Date chip filters... (unchanged)

    // UI-06: keyword search (case-insensitive Russian)
    if (q) {
      var haystack = [
        e.title,
        e.venue,
        item.reason,          // "why recommended" text
        e.tags.join(' '),
      ].join(' ').toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }

    return true;
  });
}
```

**Event binding:**

```javascript
document.getElementById('search-input').addEventListener('input', function (ev) {
  searchQuery = ev.target.value.trim().toLowerCase();
  renderCards(applyFilters());
});
```

**Reset on mood change** (inside `loadMood()`):

```javascript
searchQuery = '';
document.getElementById('search-input').value = '';
```

**Fields searched:** title, venue, reason, tags joined. Rationale:
- `title`: primary (most useful)
- `venue`: "Нефтяник", "Вавилон" — users search by place
- `reason`: the "why recommended" text contains genre/category labels
- `tags`: sparse but available for tagged events

**Not searched:** `sourceName`, `category` (category has a dedicated filter), `priceText` (price has a dedicated toggle). Keeping it tight avoids false positives.

**Russian locale correctness:** JavaScript's `.toLowerCase()` handles Cyrillic correctly in all modern engines — `'Й'.toLowerCase() === 'й'` is true. `toLocaleLowerCase('ru-RU')` produces identical results for Russian letters. Use `.toLowerCase()` (simpler, no locale arg needed). [ASSUMED]

**Performance:** `currentItems` is typically 50–150 items (the loaded mood slice). String operations on 150 items with a combined text field of ~100 chars each is ~15,000 char comparisons — imperceptible in a browser event handler.

---

## Architecture Patterns

### Adapter Pattern (follows GREEN sources exactly)

```typescript
// src/sources/afisha-ru/index.ts — follows kassa-ugra pattern

import * as cheerio from 'cheerio/slim';  // slim: no undici dependency [VERIFIED: Phase 1]
import { createHash } from 'node:crypto';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import { parseDateFull } from '../../utils/date';     // new sibling function
import { parseRussianPrice } from '../../utils/price';
import { fetchHtml } from '../../utils/http';
import { isAllowed } from '../../utils/robots';
import type { SourceAdapter } from '../base';

const SOURCE_NAME = 'afisha-ru';
const HOME_URL = 'https://www.afisha.ru';
const LISTING_URLS = [
  `${HOME_URL}/surgut/events/`,
  `${HOME_URL}/surgut/concerts/`,
];
const POLITENESS_MS = 2_000;
const PAGE_TIMEOUT_MS = 8_000;

export function parseAfishaRu(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const now = new Date();
  const events: NormalizedEvent[] = [];

  $('a[href^="/concert/"], a[href^="/performance/"], a[href^="/event/"]').each((_i, el) => {
    // ... extract title, date, venue, price ...
    // parseDateFull(dateStr) → { date, hasTime }
    // min-results guard at end
  });

  if (events.length < 2) {
    throw new Error(`ParseError: afisha-ru returned <2 events on HTTP 200 (got ${events.length})`);
  }
  return events;
}

export const afishaRuAdapter: SourceAdapter = { ... };
```

### Source Config Extension Pattern

Neither `SourceAdapter` base interface needs changes for `enabled` / `tosRisk`. Extend at the concrete adapter level:

```typescript
// Option A: Cast in registry
if ('enabled' in adapter && adapter.enabled === false) {
  // Skip scraping, set status = 'blocked'
}

// Option B: Separate registry for disabled adapters
export const disabledSources: Array<Omit<SourceAdapter, 'scrape'> & { reason: string }> = [
  { name: 'kassir-sur', displayName: 'Кассир Сургут', homeUrl: 'https://sur.kassir.ru',
    reason: 'Fully client-rendered — requires headless browser', timeoutMs: 0 }
];
```

**Recommendation: Option B** — keeps `sourceRegistry` clean (only adapters that can actually scrape), and disabled sources still appear in `/api/sources/status` with status `'blocked'` for transparency.

### HTTP 403 → `'blocked'` Status Mapping

The current `run.ts` pipeline catches errors from scrape() and maps them to source status `'error'`. For HTTP 403 (Yandex block), we want `'blocked'`. The cleanest approach without changing the SourceStatus type:

```typescript
// In src/pipeline/run.ts — in the rejection handler:
const isBlocked = (error.message ?? '').includes('HTTP 403')
  || (error.message ?? '').includes('blocked');
result.status = isBlocked ? 'blocked' : 'error';
```

`'blocked'` is already defined in `SourceStatus` (see `src/types/events.ts` line 6). No type changes needed. [VERIFIED: codebase read]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Russian date parsing with time "в HH:MM" | New date parser | Add Format 3 to existing `parseRussianDate` / `parseDateFull` | Existing function has month table, year inference, UTC conversion — just add a regex branch |
| Russian price "от N ₽" parsing | New parser | Existing `parseRussianPrice` | Already handles "от N ₽", ranges, "бесплатно" |
| robots.txt compliance | Per-adapter robots check | Existing `isAllowed()` in `utils/robots.ts` | Cached, tested, correct |
| HTTP retry + charset detection | Per-adapter fetch | Existing `fetchHtml()` in `utils/http.ts` | p-retry, CP1251 detection, User-Agent all built-in |
| String search with Russian lowercase | Custom normalizer | `.toLowerCase()` + `.indexOf()` | Sufficient; no ICU library needed |
| Headless browser for kassir.ru | puppeteer/playwright sidecar | Do not implement | Violates node:20-slim constraint; deferred to v2 |

---

## Common Pitfalls

### Pitfall 1: afisha.ru CSS Module Classes — Never Hardcode

**What goes wrong:** Developer views afisha.ru in browser DevTools, sees class names like `AfishaEvent__root__xKq3m`, hardcodes them into selectors. Next.js build rotates these hashes on every deploy. Selectors silently break on afisha.ru's next deployment.

**How to avoid:** Use only content-stable selectors: `a[href^="/concert/"]`, `h3`, `span`. If these break too, the min-results guard (`<2 events → ParseError`) catches it within one TTL cycle.

### Pitfall 2: kassir.ru "Static HTML with Event Count" is a Trap

**What goes wrong:** Developer sees "Найдено 30 событий" in HTML, assumes events follow and tries to parse them. Gets 0 events. Parser reports success (no exception thrown) but with empty array. Min-results guard must fire.

**How to avoid:** kassir-sur is disabled in Phase 3. If enabled in future: verify event cards exist in HTML BEFORE writing parser; do not count on event-count text alone.

### Pitfall 3: Yandex AfishaDate Format "DD месяца, HH:MM" Silently Matches Format 2

**What goes wrong:** "15 сентября, 19:00" is fed to current `parseRussianDate`. Format 2 regex `^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s*,?\s*(\d{4})?` matches "15 сентября," with year=undefined → returns UTC midnight → event appears as date-only → "05:00" bug.

**How to avoid:** Format 4 (`^(\d{1,2})\s+([а-яё]+),\s+(\d{2}):(\d{2})`) must be checked BEFORE Format 2 in the if-chain.

### Pitfall 4: afisha.ru "Show More" Creates False Confidence

**What goes wrong:** Developer fetches `/surgut/concerts/` and finds 50+ `<a href="/concert/...">` links, assumes they are all scrapeable. In reality some are navigation/related links (genre categories like `/surgut/schedule_concert/pop/`), not event cards. Parser extracts wrong content.

**How to avoid:** Validate that the `<a>` element being processed contains an `<h3>` (title) and a date-pattern span. Skip anchors that fail these checks. The min-results guard provides a backstop.

### Pitfall 5: Disabled Adapter Still Blocks Source Status Endpoint

**What goes wrong:** kassir-sur appears in the registry but its scrape() throws immediately. The source status endpoint shows `'error'` instead of `'blocked'`. Users see "Кассир: Ошибка" which implies the service tried and failed, not that it was intentionally disabled.

**How to avoid:** Disabled adapters live in a separate `disabledSources` list, not in `sourceRegistry`. The pipeline adds them to the status response directly with `status: 'blocked'` and no fetchedAt.

### Pitfall 6: Date-Only Events from New Adapters Show "05:00" if UX-01 Not Fixed

**What goes wrong:** afisha.ru events without explicit times (exhibitions, all-day events) get stored at UTC midnight. Without the UX-01 fix, they display "05:00" in the UI.

**How to avoid:** Land UX-01 Tier 1 (humanizeDate inference) in the same wave as the first new adapter, before any date-only events can appear.

---

## Code Examples

### Format 3 + Format 4 Addition to parseRussianDate

```typescript
// Source: existing date.ts pattern — extend the Format 1 / Format 2 chain
// Insert these checks BEFORE the existing Format 2 match

// Format 3 (afisha.ru): "DD месяца в HH:MM"
// e.g. "7 октября в 19:00", "23 октября в 19:00"
const m3 = startText.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+в\s+(\d{2}):(\d{2})/i);
if (m3) {
  const [, d, mon, hh, mm] = m3;
  const month = RU_MONTHS[mon.toLowerCase()];
  if (month) {
    const resolvedYear = inferYear(+d, month, year);
    return toUTC(resolvedYear, month, +d, +hh, +mm);
  }
}

// Format 4 (afisha.yandex.ru): "DD месяца, HH:MM"
// e.g. "15 сентября, 19:00", "12 декабря, 19:00"
const m4 = startText.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+),\s+(\d{2}):(\d{2})\b/i);
if (m4) {
  const [, d, mon, hh, mm] = m4;
  const month = RU_MONTHS[mon.toLowerCase()];
  if (month) {
    const resolvedYear = inferYear(+d, month, year);
    return toUTC(resolvedYear, month, +d, +hh, +mm);
  }
}
```

### parseDateFull Sibling (new function, backward-compat)

```typescript
// Source: date.ts — add alongside parseRussianDate

export interface ParsedDate {
  date: Date;
  /** true when the source string contained an explicit HH:MM time */
  hasTime: boolean;
}

export function parseDateFull(text: string, refYear?: number): ParsedDate | null {
  // Implementation mirrors parseRussianDate but returns { date, hasTime }
  // Format 1 → hasTime: true; Format 3 → hasTime: true; Format 4 → hasTime: true
  // Format 2 → hasTime: false; relative labels → hasTime: false
  // Returns null on failure (never throws)
}

// parseRussianDate can delegate to parseDateFull:
export function parseRussianDate(text: string, refYear?: number): Date | null {
  return parseDateFull(text, refYear)?.date ?? null;
}
```

### humanizeDate — UX-01 Tier 1 Fix

```javascript
// Source: public/app.js — humanizeDate function

function humanizeDate(isoString, hasTime) {
  // hasTime: explicit flag from NormalizedEvent (may be undefined for cached data)
  var rawUtcDate = new Date(isoString);
  var isDateOnly = hasTime === false
    || (hasTime === undefined
        && rawUtcDate.getUTCHours() === 0
        && rawUtcDate.getUTCMinutes() === 0);

  var d   = surgutDate(isoString);
  var now = surgutDate(new Date());
  // ... day/month/today/tomorrow logic unchanged ...

  var timeStr = isDateOnly
    ? ''
    : ', ' + String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');

  if (dStr === todayStr)    return 'Сегодня' + timeStr;
  if (dStr === tomorrowStr) return 'Завтра'  + timeStr;
  var day = RU_DAYS[d.getUTCDay()];
  var mon = RU_MONTHS[d.getUTCMonth()];
  return day + ', ' + d.getUTCDate() + ' ' + mon + timeStr;
}
```

All callers become: `humanizeDate(e.startDate, e.hasTime)` (add second arg; `undefined` is safe).

### Disabled Source in Status Response

```typescript
// In the pipeline result assembly — add disabled sources with 'blocked' status:
const disabledResults: SourceResult[] = disabledSources.map(s => ({
  name: s.name,
  displayName: s.displayName,
  homeUrl: s.homeUrl,
  status: 'blocked' as const,
  eventCount: 0,
  fetchedAt: null,
  error: s.reason,  // human-readable, no stack trace
}));
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Expect `__NEXT_DATA__` on all Next.js sites | Probe for it; fall back to href-pattern HTML scraping | afisha.ru has SSR without hydration payload |
| Assume AJAX pagination can be reversed | Probe static HTML first; mark RED if 0 events | kassir.ru: no static events at all |
| Date-only stored as UTC midnight, always add offset in UI | Add UTC midnight inference check in humanizeDate | Fixes "05:00" bug for all date-only events |

---

## Package Legitimacy Audit

Phase 3 installs **zero new npm packages**. All required functionality exists in the locked stack:
- cheerio/slim: already installed (used in GREEN adapters) [VERIFIED: npm registry]
- fetchHtml / robots / p-retry: already in production [VERIFIED: npm registry]
- No new vitest plugins needed

**Packages removed due to slopcheck:** none (nothing new to install)

---

## Environment Availability

This phase is code/config-only changes — no new external tool dependencies. All existing tools (Node 20, TypeScript, esbuild, vitest, cheerio) are confirmed working from Phase 1 and Phase 2. The only external network dependency is the three YELLOW source domains:

| Source | Available | Evidence |
|--------|-----------|----------|
| afisha.ru | Yes (200 OK) | Live probe 2026-06-27 |
| sur.kassir.ru | Yes (200 OK, but disabled) | Live probe 2026-06-27 |
| afisha.yandex.ru | Yes (200 OK, but disabled) | Live probe 2026-06-27 |

---

## Validation Architecture

`workflow.nyquist_validation` is set to `false` in `.planning/config.json`. This section is skipped per config.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes — search query never touches server | Search is client-side filter; query never leaves browser |
| V5 Input Validation | Yes — scraped HTML used in event titles | Already mitigated: `escHtml()` in renderCard() wraps all event fields |
| V6 Cryptography | No | No new crypto in Phase 3 |
| V2 Authentication | No | Anonymous read-only, unchanged |

**Search query safety:** `searchQuery` is used only in a string `.indexOf()` comparison against in-memory data. It is never sent to the server, never used in a URL, never inserted into HTML directly. No XSS or SSRF risk. [VERIFIED: design]

**Scraped content XSS:** New adapters produce `NormalizedEvent.title` and `NormalizedEvent.venue` from afisha.ru HTML. These fields are already passed through `escHtml()` in `renderCard()` before innerHTML insertion. No change needed. [VERIFIED: app.js line 162+]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | afisha.ru href-pattern selectors (`a[href^="/concert/"]`) are stable | SRC-04 Selectors | If afisha.ru changes URL structure, adapter returns 0 events; ParseError fires; cache serves stale |
| A2 | afisha.ru SSR events in initial HTML will remain after any redeploy | SRC-04 | If site moves to CSR, no events → ParseError → source blocked |
| A3 | afisha.yandex.ru `/surgut` root page continues to return events on first request | SRC-06 | If Yandex adds JS guard, 0 events → ParseError → source blocked |
| A4 | `.toLowerCase()` in JavaScript is sufficient for Russian case-folding in text search | UI-06 | Edge case Cyrillic edge cases (ё/е normalization) might cause misses, but ё is rare |
| A5 | UTC midnight (00:00 UTC) unambiguously means "date-only" in the current codebase | UX-01 | If a future adapter stores a real 05:00 Surgut event at UTC midnight, time would be hidden. Low risk: 05:00 is an unusual event time |

---

## Open Questions

1. **Does the afisha.ru /surgut/events/ path require Accept-Language: ru-RU?**
   - Prior PITFALLS.md notes: "Fetching with Accept-Language: en can trigger different page structure"
   - `fetchHtml` already sends `Accept-Language: ru-RU,ru;q=0.9` — no change needed
   - Confirmed safe [CITED: PITFALLS.md Integration Gotchas table]

2. **Should disabled source kassir-sur appear in /api/sources/status?**
   - Recommendation: YES, with status `'blocked'` and error text "Требует браузера; отключён в MVP"
   - Reason: transparent data sourcing is a core value of the product (CLAUDE.md + Project description)
   - Implementation: `disabledSources` list in registry.ts, assembled in run.ts results

3. **Should text search be visible before a mood is selected?**
   - Current filters section is hidden until mood tap
   - Recommendation: keep search inside #filters (hidden before mood tap) — search on an empty results list is useless
   - If future phases load events without a mood (e.g. an "all events" view), search can move outside

---

## Sources

### Primary (HIGH confidence)
- Live probe: `https://www.afisha.ru/surgut/events/` — events in SSR HTML, date format, href pattern; 2026-06-27
- Live probe: `https://www.afisha.ru/surgut/concerts/` — 50+ concert links, first event details; 2026-06-27
- Live probe: `https://sur.kassir.ru/bilety-na-koncert` — 0 event cards, AJAX-only; 2026-06-27
- Live probe: `https://sur.kassir.ru/bilety-v-teatr` — 0 event cards; 2026-06-27
- Live probe: `https://sur.kassir.ru/bilety-na-koncert/segodnya` — 0 event cards; 2026-06-27
- Live probe: `https://sur.kassir.ru/detskaya-afisha` — 0 event cards; 2026-06-27
- Live probe: `https://afisha.yandex.ru/surgut` — SSR events visible, "Пикник" example; 2026-06-27
- `yandex.ru/legal/rules/` §3.1 — ToS automated access prohibition, exact Russian text; 2026-06-27
- Codebase reads: `src/utils/date.ts`, `src/utils/price.ts`, `src/utils/http.ts`, `src/utils/robots.ts`, `src/types/events.ts`, `src/http/serialize.ts`, `src/sources/kassa-ugra/index.ts`, `src/sources/afisha-surguta/index.ts`, `src/sources/base.ts`, `src/sources/registry.ts`, `public/app.js`, `public/index.html` — all read 2026-06-27
- vitest run: 162 tests, 13 files, all passing — baseline confirmed 2026-06-27

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — prior live probes from 2026-06-26; robots.txt status for all three sources
- `sur.kassir.ru/sitemap.xml` — date-filtered URL patterns discovered (segodnya/zavtra/nedelja)

### Tertiary (LOW confidence / ASSUMED)
- A4: JavaScript `.toLowerCase()` Russian locale behavior — training knowledge, not tested live

---

## Metadata

**Confidence breakdown:**
- afisha.ru source verdict: HIGH (two pages probed live, real events extracted)
- afisha.ru selector stability: LOW-MEDIUM (no class names available; href-pattern selectors could break)
- kassir.ru verdict (RED): HIGH (four pages probed, all returned 0 events)
- yandex.ru verdict + ToS: HIGH (live probe + live ToS fetch)
- UX-01 root cause: HIGH (exact lines in date.ts and app.js confirmed by reading)
- UI-06 text search design: HIGH (based on existing applyFilters() pattern)

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 for source verdicts (afisha.ru structure can change any day; kassir.ru unlikely to add static HTML; Yandex ToS unchanged)
