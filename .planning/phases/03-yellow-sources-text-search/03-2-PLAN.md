---
phase: 03-yellow-sources-text-search
plan: 2
type: execute
wave: 2
depends_on: ["03-1"]
files_modified:
  - src/sources/afisha-ru/index.ts
  - src/sources/afisha-ru/index.test.ts
  - src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html
autonomous: true
requirements: [SRC-04]
must_haves:
  truths:
    - "parseAfishaRu(fixture) returns ≥2 NormalizedEvents with isSeed:false and sourceName 'afisha-ru'"
    - "Each parsed event has a non-empty title, a valid startDate, and hasTime:true for timed cards"
    - "parseAfishaRu throws a ParseError when fewer than 2 events are extractable (HTTP-200-but-empty guard, SRC-04 criterion 1)"
    - "afishaRuAdapter checks robots.txt, fetches /surgut/events/ and /surgut/concerts/ with politeness delay, and bounds itself with timeoutMs"
  artifacts:
    - path: "src/sources/afisha-ru/index.ts"
      provides: "parseAfishaRu parser + afishaRuAdapter (SourceAdapter)"
      exports: ["parseAfishaRu", "afishaRuAdapter"]
    - path: "src/sources/afisha-ru/index.test.ts"
      provides: "fixture-based tests incl. min-results guard"
    - path: "src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html"
      provides: "captured live HTML for deterministic offline tests"
  key_links:
    - from: "src/sources/afisha-ru/index.ts"
      to: "src/utils/date.ts parseDateFull"
      via: "date+hasTime extraction"
      pattern: "parseDateFull"
    - from: "afishaRuAdapter.scrape"
      to: "src/utils/robots.ts isAllowed"
      via: "robots gate before fetch"
      pattern: "isAllowed"
---

<objective>
Phase Goal (user story): As a Surgut resident, I want real afisha.ru/surgut events to appear in the app, so that I see broader, current coverage — and if afisha.ru changes its markup the app shows stale-but-honest data instead of an empty list.

This plan delivers SRC-04: a new YELLOW adapter for afisha.ru/surgut, mirroring the GREEN adapters (cheerio/slim, isSeed:false, min-results guard, polite fetch). It scrapes the SSR HTML of `/surgut/events/` and `/surgut/concerts/` using href-pattern selectors (no hashed CSS classes), parses dates via the new `parseDateFull` Format 3, and throws a ParseError on <2 events so the pipeline serves stale cache (success criterion 1). Registry/run wiring is intentionally deferred to plan 03-4 — this plan produces a self-contained, unit-tested module.

Purpose: Expand live event coverage with documented fragility guards.
Output: afisha-ru adapter module, captured fixture, fixture tests. No edits to shared registry/run files (zero Wave-2 contention).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/03-yellow-sources-text-search/03-RESEARCH.md

