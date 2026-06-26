---
phase: 01-deployable-pipeline-green-sources
plan: 01-7
type: execute
wave: 5
depends_on: [01-1, 01-2, 01-3, 01-5]
files_modified:
  - src/sources/kassa-ugra/index.ts
  - src/sources/kassa-ugra/index.test.ts
  - src/sources/afisha-surguta/index.ts
  - src/sources/afisha-surguta/index.test.ts
  - src/sources/registry.ts
autonomous: true
requirements: [SRC-02, SRC-03, SRC-07, AGG-01, AGG-05, AGG-02]
must_haves:
  truths:
    - "The kassa-ugra adapter parses the saved fixture into >= 2 normalized events with valid dates, prices, and isSeed:false"
    - "The afisha-surguta adapter parses its fixture, strips age-limit/price-in-title, classifies category, and yields normalized events with isSeed:false"
    - "Both adapters throw a ParseError when HTTP 200 yields fewer than 2 events (min-results guard)"
    - "afisha-surguta enforces robots.txt and the 10s crawl-delay; both send the polite User-Agent"
    - "Both real adapters are registered so the pipeline produces live events"
  artifacts:
    - path: "src/sources/kassa-ugra/index.ts"
      provides: "kassaUgraAdapter (SourceAdapter) + parseKassaUgra(html)"
      min_lines: 40
    - path: "src/sources/afisha-surguta/index.ts"
      provides: "afishaSurgutaAdapter (SourceAdapter) + parseAfishaSurguta(html)"
      min_lines: 40
    - path: "src/sources/registry.ts"
      provides: "registry including both live adapters + seed fallback"
  key_links:
    - from: "src/sources/kassa-ugra/index.ts"
      to: "src/utils/date.ts + src/utils/price.ts"
      via: "parseRussianDate / parseRussianPrice"
      pattern: "parseRussian"
    - from: "src/sources/registry.ts"
      to: "both adapters"
      via: "exported array consumed by pipeline"
      pattern: "Adapter"
---

<objective>
Implement the two GREEN source adapters (kassa-ugra.ru and afisha.surguta.ru) against the Wave-0 fixtures and shared utilities, then register them so the pipeline produces real live events.

Purpose: ARCHITECTURE build step 9 — the payload of Phase 1. Both adapters normalize to NormalizedEvent (AGG-01) with isSeed:false (AGG-02), enforce the min-results guard (AGG-05), and afisha-surguta respects robots.txt + the mandatory 10s crawl-delay + CP1251 (SRC-03/SRC-07). Tests run against saved fixtures so they are deterministic and offline.
Output: parseKassaUgra + kassaUgraAdapter, parseAfishaSurguta + afishaSurgutaAdapter, fixture-based tests for both, registry updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@.planning/research/PITFALLS.md
@src/sources/SELECTORS.md
@src/types/events.ts
@src/sources/base.ts
@src/utils/date.ts
@src/utils/price.ts
@src/utils/http.ts
@src/utils/robots.ts
@src/sources/registry.ts
</context>

