---
phase: 01-deployable-pipeline-green-sources
plan: 01-2
type: execute
wave: 2
depends_on: [01-1]
files_modified:
  - src/utils/date.ts
  - src/utils/date.test.ts
  - src/utils/price.ts
  - src/utils/price.test.ts
  - src/utils/http.ts
  - src/utils/robots.ts
autonomous: true
requirements: [AGG-04, SRC-07]
must_haves:
  truths:
    - "parseRussianDate handles all 4 observed formats, relative labels, and missing-year inference, interpreting Surgut as UTC+5"
    - "parseRussianPrice normalizes ranges, single prices, free text, and thousands-with-spaces into {minRub,maxRub,isFree,displayText}"
    - "fetchHtml retries politely, applies a descriptive User-Agent and timeout, and decodes windows-1251 when the source declares it"
    - "isAllowed checks robots.txt before scraping a URL"
  artifacts:
    - path: "src/utils/date.ts"
      provides: "parseRussianDate(text, refYear?) -> Date|null"
      contains: "RU_MONTHS"
    - path: "src/utils/price.ts"
      provides: "parseRussianPrice(raw) -> ParsedPrice"
    - path: "src/utils/http.ts"
      provides: "fetchHtml(url, timeoutMs?) -> string with retry + charset handling"
    - path: "src/utils/robots.ts"
      provides: "isAllowed(url) -> boolean"
  key_links:
    - from: "src/utils/http.ts"
      to: "p-retry"
      via: "pRetry wrapper around fetch"
      pattern: "pRetry"
---

<objective>
Build the shared Russian date/price parsing utilities (test-first) and the polite HTTP + robots layer that every source adapter depends on.

Purpose: RESEARCH/PITFALLS place these before any parser — wrong date/price parsing silently breaks filters and dedup, and an impolite fetch layer gets the scraper IP-blocked. Date and price are pure functions with fully-specified I/O (ideal TDD); http/robots wrap third-party libs.
Output: parseRussianDate, parseRussianPrice (both with passing tests covering all observed formats), fetchHtml (p-retry + AbortSignal.timeout + CP1251 decode + User-Agent), and isAllowed (robots-parser).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@.planning/research/PITFALLS.md
@src/types/events.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: parseRussianDate (test-first)</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Russian Date and Price Parsing — RU_MONTHS table, toUTC, inferYear; date.test.ts examples; Month Abbreviations table)
    - .planning/research/PITFALLS.md (Pitfall 2: Russian date parsing failures)
  </read_first>
  <behavior>
    - "6 сен 20:00 Вс" with refYear 2026 -> Date, getUTCHours()=15 (20:00 UTC+5), getUTCDate()=6
    - "15 апреля 2026" -> getUTCFullYear()=2026, getUTCMonth()=3, getUTCDate()=15
    - "22 октября, 2026" (genitive + comma + year) -> month 10, year 2026
    - "15 янв 19:00" with refYear 2026 when current month is June -> getUTCFullYear()=2027 (past month -> next year)
    - "сегодня" -> non-null today midnight; "завтра" -> tomorrow
    - "18 сентября - 29 декабря 2026" -> start date parsed from first date
    - "unknown text" -> null
  </behavior>
  <action>
    Write src/utils/date.test.ts FIRST covering the behaviors above (RED), then implement src/utils/date.ts: export parseRussianDate(text:string, refYear?:number): Date|null using the RU_MONTHS lookup (nominative + genitive + abbreviations) and SURGUT_UTC_OFFSET=5. Implement format 1 (DD ммм HH:MM [Ч]), format 2 (DD месяца [YYYY] with optional comma), relative labels (сегодня/завтра), private toUTC (convert Surgut local to UTC, handling hour underflow to previous day) and inferYear (month < current month -> next year). Return null for unrecognized input — never throw.
  </action>
  <verify>
    <automated>npx vitest run src/utils/date.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - date.test.ts was committed RED before date.ts implementation
    - All behavior cases pass; "20:00 Surgut" maps to 15:00 UTC; missing-year inference yields next year for past months
    - parseRussianDate returns null (not Invalid Date, never throws) on unparseable input
  </acceptance_criteria>
  <done>parseRussianDate covers all 4 formats + relative labels + year-boundary edge case with green tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: parseRussianPrice (test-first)</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Price Parsing — ParsedPrice, FREE_PATTERNS, edge cases list)
    - .planning/research/PITFALLS.md (Pitfall 5: price text parsing inconsistency)
  </read_first>
  <behavior>
    - "5500 - 8800" -> minRub 5500, maxRub 8800, isFree false
    - "3500-7500" (no spaces) -> 3500/7500
    - "900" -> minRub 900, maxRub null, displayText "от 900 ₽"
    - "300 руб." -> minRub 300, maxRub null
    - "33 000 ₽" -> 33000 (spaces in number stripped)
    - "бесплатно" and "Вход свободный" -> isFree true, displayText "Бесплатно"
    - "" or no digits -> minRub null, displayText "Цена не указана"
  </behavior>
  <action>
    Write src/utils/price.test.ts FIRST (RED) covering the behaviors above, then implement src/utils/price.ts: export interface ParsedPrice { minRub:number|null; maxRub:number|null; isFree:boolean; displayText:string } and parseRussianPrice(raw:string): ParsedPrice. FREE_PATTERNS regex /бесплатно|вход свободный|free/i. Strip whitespace inside numbers before extracting digit groups; 0 numbers -> nulls with displayText fallback; 1 number -> "от N ₽"; 2+ -> min/max with "min–max ₽". Never throw.
  </action>
  <verify>
    <automated>npx vitest run src/utils/price.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - price.test.ts committed RED before price.ts
    - All behavior cases pass, including "33 000 ₽" -> 33000 and both free-text variants -> isFree true
    - Empty/non-numeric input yields nulls and displayText "Цена не указана" (never throws)
  </acceptance_criteria>
  <done>parseRussianPrice normalizes every observed price format with green tests.</done>
