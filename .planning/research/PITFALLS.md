# Pitfalls Research — surgut-go Afisha Aggregator

**Domain:** Public event-listing aggregator (scraping Russian afisha sources)
**Researched:** 2026-06-26
**Confidence:** HIGH for source verdicts (all probed live); MEDIUM for ToS/legal (Russian ToS not always published)

---

## Source Feasibility Table

Every source was probed live on 2026-06-26. HTTP status, robots.txt, and page structure observed directly.

| Source | HTTP | robots.txt for content paths | Data format | Anti-bot | Verdict |
|--------|------|------------------------------|-------------|----------|---------|
| afisha.surguta.ru | 200 OK | ALLOWED — Drupal default robots; `Crawl-delay: 10`; blocks `/admin/`, `/search/`, `/user/login/` only | SSR plain HTML (Drupal CMS), no JS required, no JSON-LD | None detected | **GREEN** |
| kassa-ugra.ru/afisha | 200 OK | ALLOWED — blocks only `*.php` and `*.doc` files; no crawl-delay; `/afisha` path unrestricted | SSR plain HTML (custom ticketing backend), numbered pagination `?page=N` | None detected | **GREEN** |
| afisha.ru/surgut/events/ | 200 OK | ALLOWED for `/surgut/` paths; robots.txt blocks `/schedule/?`, query-filtered pages; `/surgut/events/` itself not blocked | HTML event listings visible in SSR response; no JSON-LD or `__NEXT_DATA__`; JS needed for filter interactivity only | None detected | **YELLOW** |
| afisha.yandex.ru/surgut | 200 OK | ALLOWED for `/surgut` content; blocks API and account paths | React SPA but partial SSR — event titles, prices "от X ₽", dates, venues visible in raw HTML | None detected currently; **Yandex ToS §3.1 explicitly authorises blocking automated access** | **YELLOW** |
| sur.kassir.ru | 200 OK | ALLOWED for category paths (`/bilety-na-koncert` etc.); blocks transactional paths, tracking params; `?*` root query blocked but category paths are clean | Initial HTML contains calendar + "Найдено 30 событий" but full event cards require AJAX ("Показать ещё" button) | None detected | **YELLOW** |
| tbank.ru/gorod/afisha/surgut/ | 200 OK | ALLOWED — no /gorod or /afisha restrictions in robots.txt | Next.js CSR — raw HTML is a skeleton; page literally shows "Не смогли загрузить" placeholder; zero event data without JS execution | None detected, but T-Bank is major fintech — may add protection | **RED** |

### Verdict Reasoning

**GREEN — afisha.surguta.ru:** Drupal SSR means full event HTML is in the initial HTTP response. Main page and individual `/content/event-slug` pages confirmed working. Robots.txt mandates 10-second crawl delay; honouring it is mandatory. No ToS on-site. Category URL paths use Drupal taxonomy — exact aliases unknown (the nav shows category labels but `href` values were not resolvable from fetched HTML; require first-use investigation to map category slugs).

**GREEN — kassa-ugra.ru:** Cleanest structure found. ~36 events across 3 pages, consistent HTML: `[title] | [venue] | [day abbr month] HH:MM [weekday] | [price range]`. Numbered pagination (`/afisha?page=2`). Image CDN is `tickets.s3.yandex.net` (external; may change independently). No legal restrictions found.

**YELLOW — afisha.ru:** Event cards visible in SSR HTML with title, price, venue links. No structured data. Robots.txt is complex and could add `/surgut/` restrictions in future updates. Afisha.ru is a large commercial platform; site redesigns have historically been frequent and break selectors. Requires selector fragility mitigation.

**YELLOW — afisha.yandex.ru:** Event titles, venues, dates, and prices appeared in the raw HTML response (`15 сентября, 19:00`, `от 3 500 ₽`, `Дворец искусств «Нефтяник»`). But Yandex General ToS §3.1: *"Яндекс может запретить автоматическое обращение к своим сервисам"* — Yandex can block automated access unilaterally and without notice. Legal risk is real. Use only if explicitly accepted as low-durability.

