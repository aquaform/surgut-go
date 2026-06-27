---
phase: 03-yellow-sources-text-search
plan: 3
type: execute
wave: 2
depends_on: ["03-1"]
files_modified:
  - src/sources/kassir-sur/index.ts
  - src/sources/kassir-sur/index.test.ts
  - src/sources/yandex-afisha/index.ts
  - src/sources/yandex-afisha/index.test.ts
  - src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html
autonomous: true
requirements: [SRC-05, SRC-06]
must_haves:
  truths:
    - "kassir-sur is shipped as an HONEST disabled stub: it carries enabled:false with a documented reason and never fabricates events — its scrape() throws if ever called"
    - "kassir-sur exposes a machine-readable reason string so the status panel can show it as 'blocked' (handled in 03-4), not a fake event count"
    - "parseYandexAfisha(fixture) returns ≥2 NormalizedEvents with isSeed:false, sourceName 'yandex-afisha', hasTime:true for timed cards"
    - "yandexAfishaAdapter declares enabled:false and tosRisk:true (off by default per ToS §3.1)"
    - "yandexAfishaAdapter.scrape throws an Error tagged 'HTTP 403' when the source returns 403, enabling the 'blocked' mapping in 03-4 (criterion 3)"
  artifacts:
    - path: "src/sources/kassir-sur/index.ts"
      provides: "disabled stub adapter with enabled:false + reason"
      contains: "enabled"
    - path: "src/sources/yandex-afisha/index.ts"
      provides: "parseYandexAfisha + yandexAfishaAdapter (enabled:false, tosRisk:true)"
      exports: ["parseYandexAfisha", "yandexAfishaAdapter"]
    - path: "src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html"
      provides: "captured live Yandex HTML for offline tests"
  key_links:
    - from: "src/sources/yandex-afisha/index.ts"
      to: "src/utils/date.ts parseDateFull"
      via: "Format 4 date+hasTime extraction"
      pattern: "parseDateFull"
    - from: "yandexAfishaAdapter.scrape"
      to: "HTTP 403 handling"
      via: "tagged error rethrow"
      pattern: "403"
---

<objective>
Phase Goal (user story): As a Surgut resident, I want the app to be honest about sources it cannot scrape — Кассир is shown as intentionally disabled (never faked), and Яндекс Афиша is available only when an operator opts in — so that I always know what data is real.

This plan delivers the two constraint-bound sources: SRC-05 (sur.kassir.ru) as an HONEST disabled stub, and SRC-06 (afisha.yandex.ru/surgut) as a disabled-by-default adapter. Research proved kassir.ru renders zero events in static HTML and exposes no API reachable without a headless browser (forbidden by AGENTS.md). The roadmap's "minimum 10 events" criterion for kassir CANNOT be met under the no-headless / single-container constraint, so we ship it as a transparent `enabled:false` stub with a documented reason — this is a constraint-driven honest outcome, not a hidden failure. Yandex is real SSR but ToS §3.1 permits Yandex to block automated access, so it ships off by default with tosRisk:true and a 403→blocked path. Registry/run wiring is deferred to 03-4.