</task>

<task type="auto">
  <name>Task 3: Polite HTTP fetch + robots compliance</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Code Examples: HTTP Fetch Utility, robots.txt Check; DEFAULT_HEADERS)
    - .planning/research/PITFALLS.md (Pitfall 6: crawl politeness; Pitfall 7: CP1251 encoding)
    - src/sources/SELECTORS.md (charset finding from Wave 0)
  </read_first>
  <action>
    Implement src/utils/http.ts: export fetchHtml(url:string, timeoutMs=10000): Promise<string> wrapping native fetch in pRetry (retries 2, minTimeout 1000, maxTimeout 4000). Use AbortSignal.timeout(timeoutMs); DEFAULT_HEADERS with User-Agent "surgut-go/1.0 (+https://surgut-go.apps.sielom.ru)", Accept-Language ru-RU,ru;q=0.9, Accept text/html, Accept-Encoding gzip,deflate,br. Throw on non-ok status. Detect charset from Content-Type; if windows-1251, read arrayBuffer and decode with new TextDecoder('windows-1251'); else res.text(). Implement src/utils/robots.ts: export isAllowed(url:string): Promise<boolean> using robots-parser, caching per-origin robots.txt in a Map; on robots.txt fetch failure default to allowed (true); check against the DEFAULT_HEADERS User-Agent. Export a delay/crawl helper or document that the 10s afisha.surguta crawl-delay is enforced in that adapter (SRC-07). No user input ever reaches fetch (SSRF-safe — only hardcoded source URLs).
  </action>
  <verify>
    <automated>npm run typecheck && grep -q "pRetry" src/utils/http.ts && grep -q "windows-1251" src/utils/http.ts && grep -q "surgut-go/1.0" src/utils/http.ts && grep -q "robotsParser\|robots-parser" src/utils/robots.ts</automated>
  </verify>
  <acceptance_criteria>
    - fetchHtml retries via p-retry, sets the descriptive User-Agent, uses AbortSignal.timeout, throws on non-ok, and decodes windows-1251 when declared
    - isAllowed checks robots.txt per origin (cached) and defaults to allowed only when robots.txt itself is unreachable
    - npm run typecheck exits 0
  </acceptance_criteria>
  <done>The HTTP/robots layer is polite (UA, timeout, retry, charset, robots) and ready for both adapters.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| scraper → third-party source | untrusted HTML + untrusted charset crosses here |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-02 | Tampering | fetchHtml(url) | mitigate | Only hardcoded source URLs are passed; no user input reaches fetch (SSRF-safe by construction) |
| T-01-03 | Denial of Service | source rate-limiting / IP block | mitigate | p-retry bounded (2 retries), AbortSignal.timeout, descriptive UA, robots.txt + crawl-delay respected (SRC-07) |
| T-01-04 | Info Disclosure | error strings | accept | http errors carry status + url only; no secrets in code or env reach error text |
</threat_model>

<verification>
- vitest green for date + price across all documented formats
- typecheck green; http.ts uses p-retry, UA, timeout, windows-1251 decode; robots.ts uses robots-parser with per-origin cache
</verification>

<success_criteria>
- AGG-04 satisfied: date + price utilities tested against every observed source format
- SRC-07 satisfied: fetch layer is polite (UA, timeout, retry, robots) with crawl-delay enforcement available to adapters
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-2-SUMMARY.md` when done
</output>
