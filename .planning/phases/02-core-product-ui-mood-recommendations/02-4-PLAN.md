---
phase: 02-core-product-ui-mood-recommendations
plan: 4
type: execute
wave: 3
depends_on: [02-3]
files_modified:
  - public/index.html
  - public/app.css
  - public/app.js
autonomous: false
requirements: [UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, QA-02]
must_haves:
  truths:
    - "On mobile, tapping a mood button fetches /api/recommendations and renders event cards within ~1s"
    - "Each card shows title, date/time, venue, price, reason, source, and an Открыть/Купить билет CTA to sourceUrl"
    - "Seed events display a Демо badge; live events show their source — no seed event is unbadged"
    - "Date chips (Сегодня/Завтра/Выходные/7 дней), free toggle, and category filter narrow visible cards with no refetch"
    - "Source status panel lists each source with live/cached/error/seed indicator"
    - "vitest coverage on business logic reaches >=80% lines"
  artifacts:
    - path: "public/index.html"
      provides: "Static mobile shell: 4 mood buttons, date chips, free toggle, category select, source <details> panel"
      contains: "data-mood"
    - path: "public/app.js"
      provides: "loadMood, applyFilters, renderCard, escHtml, humanizeDate, loadSources (vanilla, no framework)"
      min_lines: 150
    - path: "public/app.css"
      provides: "Mobile-first CSS for moods grid, chips, cards, badges, source dots"
  key_links:
    - from: "public/app.js"
      to: "/api/recommendations?mood="
      via: "fetch on mood-button click"
      pattern: "fetch\\(`?/api/recommendations"
    - from: "public/app.js"
      to: "/api/sources/status"
      via: "fetch on page load"
      pattern: "fetch\\('?/api/sources/status"
    - from: "public/index.html"
      to: "/app.js"
      via: "script src"
      pattern: "src=\"/app.js\""
---

<objective>
Replace the placeholder homepage with the full mobile-first "городской навигатор на вечер" UI: 4 mood buttons (UI-02) on a Russian shell (UI-01), event cards with all required fields + reason + CTA (UI-03), date-chip / free / category client-side filters (UI-04, UI-05), and visible source status with Демо/Кэш honesty badges (UI-07). Then run the QA-02 coverage gate to confirm >=80% lines across the business logic.

Purpose: This is the browser slice that finally delivers the phase's core value — a user taps a mood and sees honest, ranked cards. It consumes the plan 02-3 API; no server route changes are needed (served by existing @fastify/static).
Output: public/index.html (replaced), public/app.css (new), public/app.js (new), and a verified >=80% coverage report.
</objective>

<phase_goal>
**As a** mobile user in Surgut, **I want to** tap a mood button and immediately see ranked, honest event cards with a "почему рекомендовано" reason, **so that** I can decide where to go tonight.

This plan completes the vertical slice end-to-end in the browser. The human-verify checkpoint confirms the mobile rendering and honesty badges that automated tests cannot see.
</phase_goal>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md
@.planning/phases/02-core-product-ui-mood-recommendations/02-3-SUMMARY.md

<interfaces>
<!-- API response the client consumes (from plan 02-3 GET /api/recommendations?mood=). -->
// { mood, label, emoji, items: [{ event: SerializedEvent, reason: string }], meta: { count, generatedAt } }
// SerializedEvent fields used by the card: title, startDate(ISO), venue, priceText,
//   isFree, sourceName, sourceUrl, category, isSeed
// priceText sentinel "Цена не указана" -> hide the price line

<!-- GET /api/sources/status returns an array (from src/http/routes/sources.ts): -->
// [{ name, displayName, homeUrl, status: 'live'|'cached'|'blocked'|'error'|'seed', eventCount, fetchedAt: ISO|null, error? }]

<!-- Static serving (already configured, do NOT change server.ts): -->
// GET /        -> public/index.html
// GET /app.css -> public/app.css
// GET /app.js  -> public/app.js
</interfaces>

Project rules: NO React/Vite/SPA build — plain HTML/CSS/vanilla JS only; `node server.js` single container must keep working; never read/print .env. Pitfall 3: do NOT add a server route for GET /. Pitfall 4: escape every event field via escHtml() before innerHTML. Pitfall 7: render the Демо badge whenever item.event.isSeed === true.
</context>

<tasks>