<interfaces>
From src/sources/base.ts — SourceAdapter { name, displayName, homeUrl, timeoutMs, scrape(): Promise<NormalizedEvent[]> }. Contract: scrape returns non-empty array or throws.
From src/utils/date.ts — parseDateFull(text, refYear?): { date: Date; hasTime: boolean } | null (added in 03-1; Format 3 handles "DD месяца в HH:MM").
From src/utils/price.ts — parseRussianPrice(text) → { minRub, maxRub, isFree, displayText }.
From src/utils/http.ts — fetchHtml(url, timeoutMs): Promise<string> (p-retry, ru-RU Accept-Language, charset handling).
From src/utils/robots.ts — isAllowed(url): Promise<boolean>.
From src/types/events.ts — NormalizedEvent (now includes optional hasTime), EventCategory.
Mirror pattern: src/sources/kassa-ugra/index.ts (makeId sha1, classifyCategory, POLITENESS_MS sleep loop, min-results throw, exported pure parser + adapter object).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Capture afisha.ru live HTML fixtures</name>
  <files>src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html</files>
  <read_first>
    - src/sources/afisha-surguta/__fixtures__ (how an existing fixture is stored and loaded by its test via readFileSync + join(__dirname, ...))
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (section "SRC-04 Live Probe Evidence", robots.txt status, Open Question 1 on Accept-Language)
  </read_first>
  <action>
    Fetch the live HTML of `https://www.afisha.ru/surgut/events/` (and optionally `https://www.afisha.ru/surgut/concerts/`) using curl with header `Accept-Language: ru-RU,ru;q=0.9` and a polite User-Agent, and save the events page response to `src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html`. Verify the saved file contains at least two `a[href^="/concert/"]` or `a[href^="/performance/"]` anchors with `<h3>` titles and date strings matching `\d{1,2}\s+[а-яё]+\s+в\s+\d{2}:\d{2}`. If the live fetch returns no SSR events (site moved to CSR or 403), STOP and add a `## Blocker` note to the SUMMARY — do NOT fabricate event HTML; the adapter cannot be honestly built without a representative fixture.
  </action>
  <acceptance_criteria>
    - File `src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html` exists and is >10 KB
    - `grep -cE 'href="/(concert|performance)/' src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html` returns ≥2
    - Fixture contains at least two `<h3>` elements
  </acceptance_criteria>
  <verify>
    <automated>test -s src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html && grep -cE 'href="/(concert|performance)/' src/sources/afisha-ru/__fixtures__/afisha-ru-2026-06-27.html</automated>
  </verify>
  <done>A real, SSR-event-bearing afisha.ru fixture is saved for offline deterministic tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement parseAfishaRu + afishaRuAdapter with fixture tests</name>
  <files>src/sources/afisha-ru/index.ts, src/sources/afisha-ru/index.test.ts</files>
  <read_first>
    - src/sources/kassa-ugra/index.ts (full mirror: imports, makeId, classifyCategory, sleep, POLITENESS_MS, exported parser + adapter, min-results throw)
    - src/sources/afisha-surguta/index.test.ts (fixture test structure to mirror)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (sections "HTML Structure and Selectors", "date+venue extraction", "Guard: Min-Results", "adapter config for afisha-ru", Pitfall 1 + Pitfall 4)
  </read_first>
  <behavior>
    - parseAfishaRu(fixture).length ≥ 2
    - every event: isSeed===false, sourceName==='afisha-ru', title non-empty, startDate is a valid Date
    - a card with "DD месяца в HH:MM" yields hasTime===true and the correct UTC hour
    - parseAfishaRu('<html></html>') throws an Error whose message includes 'ParseError'
    - anchors lacking an <h3> or a date span are skipped (not counted toward results) — Pitfall 4
  </behavior>
  <action>
    Create `src/sources/afisha-ru/index.ts` mirroring the kassa-ugra structure. Constants: SOURCE_NAME 'afisha-ru', HOME_URL 'https://www.afisha.ru', LISTING_URLS = [`${HOME_URL}/surgut/events/`, `${HOME_URL}/surgut/concerts/`], POLITENESS_MS 2000, PAGE_TIMEOUT_MS 8000. Export `parseAfishaRu(html: string): NormalizedEvent[]`: `cheerio.load`, iterate `$('a[href^="/concert/"], a[href^="/performance/"], a[href^="/event/"]')`; for each, read title from `$(el).find('h3').first().text().trim()` and skip the anchor if title is empty (Pitfall 4 — skip nav/genre links); read href for sourceUrl (`HOME_URL + href`); extract the date string from the card text by matching `/(\d{1,2}\s+[а-яёА-ЯЁ]+\s+в\s+\d{2}:\d{2})(?:,\s*(.+?))?(?:От|\d+\s*₽|$)/` — group 1 is the date (feed to `parseDateFull`), group 2 is the best-effort venue; price from the first `span` containing `₽` via `parseRussianPrice`. Set `hasTime` from `parseDateFull(...).hasTime`. Skip the card if no parseable date. Use a sha1 makeId identical to kassa-ugra. Venue is best-effort: blank when absent (does NOT trigger the guard — only event count does). After the loop, if `events.length < 2` throw `new Error('ParseError: afisha-ru returned <2 events on HTTP 200 (got ' + events.length + ')')`. Do NOT hardcode any hashed CSS class name (Pitfall 1) — content-stable selectors only. Export `afishaRuAdapter: SourceAdapter` with timeoutMs 20000 and a `scrape()` that, before fetching EACH listing URL, calls `isAllowed(url)` for THAT url (check both LISTING_URLS[0] and LISTING_URLS[1], skip any disallowed one; throw only if ALL listing URLs are disallowed), fetches the allowed listing URLs with `await sleep(POLITENESS_MS)` between them, concatenates parseAfishaRu results, dedups by id, and applies a final <2 guard. Write fixture tests in index.test.ts mirroring afisha-surguta/index.test.ts, covering the behavior block (including a `parseAfishaRu('<html></html>')` throw assertion).
  </action>
  <acceptance_criteria>
    - `npx vitest run src/sources/afisha-ru/index.test.ts` passes
    - `grep -n "ParseError" src/sources/afisha-ru/index.ts` shows the <2-events guard
    - `grep -n "parseDateFull\|isAllowed\|cheerio/slim" src/sources/afisha-ru/index.ts` confirms reuse of the shared utilities (no hand-rolled date/robots/fetch)
    - No hashed CSS class selectors: `grep -nE "__[a-zA-Z0-9]{4,}" src/sources/afisha-ru/index.ts` returns nothing
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/sources/afisha-ru/index.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>parseAfishaRu and afishaRuAdapter exist, reuse shared utils, set hasTime, enforce the min-results guard, and pass fixture tests. Module is self-contained (no registry edits here).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| afisha.ru HTML → adapter | Untrusted third-party markup parsed into event fields |
| adapter → outbound HTTP | Polite, robots-gated requests to a third party |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-03 | Tampering | silent selector breakage producing empty/garbage list | mitigate | Min-results guard throws ParseError on <2 events → run.ts serves stale cache (criterion 1); skip anchors lacking h3/date (Pitfall 4) |
| T-03-04 | Information Disclosure | scraped title/venue rendered in UI | accept | Already mitigated downstream by escHtml() in renderCard(); adapter only normalizes text |
| T-03-05 | Repudiation/ToS | aggressive crawling of afisha.ru | mitigate | isAllowed() robots gate + 2s politeness + bounded timeoutMs; first-page only |
| T-03-SC | Tampering | npm/pip/cargo installs | accept | Zero new packages (RESEARCH Package Legitimacy Audit) — gate N/A |
</threat_model>

<verification>
- `npx vitest run src/sources/afisha-ru/index.test.ts` green
- `npx tsc --noEmit` clean
- Fixture present and SSR-event-bearing
</verification>

<success_criteria>
A self-contained afisha-ru adapter that produces ≥2 normalized events from a real fixture, sets hasTime, and throws a ParseError on empty parses — ready for wiring in 03-4.
</success_criteria>

<output>
Create `.planning/phases/03-yellow-sources-text-search/03-2-SUMMARY.md` when done.
</output>