<interfaces>
- src/utils/date.ts: parseRussianDate(text, refYear?) -> Date|null
- src/utils/price.ts: parseRussianPrice(raw) -> { minRub, maxRub, isFree, displayText }
- src/utils/http.ts: fetchHtml(url, timeoutMs?) -> string (retry + UA + charset)
- src/utils/robots.ts: isAllowed(url) -> Promise<boolean>
- src/sources/base.ts: SourceAdapter { name, displayName, homeUrl, timeoutMs, scrape() }
- src/sources/SELECTORS.md: confirmed selectors + container traversal + charset (from Wave 0)
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: kassa-ugra.ru adapter (fixture-tested)</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Live Source Probe: kassa-ugra — layout, date/price formats, parsing algorithm, vitest fixture pattern)
    - src/sources/SELECTORS.md (confirmed kassa-ugra selectors)
    - src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html
    - src/utils/date.ts, src/utils/price.ts, src/utils/http.ts
  </read_first>
  <behavior>
    - parseKassaUgra(fixtureHtml) returns >= 2 events
    - first event has title:string, startDate:Date (not Invalid Date), sourceName 'kassa-ugra', isSeed:false
    - a paid event has priceText matching /₽/ and a numeric priceMin
    - HTTP-200-but-<2-events input throws a ParseError (min-results guard, AGG-05)
  </behavior>
  <action>
    Write src/sources/kassa-ugra/index.test.ts FIRST (RED) loading the fixture and asserting the behaviors above. Then implement src/sources/kassa-ugra/index.ts: export parseKassaUgra(html:string): NormalizedEvent[] using cheerio (import * as cheerio) and the confirmed selectors (anchors a[href^="/event/"], traverse to venue/date/price text per SELECTORS.md). Map each: title=anchor text; sourceUrl='https://kassa-ugra.ru'+href; startDate=parseRussianDate(listingDateStr) with inferYear; price via parseRussianPrice; category heuristic (concert/club/theater/other); id=sha1(sourceName+sourceUrl+day); isSeed:false; fetchedAt set in adapter. Enforce min-results: if events.length < 2 throw new Error('ParseError: kassa-ugra returned <2 events on HTTP 200'). Export kassaUgraAdapter implementing SourceAdapter (name 'kassa-ugra', displayName 'Касса Югра', homeUrl, timeoutMs 30000 — must cover 3 page fetches plus 2×2s politeness delays so the pipeline-level withTimeout wrapper does not prematurely flip the source to error) whose scrape() checks isAllowed, fetches pages 1-3 via fetchHtml (politeness 2s between pages), concatenates parseKassaUgra results, applies the min-results guard, returns NormalizedEvent[].
  </action>
  <verify>
    <automated>npx vitest run src/sources/kassa-ugra/index.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - index.test.ts committed RED before index.ts
    - parseKassaUgra(fixture) yields >= 2 events; first event matches {title,startDate:Date,sourceName:'kassa-ugra',isSeed:false}
    - paid event priceText contains ₽; min-results guard throws on <2 events
    - cheerio imported as `import * as cheerio` (RESEARCH Pitfall 3)
  </acceptance_criteria>
  <done>kassa-ugra produces normalized live events from real HTML with the parse guard — SRC-02 satisfied.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: afisha.surguta.ru adapter (fixture-tested, crawl-delay + CP1251)</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Live Source Probe: afisha.surguta — no category URLs, date formats, price/age in title, Crawl-Delay implementation; Pitfalls 6/7/10)
    - .planning/research/PITFALLS.md (Pitfall 10 category mapping; Pitfall 7 encoding)
    - src/sources/SELECTORS.md (confirmed afisha.surguta selectors + charset)
    - src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html
    - src/utils/date.ts, src/utils/price.ts, src/utils/http.ts, src/utils/robots.ts
  </read_first>
  <behavior>
    - parseAfishaSurguta(fixtureHtml) returns >= 2 events with isSeed:false, sourceName 'afisha-surguta'
    - a title like "«Весы» 18+" -> title without the rating, ageLimit "18+" (Pitfall 7)
    - a title like "Картина ... 33 000 ₽" -> price stripped from title into priceText/priceMin (Pitfall 6)
    - a genitive listing date "15 апреля 2026" parses to a valid Date; a range uses the first date as startDate
    - HTTP-200-but-<2-events throws ParseError (AGG-05)
  </behavior>
  <action>
    Write src/sources/afisha-surguta/index.test.ts FIRST (RED) against the fixture for the behaviors above. Then implement src/sources/afisha-surguta/index.ts: export parseAfishaSurguta(html:string): NormalizedEvent[] using cheerio + confirmed selectors (anchors href^="/content/", traverse to date/venue per SELECTORS.md). For each: title from anchor; strip trailing age suffix (/\s+\d{1,2}\+$/) into ageLimit; strip trailing price (/\s+\d[\d\s]*\s*₽$/) into priceText via parseRussianPrice; startDate from first date in the (possibly range) date string via parseRussianDate (default midnight UTC+5 when no time); category classified by content heuristics since no category URLs exist (RESEARCH critical finding); sourceUrl='https://afisha.surguta.ru'+href; isSeed:false. Min-results guard (<2 -> throw). Export afishaSurgutaAdapter implementing SourceAdapter (name 'afisha-surguta', displayName 'Афиша Сургута', homeUrl, timeoutMs 12000) whose scrape() checks isAllowed (robots.txt), fetches only '/' via fetchHtml (which already handles windows-1251 decode), and — if any additional request to this domain is made — enforces the 10s crawl-delay (CRAWL_DELAY_MS 10000) between requests (SRC-07). Phase 1 fetches the single listing page (no detail pages), so document that the crawl-delay helper is in place for future detail fetches.
  </action>
  <verify>
    <automated>npx vitest run src/sources/afisha-surguta/index.test.ts && grep -q "10000\|10_000\|CRAWL_DELAY" src/sources/afisha-surguta/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - index.test.ts committed RED before index.ts
    - parseAfishaSurguta(fixture) yields >= 2 events (isSeed:false); age/price-in-title cases handled; genitive date parses
    - scrape() calls isAllowed before fetching; crawl-delay (10s) constant present for inter-request delay; UA is the polite one (via fetchHtml)
    - min-results guard throws on <2 events
  </acceptance_criteria>
  <done>afisha.surguta produces normalized live events respecting robots.txt + crawl-delay + CP1251 — SRC-03/SRC-07 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: Register both adapters in the registry</name>
  <read_first>
    - src/sources/registry.ts (currently [seedAdapter])
    - .planning/research/ARCHITECTURE.md (registry.ts responsibility; pipeline iterates the array)
  </read_first>
  <action>
    Edit src/sources/registry.ts so the exported active-adapter array is [kassaUgraAdapter, afishaSurgutaAdapter, seedAdapter] (seed last, as honest fallback). No pipeline edits needed — runPipeline already iterates the array. Confirm the build still bundles (esbuild) with the new imports.
  </action>
  <verify>
    <automated>npm run build && npm run test && grep -q "kassaUgraAdapter" src/sources/registry.ts && grep -q "afishaSurgutaAdapter" src/sources/registry.ts</automated>
  </verify>
  <acceptance_criteria>
    - registry exports both live adapters plus seedAdapter
    - full vitest suite green; esbuild build succeeds with the new adapters bundled
  </acceptance_criteria>
  <done>The pipeline now scrapes both GREEN sources; live events (isSeed:false) flow into the cache and index.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| source HTML → parser | untrusted titles/venues become event fields served to clients |
| scraper → afisha.surguta | crawl-delay/robots compliance boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-16 | Tampering | XSS in scraped titles | mitigate | cheerio `.text()` extracts text only (strips HTML/entities); raw innerHTML never stored or served |
| T-01-17 | Denial of Service | afisha.surguta rate-limit/block | mitigate | isAllowed(robots) before fetch; 10s crawl-delay constant; bounded p-retry; polite UA (SRC-07) |
| T-01-18 | Tampering | structure change -> empty parse | mitigate | min-results guard throws on <2 events -> serve-stale, cache not overwritten (AGG-05) |
</threat_model>

<verification>
- vitest green for both adapter fixture tests + min-results guard
- registry includes both live adapters; full suite + build green
- afisha.surguta scrape respects robots + 10s crawl-delay constant; cheerio imported as namespace
</verification>

<success_criteria>
- SRC-02: kassa-ugra normalized events from real HTML
- SRC-03: afisha.surguta normalized events respecting robots.txt + crawl-delay
- SRC-07: polite UA, timeout, retry, robots, crawl-delay enforced
- AGG-01: both adapters output the NormalizedEvent model
- AGG-02: live events isSeed:false; AGG-05: min-results guard active
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-7-SUMMARY.md` when done
</output>