<task type="auto">
  <name>Task 1: HTML shell + mobile-first CSS (UI-01, UI-02)</name>
  <read_first>
    - public/index.html (placeholder to replace)
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (sections "HTML Layout Sketch" and "CSS Approach" — exact markup and CSS to adapt)
  </read_first>
  <files>public/index.html, public/app.css</files>
  <behavior>
    - index.html is lang="ru", mobile viewport, links /app.css in head and /app.js before closing body
    - Contains a header, a .moods section with 4 .mood-btn buttons carrying data-mood="drink|dance|learn|music" and the correct emoji+label
    - Contains a #filters section (initially .hidden) with date .chip buttons (data-date="" / today / tomorrow / weekend / week), a #free-toggle checkbox, a #category-filter select, a #results main, and a #source-panel details with a #source-list
    - app.css is mobile-first (max container width ~480px), styles .moods as a 2x2 grid, .chips as a horizontal-scroll row, .card, .badge--demo / .badge--cached, and .dot--live/cached/error/blocked/seed
  </behavior>
  <action>
    Replace public/index.html with the full shell from the research "HTML Layout Sketch": ru lang, viewport meta, header (h1 "Куда пойти в Сургуте", subtitle), a .moods section with four .mood-btn buttons (data-mood drink/dance/learn/music, emojis and labels Выпить/Потанцевать/Понимать/Музыка), a #filters section with class hidden containing the date chips row (data-date values "", today, tomorrow, weekend, week with Russian labels), a .filter-row with #free-toggle checkbox and #category-filter select (options for all browsable categories), a #results main, and a #source-panel details with summary "Источники данных" wrapping #source-list. Link the stylesheet href "/app.css" in head and the script src "/app.js" before closing body. Create public/app.css from the research "CSS Approach" sketch: CSS variables, reset, mobile container, header, 2x2 .moods grid, .mood-btn (+ --active, :active), horizontal-scroll .chips and .chip (+ --active), .card with __title/__date/__venue/__price/__reason/__footer/__source/__cta, .badge/.badge--demo/.badge--cached, .sources panel with .dot color modifiers, and a .hidden utility. No web fonts, no external CSS, no build step.
  </action>
  <verify>
    <automated>node -e "const h=require('fs').readFileSync('public/index.html','utf8'); const m=(h.match(/data-mood=/g)||[]).length; if(m!==4) throw new Error('expected 4 mood buttons, got '+m); for(const id of ['filters','free-toggle','category-filter','results','source-list']) if(!h.includes(id)) throw new Error('missing #'+id); if(!h.includes('href=\"/app.css\"')||!h.includes('src=\"/app.js\"')) throw new Error('missing app.css/app.js link'); require('fs').statSync('public/app.css'); console.log('html+css ok');"</automated>
  </verify>
  <acceptance_criteria>
    - Verify command prints "html+css ok" (4 mood buttons, all required ids, app.css/app.js linked)
    - public/app.css exists and is non-empty
    - No framework/bundler/CDN references: grep -niE "react|vue|svelte|cdn|tailwind" public/index.html returns nothing
  </acceptance_criteria>
  <done>Mobile-first Russian shell with 4 mood buttons, filter controls, results area, and source panel is in place with its stylesheet.</done>
</task>