**YELLOW — sur.kassir.ru:** Category pages (`/bilety-na-koncert`, `/bilety-v-teatr`, `/detskaya-afisha`) confirmed; robots.txt allows them. However, the "Показать ещё" (show more) is AJAX-loaded; only the first batch (~10-15 events) may appear in initial HTML. Date-filtered URLs (`?date_from=DD.MM.YYYY`) are available but the root `/?*` pattern in robots.txt may flag them. Needs careful first-page-only scraping or session-mimicking "load more" calls.

**RED — tbank.ru:** Confirmed requires JavaScript execution. The HTML skeleton contains zero event data — the page shows a loading spinner placeholder with "Не смогли загрузить" fallback text. No public Afisha API in T-Bank's developer portal (verified: their public API covers payments, banking, investments only). Internal API endpoints unknown. Would require Playwright/Puppeteer, which violates the project's `node:20-slim` single-container constraint without significant complexity. Do not include in MVP.

### MVP Source Priority

Start with these for Phase 1 (high confidence, no JS required, respect robots):
1. **kassa-ugra.ru/afisha** — simplest, cleanest HTML, ~36 events, no crawl-delay
2. **afisha.surguta.ru** — Drupal SSR, 10-second crawl delay mandatory, category slug mapping needed
3. **afisha.ru/surgut/events/** and **/surgut/concerts/** — YELLOW but HTML-accessible, adds breadth

Add in Phase 2 if green sources insufficient:
4. **sur.kassir.ru** — AJAX complication; implement first-page-only extraction initially
5. **afisha.yandex.ru/surgut** — accept legal risk explicitly, monitor for blocks

Do not implement in MVP:
6. **tbank.ru** — RED; defer until CSR strategy (Playwright sidecar) is scoped separately

---

## Critical Pitfalls

### Pitfall 1: Silently Serving Stale Cache as Live Data

**What goes wrong:**
Parser fails (source down, structure changed, rate-limited). The TTL-cached JSON from the last successful run is served to users without any indication it is not fresh. Users see events that already happened or times that are wrong, but the UI says nothing.

**Why it happens:**
Developers add a cache fallback for resilience but forget to thread the "data freshness" signal through to the UI and API response. The cache feels like a "just works" safety net.

**How to avoid:**
Every cached response must carry a `fetchedAt` timestamp and a `sourceStatus: "live" | "cached" | "blocked" | "error"` field. The `/api/sources/status` endpoint (already in scope per PROJECT.md) must surface per-source status. The UI must visibly distinguish live vs cached results — even just a small "данные от [timestamp]" label per source is sufficient. The `/api/events` response envelope must include `dataFreshnessSeconds` and a `sourcesLive` boolean.

**Warning signs:**
- Cache JSON has events from yesterday showing "сегодня" label
- No `fetchedAt` field in the JSON cache files
- Source status API always returns "live"

**Phase to address:** Phase 1 (cache + status layer must be built before first live source)

---

### Pitfall 2: Russian Date Parsing Failures

**What goes wrong:**
Russian month names and relative date labels cause silent parse errors. Dates are stored as `null` or `Invalid Date`. Events are excluded from "today" filter. Cross-source deduplication fails because dates don't match.

**Why it happens:**
`new Date("27 июн 23:00")` returns `Invalid Date` in Node.js. The `Date` constructor only handles English month names and ISO 8601. Developers assume strptime-style parsing "just works" or forget that Surgut is UTC+5.

**How to avoid:**
Build a dedicated `parseRussianDate(text: string, referenceYear: number): Date | null` utility in Phase 1 before any parser is written. Cover these observed formats:
- `27 июн 23:00 Сб` (kassa-ugra.ru)
- `15 сентября, 19:00` (afisha.yandex.ru — genitive case month)
- `15 февраля 2024 / 19:00` (afisha.surguta.ru event pages)
- `сегодня`, `завтра`, `послезавтра` relative labels
- Missing year (assume current year; if parsed month < current month, assume next year)

Russian month name lookup table (nominative + genitive, both common):

```
январь/января=1, февраль/февраля=2, март/марта=3,
апрель/апреля=4, май/мая=5, июнь/июня=6,
июль/июля=7, август/августа=8, сентябрь/сентября=9,
октябрь/октября=10, ноябрь/ноября=11, декабрь/декабря=12
// Abbreviations: янв, фев, мар, апр, май, июн, июл, авг, сен, окт, ноя, дек
```

All parsed dates must be interpreted in `Asia/Yekaterinburg` (UTC+5, Surgut timezone). Use `Intl.DateTimeFormat` or the `date-fns-tz` library.

**Warning signs:**
- Event model has `startDate: null` in parsed output
- "Today" filter returns zero events when source has upcoming events
- Same event from two sources has startDate diff > 1 hour

**Phase to address:** Phase 1 (utility function with test coverage before any parser)

---

### Pitfall 3: Brittle CSS Selectors Breaking Silently

**What goes wrong:**
A site updates its HTML template (CMS upgrade, A/B test, new ad placement). Selectors like `.event-card .title` no longer match. Parser returns empty array. Cache TTL expires. App shows zero events with no error — just an empty list.

**Why it happens:**
Selectors are written once and never validated. Parsers don't assert minimum expected result counts. Empty arrays are treated as valid responses.

**How to avoid:**
Each parser must implement a minimum-results assertion: if a page is reachable (HTTP 200) but returns fewer than 2 events, treat it as a parse failure and trigger `sourceStatus: "error"` rather than replacing good cache with an empty array. Add a structural smoke-test: check that at least one critical selector resolves (`document.querySelector('.event-title')` or equivalent) before iterating.

For afisha.surguta.ru (Drupal): selectors are more stable than React sites; lower risk but still possible on CMS upgrades.
For afisha.ru: highest selector fragility risk — large commercial site with frequent redesigns.

Keep selectors in a per-source config object (not hardcoded in loops) so they can be updated without touching parser logic.

**Warning signs:**
- Parser returns `[]` on HTTP 200 response
- `eventsCount` in source status drops from ~30 to 0 suddenly
- No change in source HTML status but event count changes dramatically

**Phase to address:** Phase 1 (assertion guard at parser level); Phase 2 (structural smoke-test per source)

---

### Pitfall 4: Deduplication False Positives and False Negatives

**What goes wrong:**
False positive: "Пикник. Вечное движение" (tbank) and "ПИКНИК" (afisha.ru) and "Группа ПИКНИК" (kassa-ugra) are deduplicated into one card, merging fields from different shows or losing price data from one source. False negative: The same concert appears twice in the final list from different sources because title normalisation missed a spelling variant.

**Why it happens:**
Dedup is implemented as exact-match on title, which is too strict (misses variants). Or fuzzy-match on title alone, which is too loose (confuses different shows by similar names, or matinees vs evening shows of the same production).

**How to avoid:**
Use a composite dedup key: `(normalisedTitle, startDate±30min, venueFuzzy)`. "Normalised title" means: lowercase, strip punctuation, collapse spaces, strip leading articles ("спектакль", "концерт", "шоу", "выставка"). Never deduplicate on title alone. When a match is found, merge by keeping the richer record (prefer the source with price, image, and direct ticket URL). Store `sources: [{name, url}]` array so the merged card can show all source links.

A matinee (14:00) and an evening show (19:00) of the same theatre production are different events — the `±30min` tolerance on time prevents them from merging.

**Warning signs:**
- Event card shows price from one source but ticket URL from a different show
- Same band appearing twice on same date/venue
- Dedup logs show 0 merges (too strict) or merges across different venues (too loose)

**Phase to address:** Phase 2 (normalisation layer after parsers are working individually)

---

### Pitfall 5: Price Text Parsing Inconsistency

**What goes wrong:**
Price field ends up as a raw string like `"5500 - 8800"` in one source, `"от 500 ₽"` in another, `"бесплатно"` in a third, and `"2200-7500 руб"` in a fourth. The "free events" filter (`?free=true`) doesn't work because "бесплатно" and "Вход свободный" are not normalised. Price range minimum for "cheapest events" filter is inconsistent.

**Why it happens:**
Each parser is written independently. Price normalisation is treated as a detail to do later. Later never comes.

**How to avoid:**
Normalise price in the parser, not in the UI. Use a `parseRussianPrice(text: string): { minRub: number | null; maxRub: number | null; isFree: boolean; displayText: string }` utility. Known formats observed in this probe:

```
"5500 - 8800"      → { min: 5500, max: 8800, free: false }
"от 500 ₽"         → { min: 500,  max: null,  free: false }
"2200-7500 руб"    → { min: 2200, max: 7500,  free: false }
"900"              → { min: 900,  max: null,  free: false }
"бесплатно"        → { min: 0,   max: 0,    free: true  }
"Вход свободный"   → { min: 0,   max: 0,    free: true  }
"Вход свободный, по билетам от ..." → parse out number
```

If parsing fails, set `minRub: null` and keep `displayText` for human display. Never fail the whole event parse because price text is unrecognised.

**Warning signs:**
- Free filter shows paid events
- Price range filter not working for kassa-ugra events (raw "5500 - 8800" string)
- `minRub` is null for most events

**Phase to address:** Phase 1 (shared price utility, co-developed with date utility)

---

### Pitfall 6: Crawl Politeness / IP Rate-Limiting

**What goes wrong:**
Scraper hits a source too fast (multiple requests per second during startup or scheduled refresh). Source returns 429 Too Many Requests or silently blocks the IP. All subsequent requests return empty pages or HTML error pages that look like content (parser sees valid HTML, returns empty events, overwrites good cache).

**Why it happens:**
`Promise.all([source1, source2, source3])` fires all sources simultaneously. Each source has multiple pages (kassa-ugra has 3). Concurrent page fetches within one source add up quickly.

**How to avoid:**
- **afisha.surguta.ru**: Hard minimum 10 seconds between requests (robots.txt Crawl-delay: 10). Implement as a per-domain queue with configurable delay.
- **All other sources**: 2-second minimum between requests to the same domain as a default politeness policy.
- Fetch sources sequentially or with controlled concurrency (max 1 concurrent request per domain).
- Add `User-Agent: surgut-go-aggregator/1.0 (+https://surgut-go.apps.sielom.ru)` header — transparent, non-deceptive.
- Detect 429 responses and treat as `sourceStatus: "rate-limited"`, do not retry immediately.

**Warning signs:**
- Scraper runtime under 30 seconds for all sources (too fast)
- 429 responses in logs
- Empty events array coincides with high request frequency

**Phase to address:** Phase 1 (build rate-limiting into the HTTP fetch layer before first source is connected)

---

### Pitfall 7: Character Encoding Issues (CP1251 Legacy)

**What goes wrong:**
Cyrillic text is garbled in event titles and venue names. Characters appear as `???` or mojibake (`Ðº´Ð»Ñ`). Causes dedup mismatches (same event seen as different titles) and ugly display.

**Why it happens:**
afisha.surguta.ru is a legacy Drupal site. Some Drupal 7-era Russian sites served content as Windows-1251 (CP1251) even if the `<meta charset>` declared UTF-8. The mismatch causes encoding issues when parsing with `TextDecoder` defaulting to UTF-8.

**How to avoid:**
Always check the `Content-Type` response header for charset. If charset is `windows-1251` or page contains `charset=windows-1251` in meta tags, decode with `new TextDecoder('windows-1251')`. The `got`/`axios` HTTP library handles this automatically if you inspect the response charset — don't assume UTF-8. Test with the Cyrillic-heavy event titles: `Вячеслав БУТУСОВ`, `группа ЛЮБЭ` should parse cleanly.

**Warning signs:**
- Garbled Cyrillic in parsed event titles
- Event titles fail UTF-8 validation checks
- `encodeURIComponent(title)` throws on parsed strings

**Phase to address:** Phase 1 (HTTP fetch utility layer, before first parser)

---

### Pitfall 8: AJAX Pagination Not Handled (sur.kassir.ru)

**What goes wrong:**
The scraper fetches `/bilety-na-koncert` and extracts 0 or very few events because the event cards are loaded via AJAX "Показать ещё" (show more). The page declares "Найдено 30 событий" but only the calendar widget appears in static HTML. The parser reports 0 events, overwrites good cache, and the source appears broken.

**Why it happens:**
Developers test with `curl` or `fetch()` and see the "30 found" message, assuming events will follow. The events are loaded by a subsequent XHR call after the initial HTML is parsed by the browser.

**How to avoid:**
Two strategies, pick one:
1. **Discover the AJAX endpoint** (preferred): Use browser DevTools Network tab to find the XHR/fetch call triggered by "Показать ещё". Kassir.ru likely uses a REST API endpoint like `/api/events?category=concert&city=sur&page=1`. Call that directly.
2. **Use `?date_from=` filter links**: The calendar date-filtered URLs appear in static HTML and may return full daily event lists without AJAX pagination. Iterate by date range to collect events.

Do not use Playwright/headless browser for kassir.ru — adds complexity and violates the single-container constraint.

**Warning signs:**
- Parser returns 0-5 events from kassir.ru when "Найдено 30 событий" is on the page
- Event cards are not in the initial HTML response body

**Phase to address:** Phase 2 (kassir.ru is YELLOW — implement after GREEN sources are working)

---

### Pitfall 9: afisha.yandex.ru Legal/ToS Risk

**What goes wrong:**
Yandex sends a cease-and-desist, blocks the scraper's IP, or their automated access detection triggers a CAPTCHA wall. The source silently breaks. More seriously, the project is in violation of Yandex's terms of service.

**Why it happens:**
Yandex General ToS §3.1 explicitly states: *"Яндекс может запретить автоматическое обращение к своим сервисам, а также прекратить прием любой информации, сгенерированной автоматически"* — Yandex may prohibit automated access to their services at any time without notice.

**How to avoid:**
Treat afisha.yandex.ru as a best-effort, non-critical source. Never include it in the "minimum 2 sources must be live" resilience guarantee. Design the source as optional from day one with `enabled: false` being a valid config state. Document the ToS risk explicitly in code comments. Monitor for HTTP 403/429 responses. If blocked, disable immediately rather than retrying.

**Warning signs:**
- Sudden increase in 403 responses from afisha.yandex.ru
- Response HTML contains a bot-detection challenge page
- Yandex changes their robots.txt to disallow content paths

**Phase to address:** Phase 2 (only add if GREEN sources prove insufficient; add with explicit ToS risk flag in config)

---

### Pitfall 10: afisha.surguta.ru Category URL Mapping Unknown

**What goes wrong:**
The main page shows upcoming events but the category navigation URLs (for Concerts, Theatre, Exhibitions, etc.) could not be resolved from the fetched HTML — the nav links appear as text labels without visible `href` attributes in the WebFetch response. A parser that only scrapes the main page (`/`) will miss category-specific pages and limit to whatever appears on the homepage (typically 5-8 items per category).

**Why it happens:**
Drupal uses taxonomy terms for categories. The URLs might be `/taxonomy/term/N`, `/concerts`, or pathauto aliases. The WebFetch tool received the content but the navigation `<a>` href values were not captured (possibly JavaScript-rendered menu or HTML structure that WebFetch didn't resolve).

**How to avoid:**
During Phase 1 implementation, manually inspect the page in a browser devtools or use `curl -s https://afisha.surguta.ru/ | grep -o 'href="[^"]*"' | head -50` to extract all nav hrefs. Map the Drupal taxonomy term IDs to category names. Key categories to map: Концерты, Театр, Выставки, Клубы, Обучение, Детям.

**Warning signs:**
- Parser only has 5-8 events from afisha.surguta.ru
- All events from one category (e.g., all are concerts or all are exhibitions)
- No events from theatre or exhibitions categories appear

**Phase to address:** Phase 1 (discovery task before parser implementation)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode CSS selectors inline in parser loop | Fast to write | Single-file change needed per selector update; no way to diff structure | Never — always extract to per-source config object |
| Skip date parsing, store raw string | Avoids `parseRussianDate` utility | Filters (today/tomorrow/weekend) don't work; dedup fails | Never for production |
| Overwrite cache on empty parse result | Simple logic | Wipes good data when parser fails structurally; serves zero events | Never — require minimum-results assertion |
| Fetch all sources in `Promise.all` | Fast startup | Hits rate limits; afisha.surguta.ru requires 10s crawl delay | Never — use sequential or rate-limited queue |
| Use `innerHTML.replace(/<[^>]+>/g, '')` for text | Quick text extraction | Misses encoded entities (`&amp;`, `&nbsp;`); breaks Cyrillic in edge cases | Never — use proper HTML parsing (cheerio `.text()`) |
| Single dedup key = `title` exact match | Simple | Miss variants; merge different events with same performer name | Never — use composite key |
| Store `priceText` as raw string only | Fast | Free filter broken; price sort broken | OK in Phase 1 only if `isFree` boolean is also extracted |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| afisha.surguta.ru | Ignoring `Crawl-delay: 10` in robots.txt | Add per-domain delay queue; 10 seconds minimum between requests |
| kassa-ugra.ru | Assuming image URLs from `tickets.s3.yandex.net` are permanent | Cache image URLs but don't serve them as permanent; validate on each scrape cycle |
| afisha.ru | Fetching with `Accept-Language: en` header | Use `Accept-Language: ru-RU,ru;q=0.9` — English header can trigger different page structure |
| sur.kassir.ru | Treating "Показать ещё" page as complete event list | Use date-filtered URLs (`?date_from=`) or discover AJAX endpoint via DevTools |
| afisha.yandex.ru | Treating it as a stable, long-term source | Flag as `volatility: HIGH` in source config; design as easily disabled |
| tbank.ru | Attempting to scrape without Playwright | Do not implement; RED source requires JS runtime unavailable in node:20-slim |
| All sources | Using `Date.now()` timezone for "today" comparison | Use `Asia/Yekaterinburg` (UTC+5) for all date arithmetic |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Refresh all sources on every API request | Response time > 30 seconds | Pre-fetch on schedule (cron), serve from cache; never fetch on user request | Day 1 if not addressed |
| Fetching full event detail pages for each listing | 30 events × 5 sources = 150 HTTP requests per cycle | Extract all needed data from listing pages; only fetch detail pages for missing fields | When > 3 sources active with >10 events each |
| Loading entire cache JSON on every `/api/events` request | Memory spike, slow JSON parse | Keep cache in memory (process-level), reload only after TTL expiry or on-disk change | At ~500 events in cache |
| Unconstrained concurrent source fetches | Rate limits, IP blocks, 429 errors | Max 1 concurrent request per domain, with delay | First deployment |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing source URLs with auth tokens in code | Credential leak | Keep all sensitive config in environment variables; no secrets in source code |
| Serving user-provided search query directly in scraper URL | SSRF if scraper fetches arbitrary URLs | Scraper only fetches hardcoded source URLs; search is client-side filter on cached data |
| Not validating parsed event data before caching | Malicious content injection via scraped page (XSS payloads in event titles) | Sanitise all text fields before storing: strip HTML tags, limit length, validate encoding |
| Exposing full scraper error logs via `/api/sources/status` | Reveals internal URL structure and retry logic | Status endpoint shows human-readable status only: "live", "cached", "error"; no stack traces |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "live" badge when serving 6-hour-old cache | User plans event based on wrong time/price | Show `lastUpdated` timestamp per source; distinguish `live` vs `cached` states visually |
| Showing zero events when one source fails | Page looks broken; user leaves | Show events from working sources; show "X источник недоступен, данные могут быть устаревшими" notice |
| Mixing Russian and English date formats in UI | Cognitive dissonance for Russian-speaking users | Use Russian locale consistently: "сегодня, 19:00", "27 июня", "в эту субботу" |
| "бесплатно" events not shown in free filter | User can't find free events | Normalise free detection to `isFree: boolean` at parse time, not at filter time |
| Mood buttons returning empty results when parsers fail | User thinks app is broken | Always show at least cached results with clear "cache is from [time]" label |

## "Looks Done But Isn't" Checklist

- [ ] **Date parsing:** Tested with all 4 observed date formats AND relative labels (сегодня/завтра) AND missing-year edge case (December event in November)
- [ ] **Price parsing:** "бесплатно" and "Вход свободный" map to `isFree: true`; price range extracts `minRub`
- [ ] **Cache fallback:** Source failure test — kill network, verify app serves cached data with `sourceStatus: "cached"`, not empty list
- [ ] **Timezone:** All date comparisons use `Asia/Yekaterinburg` (UTC+5); "today" filter correct at 23:00 Surgut time
- [ ] **Crawl delay:** afisha.surguta.ru scraper has 10-second between-request delay; logged and testable
- [ ] **Minimum results assertion:** Parser returns `parseError: true` if HTTP 200 but fewer than 2 events (not overwriting cache with empty array)
- [ ] **Source status endpoint:** `/api/sources/status` returns per-source: `{name, status, lastSuccess, eventCount, cachedAt}`
- [ ] **Dedup composite key:** Dedup uses `(normTitle, startDate±30min, venue)`, not title-only
- [ ] **Encoding check:** afisha.surguta.ru response decoded correctly — Cyrillic in Бутусов, ЛЮБЭ titles renders clean
- [ ] **Category URL mapping:** afisha.surguta.ru category hrefs discovered and confirmed before Phase 1 parser is written

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Source HTML structure changed (selector breakage) | LOW | Update selector config object, redeploy; event count metric alerts you within 1 cycle |
| Source blocks IP (rate limit or anti-bot) | LOW-MEDIUM | Mark source `status: "blocked"` in cache; serve last good cache; investigate robots.txt; reduce crawl rate |
| Stale data served as live | MEDIUM | Add `fetchedAt` + `sourceStatus` to response immediately; add UI staleness warning; this requires code + redeploy |
| Yandex blocks afisha.yandex.ru scraper | LOW (if designed as optional) | Set `enabled: false` in source config; redeploy; no user-visible degradation |
| Date parsing returns null for new format | MEDIUM | Add new format to `parseRussianDate()` utility; re-run cache refresh |
| tbank.ru attempted and failed | LOW (RED from start) | Never implement; document as deferred; no rollback needed |
| Dedup merging wrong events | HIGH (data integrity) | Widen composite key, add venue check, add time tolerance; purge cache; re-scrape |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stale cache served as live | Phase 1 — cache layer | `/api/sources/status` returns per-source `cachedAt`; UI shows staleness label |
| Russian date parsing failures | Phase 1 — shared utilities | Unit tests: all 4 formats + relative labels + year-boundary cases pass |
| Brittle CSS selectors | Phase 1 — minimum-results assertion | Parser returns `parseError` on HTTP 200 + 0 results; confirmed in test |
| Price parsing inconsistency | Phase 1 — shared utilities | Unit tests: all observed price formats normalise to `{minRub, isFree}` |
| Crawl politeness / rate limits | Phase 1 — HTTP fetch layer | Logs show >= 10s delay per afisha.surguta.ru request; 2s for others |
| Character encoding issues | Phase 1 — HTTP fetch utility | Cyrillic event titles from afisha.surguta.ru render correctly in JSON output |
| AJAX pagination (kassir.ru) | Phase 2 — kassir.ru parser | Kassir.ru parser returns >= 20 events (not 0-5) |
| Dedup false positives/negatives | Phase 2 — normalisation layer | Dedup test: "ПИКНИК" and "Пикник. Вечное движение" merge correctly; matinee+evening don't |
| afisha.yandex.ru ToS risk | Phase 2 — source enabled flag | Source config has `volatility: "high"` and `tosRisk: true`; `enabled` is a config toggle |
| afisha.surguta.ru category URL mapping | Phase 1 — pre-parser discovery | Parser returns events from >= 3 categories (concerts, theatre, exhibitions) |

## Sources

- afisha.surguta.ru robots.txt — probed live 2026-06-26; Drupal default + `Crawl-delay: 10`
- kassa-ugra.ru robots.txt — probed live 2026-06-26; minimal restrictions
- afisha.ru robots.txt — probed live 2026-06-26; complex multi-agent file, no `/surgut/` disallow
- afisha.yandex.ru robots.txt — probed live 2026-06-26; blocks API/account paths, no `/surgut` disallow
- sur.kassir.ru robots.txt — probed live 2026-06-26; blocks transactional/tracking paths
- tbank.ru robots.txt — probed live 2026-06-26; no /gorod or /afisha restrictions
- Yandex General User Agreement §3.1 — fetched live from yandex.ru/legal/rules/ — authorises Yandex to block automated access
- afisha.surguta.ru main page — fetched live; confirmed Drupal SSR, plain HTML, no anti-bot
- kassa-ugra.ru/afisha pages 1-2 — fetched live; confirmed 12 events/page, 3 pages, Russian abbreviated month dates, price ranges
- afisha.ru/surgut/events/ and /concerts/ — fetched live; event listings in SSR HTML, no JSON-LD
- afisha.yandex.ru/surgut and /surgut/concert — fetched live; event data partially in SSR HTML
- sur.kassir.ru main page and /bilety-na-koncert — fetched live; confirmed AJAX "show more", 30 events declared
- tbank.ru/gorod/afisha/surgut/ — fetched live; confirmed CSR skeleton, zero event data in HTML, "Не смогли загрузить" placeholder
- T-Bank developer portal (developer.tbank.ru) — fetched live; no public Afisha/events API

---
*Pitfalls research for: surgut-go — Сургут afisha aggregator scraping feasibility*
*Researched: 2026-06-26*