Purpose: Add the remaining two sources without violating robots/ToS or the honesty mandate.
Output: kassir-sur disabled stub + test, yandex-afisha adapter + fixture + test. Self-contained modules (no shared registry/run edits).
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
From src/sources/base.ts — SourceAdapter { name, displayName, homeUrl, timeoutMs, scrape() }.
From src/utils/date.ts — parseDateFull (03-1; Format 4 handles "DD месяца, HH:MM").
From src/utils/http.ts — fetchHtml(url, timeoutMs). From src/utils/robots.ts — isAllowed(url). From src/utils/price.ts — parseRussianPrice.
From src/types/events.ts — NormalizedEvent (optional hasTime), EventCategory.
Mirror: src/sources/afisha-surguta/index.ts for parser/adapter shape; src/sources/seed/index.ts shows a minimal adapter object.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Ship kassir-sur as an honest disabled stub</name>
  <files>src/sources/kassir-sur/index.ts, src/sources/kassir-sur/index.test.ts</files>
  <read_first>
    - src/sources/base.ts (SourceAdapter contract)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (section "SRC-05: sur.kassir.ru — Detail", "Recommended Design: Disabled Stub", Pitfall 2, Pitfall 5)
    - AGENTS.md (no headless/native modules; honest data), CLAUDE.md
  </read_first>
  <action>
    Create `src/sources/kassir-sur/index.ts` exporting `kassirSurAdapter` typed `SourceAdapter & { enabled: false; reason: string }`. Fields: name 'kassir-sur', displayName 'Кассир Сургут', homeUrl 'https://sur.kassir.ru', timeoutMs 0, `enabled: false as const`, `reason: 'Требует браузера; источник полностью клиентский — отключён в MVP'`. Its `scrape()` MUST throw `new Error('kassir-sur: adapter disabled — fully client-rendered source')` (it is never called when wired correctly in 03-4; the throw is a safety net). Add a top-of-file doc comment recording the live-probe evidence (all category pages return 0 event cards despite "Найдено N событий", no public API, deferred to v2). Do NOT write any HTML fetching or parsing code and do NOT fabricate events (Pitfall 2 / honesty mandate). In index.test.ts assert: enabled===false, a non-empty reason string is present, and `await expect(kassirSurAdapter.scrape()).rejects.toThrow()` — proving it never returns fabricated data.
  </action>
  <acceptance_criteria>
    - `grep -n "enabled: false\|reason" src/sources/kassir-sur/index.ts` shows the disabled flag and reason
    - `grep -ci "fabricat\|fake\|placeholder\|mock event" src/sources/kassir-sur/index.ts` returns 0 (no fabricated data)
    - `npx vitest run src/sources/kassir-sur/index.test.ts` passes including the scrape()-throws assertion
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/sources/kassir-sur/index.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>kassir-sur is a documented, honest disabled stub with enabled:false + reason; no scraping, no fabricated events; tests prove scrape() throws.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Capture Yandex fixture + implement parseYandexAfisha + disabled-by-default adapter</name>
  <files>src/sources/yandex-afisha/index.ts, src/sources/yandex-afisha/index.test.ts, src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html</files>
  <read_first>
    - src/sources/afisha-surguta/index.ts (parser + adapter mirror)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (sections "SRC-06: afisha.yandex.ru/surgut — Detail", "New Date Format Required: Format 4", "adapter config and safety design", "HTTP 403 handling", ToS §3.1)
  </read_first>
  <behavior>
    - parseYandexAfisha(fixture).length ≥ 2
    - every event: isSeed===false, sourceName==='yandex-afisha', title non-empty, valid startDate
    - a "DD месяца, HH:MM" card yields hasTime===true with correct UTC hour (e.g. 19:00 Surgut → 14:00 UTC)
    - parseYandexAfisha('<html></html>') throws an Error including 'ParseError'
    - yandexAfishaAdapter.enabled===false and yandexAfishaAdapter.tosRisk===true
  </behavior>
  <action>
    Fetch `https://afisha.yandex.ru/surgut` live via curl (Accept-Language ru-RU, polite UA) and save to `src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html`; verify it contains ≥2 `a[href*="/surgut/concert/"]` or `/surgut/performance/` anchors with date strings matching `\d{1,2}\s+[а-яё]+,\s+\d{2}:\d{2}`. If live capture yields no SSR events or 403, STOP and record a `## Blocker` in the SUMMARY (do not fabricate). Then create `src/sources/yandex-afisha/index.ts` exporting `parseYandexAfisha(html)` and `yandexAfishaAdapter: SourceAdapter & { enabled: boolean; tosRisk: boolean }`. Constants: SOURCE_NAME 'yandex-afisha', HOME_URL 'https://afisha.yandex.ru', LISTING_URL `${HOME_URL}/surgut`, timeoutMs 10000, enabled false, tosRisk true. Parser: iterate `$('a[href*="/surgut/concert/"], a[href*="/surgut/performance/"]')`; title = largest/first text element; date string matched by `/\d{1,2}\s+[а-яёА-ЯЁ]+,\s+\d{2}:\d{2}/` fed to `parseDateFull` (Format 4 → hasTime); price matched by `/от\s+[\d\s]+₽/i` via parseRussianPrice; skip cards with no title or no parseable date; sha1 makeId like afisha-surguta; min-results guard throwing `ParseError: yandex-afisha returned <2 events ...` on <2. scrape(): robots gate via isAllowed(LISTING_URL); fetchHtml; in the catch, if the error message contains '403' rethrow `new Error('HTTP 403 — source blocked')` (so 03-4 maps it to status 'blocked'); only `/surgut` root is fetched (concerts subpath is 404). Write fixture tests in index.test.ts mirroring afisha-surguta covering the behavior block (including the empty-HTML throw and the enabled/tosRisk assertions).
  </action>
  <acceptance_criteria>
    - `test -s src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html` and `grep -cE 'href="[^"]*/surgut/(concert|performance)/' .../yandex-2026-06-27.html` ≥2
    - `grep -n "enabled\|tosRisk" src/sources/yandex-afisha/index.ts` shows enabled:false and tosRisk:true
    - `grep -n "403" src/sources/yandex-afisha/index.ts` shows the tagged rethrow
    - `grep -n "parseDateFull\|isAllowed\|cheerio/slim" src/sources/yandex-afisha/index.ts` confirms shared-util reuse
    - `npx vitest run src/sources/yandex-afisha/index.test.ts` passes; `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/sources/yandex-afisha/index.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>yandex-afisha parser + disabled-by-default adapter exist, set hasTime via Format 4, throw a 403-tagged error, enforce the min-results guard, and pass fixture tests. Module is self-contained (no registry edits here).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Yandex HTML → adapter | Untrusted third-party markup |
| adapter → outbound HTTP (Yandex) | ToS-restricted automated access (off by default) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-06 | Repudiation/ToS | automated access to Yandex (ToS §3.1) | mitigate | enabled:false default + tosRisk:true documented; operator must opt in; robots gate + bounded timeout |
| T-03-07 | Tampering | kassir stub silently fabricating events | mitigate | scrape() throws; test asserts rejection; honesty grep gate (no fabricated data) |
| T-03-08 | Denial of Service | Yandex 403 crashing the refresh loop | mitigate | 403 rethrown as tagged 'HTTP 403 — source blocked'; 03-4 maps to 'blocked' without crashing (criterion 3) |
| T-03-09 | Information Disclosure | scraped fields rendered in UI | accept | escHtml() in renderCard() already escapes all event fields |
| T-03-SC | Tampering | npm/pip/cargo installs | accept | Zero new packages (RESEARCH Package Legitimacy Audit) — gate N/A |
</threat_model>

<verification>
- `npx vitest run src/sources/kassir-sur/index.test.ts src/sources/yandex-afisha/index.test.ts` green
- `npx tsc --noEmit` clean
- kassir reason string present; no fabricated kassir events; Yandex fixture SSR-event-bearing
</verification>

<success_criteria>
kassir-sur ships as an honest, documented disabled stub (enabled:false, reason, scrape throws, no fake events). yandex-afisha is a real, disabled-by-default adapter (tosRisk:true) producing ≥2 fixture events with hasTime and a 403-tagged error path — both ready for wiring in 03-4.
</success_criteria>

<output>
Create `.planning/phases/03-yellow-sources-text-search/03-3-SUMMARY.md` when done.
</output>