<task type="auto">
  <name>Task 2: Vanilla client — fetch, render, filter, honesty badges (UI-03, UI-04, UI-05, UI-07)</name>
  <read_first>
    - public/index.html (the element ids/data-attrs created in Task 1 that app.js binds to)
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (section "Client JS Fetch Flow" — humanizeDate, applyFilters, renderCard, escHtml, loadMood, loadSources, event bindings; "Card Markup Shape"; "CTA button text logic")
  </read_first>
  <files>public/app.js</files>
  <behavior>
    - On DOMContentLoaded: bind mood buttons -> loadMood(mood); bind date chips, free toggle, category select -> applyFilters()+renderCards(); call loadSources() once
    - loadMood(mood): mark active button, reveal #filters, reset chips/toggle/select, show a loading state, fetch /api/recommendations?mood=<mood>, store items, render
    - renderCard escapes every text field via escHtml(); renders title, humanized date/time, venue, price (omitted when "Цена не указана"), reason with mood emoji, source name, and a CTA anchor to sourceUrl with target="_blank" rel="noopener noreferrer" reading "Купить билет" for ticketing sources else "Открыть"
    - When item.event.isSeed === true, a .badge.badge--demo "Демо" element is rendered on the card
    - applyFilters narrows currentItems by date chip (today/tomorrow/weekend/week in UTC+5), free-only, and category — with NO network request
    - loadSources fetches /api/sources/status and renders #source-list with a .dot status indicator, displayName, eventCount, and relative freshness
    - A fetch failure renders a Russian error message, not a blank screen
  </behavior>
  <action>
    Create public/app.js as a single 'use strict' vanilla module (no imports, no framework) following the research "Client JS Fetch Flow": define SURGUT_OFFSET_MS, surgutDate(), humanizeDate() (Сегодня/Завтра/RU day+month, time omitted at 00:00); module-level state currentItems/activeMood/activeDateChip/freeOnly/activeCategory; applyFilters() returning the filtered currentItems per active chip+free+category; renderCards()/renderCard() producing the card markup from the research "Card Markup Shape" with the .badge--demo branch on isSeed, the priceText sentinel omission, the reason emoji map, and ctaText() choosing "Купить билет" for ticketing sources (kassa-ugra/kassir/tbank) else "Открыть"; escHtml() with the four entity replacements; loadMood() doing the fetch + state reset + loading/error states; loadSources() rendering the status list with .dot--<status> and a "N мин назад" freshness suffix; and a DOMContentLoaded handler wiring mood buttons, date chips (toggle .chip--active + re-filter), #free-toggle, #category-filter, and the initial loadSources(). Every event field inserted into innerHTML MUST pass through escHtml() (Pitfall 4). The Демо badge MUST render whenever item.event.isSeed === true (Pitfall 7).
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('public/app.js','utf8'); for(const t of ['/api/recommendations','/api/sources/status','escHtml','applyFilters','renderCard','isSeed','noopener']) if(!s.includes(t)) throw new Error('app.js missing '+t); new Function(s); console.log('app.js ok');"</automated>
  </verify>
  <acceptance_criteria>
    - Verify prints "app.js ok": file references /api/recommendations, /api/sources/status, escHtml, applyFilters, renderCard, isSeed, noopener and parses as valid JS (new Function(s) does not throw)
    - Every event text field is wrapped in escHtml() before innerHTML (manual read confirms title/venue/reason/sourceName escaped) — Pitfall 4
    - The Демо badge branch keys off item.event.isSeed === true — Pitfall 7
    - No framework/import/bundler usage: grep -niE "import |require\\(|react|vue|svelte" public/app.js returns nothing
  </acceptance_criteria>
  <done>Vanilla client fetches recommendations + source status, renders honest cards with reasons and CTAs, and applies date/free/category filters with no refetch.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verification — mobile rendering, end-to-end flow, honesty badges</name>
  <what-built>
    Full mobile UI: 4 mood buttons that fetch /api/recommendations, ranked event cards with title/date/venue/price/reason/source/CTA, date-chip + free + category client-side filters, a source-status panel, and Демо badges on seed events. Backend (engine + API) was verified by automated tests in plans 02-1 and 02-3.
  </what-built>
  <how-to-verify>
    1. Build and run the production bundle exactly as deploy does: `npm run build && node server.js` (do NOT use the dev server — confirm the single-container contract holds).
    2. Open http://localhost:3000 in a browser; toggle device toolbar to a phone width (~390px). Confirm the layout is mobile-first: 2x2 mood grid, no horizontal page overflow.
    3. Tap "🎶 Музыка" — cards should appear within ~1s. Confirm each card shows title, date/time, venue, price (or no price line when unknown), a "почему рекомендовано" reason, the source name, and an Открыть/Купить билет button that opens sourceUrl in a new tab.
    4. Tap "🍸 Выпить" then a different mood — confirm the list refetches and the active button highlights.
    5. Tap the date chips (Сегодня/Завтра/Выходные/7 дней), toggle "Только бесплатные", and change the category select — confirm cards filter instantly with NO network request (Network tab shows no new /api call on filter).
    6. Open the "Источники данных" panel — confirm each source shows a status dot, name, event count, and freshness.
    7. HONESTY CHECK: confirm any seed/demo card shows a "Демо" badge and no live event is shown without its source. (If all live sources are healthy, temporarily confirm by inspecting a card known to be seed, or note that seed only surfaces when live is empty.)
    8. Confirm `curl -s localhost:3000/health` still returns `ok` and `GET /` returns the new HTML (not JSON) — Pitfall 3 (no static/route conflict).
  </how-to-verify>
  <resume-signal>Type "approved" or describe any rendering/flow/honesty issues to fix.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: QA-02 coverage gate (>=80% lines)</name>
  <read_first>
    - vitest.config.ts (coverage provider v8, lines threshold 80)
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (section "Testing Plan (QA-02)" — coverage baseline and low-coverage files)
  </read_first>
  <files>src/pipeline/index-events.test.ts</files>
  <behavior>
    - npm run test -- --coverage reports overall lines >= 80%
    - All tests (the 79 pre-existing + the Phase 2 additions) pass with zero failures
  </behavior>
  <action>
    Run `npm run test -- --coverage` and read the lines coverage. The Phase 2 additions (recommend/*, dedup.test.ts, index-events.test.ts, recommendations.test.ts, the events ?upcoming cases) should already lift coverage above 80%. If the lines threshold still fails, identify the largest uncovered business-logic gap from the report (per research, candidates are recommend.ts branches and pipeline modules) and add targeted assertions to the existing test files for that module — do NOT add tests for hard-to-unit-test I/O wrappers (utils/http.ts, utils/robots.ts) and do NOT lower the threshold. Re-run until lines >= 80% with all tests green. Only src/pipeline/index-events.test.ts is listed as modifiable here; if the gap is in recommend or routes, the corresponding test file from plan 02-1/02-3 is the place to extend (note it in the SUMMARY).
  </action>
  <verify>
    <automated>npm run test -- --coverage 2>&1 | tee /tmp/cov.txt; node -e "const t=require('fs').readFileSync('/tmp/cov.txt','utf8'); if(/fail/i.test(t)&&!/0 failed|failed \\(0\\)/i.test(t)) {} const m=t.match(/All files\\s*\\|\\s*([0-9.]+)/); if(!m) throw new Error('no coverage summary'); const lines=parseFloat(m[1]); if(lines<80) throw new Error('lines coverage '+lines+'% < 80%'); console.log('coverage ok: '+lines+'%');"</automated>
  </verify>
  <acceptance_criteria>
    - npm run test -- --coverage exits 0 (vitest enforces the 80 lines threshold) and the parsed "All files" lines value is >= 80
    - Zero failing tests across the whole suite
    - The vitest.config.ts lines threshold is still 80 (not lowered): grep -n "lines: 80" vitest.config.ts matches
  </acceptance_criteria>
  <done>QA-02 satisfied: business-logic line coverage is >=80% with the full suite green and the threshold unchanged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API response -> browser DOM | Event titles/venues (originating from scraped third-party HTML) are rendered into innerHTML |
| CTA anchor -> external site | sourceUrl points to a third-party domain opened in a new tab |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-07 | Tampering | event title/venue/reason in renderCard | mitigate | escHtml() entity-escapes every field before innerHTML assignment (Pitfall 4); verify confirms escHtml wraps title/venue/reason/source |
| T-02-08 | Spoofing | CTA target="_blank" | mitigate | every CTA anchor carries rel="noopener noreferrer" so the opened page cannot access window.opener |
| T-02-09 | Spoofing/Info Disclosure | seed shown as live | mitigate | renderCard renders .badge--demo whenever isSeed===true (Pitfall 7); human-verify step 7 confirms no unbadged seed card |
| T-02-10 | Denial of Service | GET / route conflict | mitigate | no Fastify route added for GET / (Pitfall 3); @fastify/static still serves index.html — verified in human-check step 8 |
| T-02-SC | Tampering | package installs | n/a | no new npm packages in Phase 2 |
</threat_model>

<verification>
- npm run build && node server.js boots; GET / returns the new HTML; GET /health returns ok (single-container deploy contract intact)
- Human-verify checkpoint approved (mobile layout, mood flow, filters, source panel, Демо honesty)
- npm run test -- --coverage: all tests green, lines >= 80%
</verification>

<success_criteria>
A mobile user taps a mood and sees ranked, honest, reason-bearing event cards; date/free/category filters work client-side; the source panel and Демо badges make data provenance visible; coverage is >=80% and all 79 prior tests stay green.
</success_criteria>

<output>
Create `.planning/phases/02-core-product-ui-mood-recommendations/02-4-SUMMARY.md` when done.
</output>
