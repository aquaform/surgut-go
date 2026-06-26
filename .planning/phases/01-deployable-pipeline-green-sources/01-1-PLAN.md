---
phase: 01-deployable-pipeline-green-sources
plan: 01-1
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - tsconfig.json
  - vitest.config.ts
  - eslint.config.js
  - .dockerignore
  - .gitignore
  - src/types/events.ts
  - src/sources/base.ts
  - src/config.ts
  - src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html
  - src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html
  - src/sources/SELECTORS.md
autonomous: true
requirements: [SRC-01, AGG-01, AGG-02, QA-01]
must_haves:
  truths:
    - "npm install, typecheck, lint, and a no-op vitest run all succeed on a fresh clone"
    - "Every domain type (NormalizedEvent, SourceAdapter, SourceResult) is exported from a single source of truth"
    - "Real HTML from both GREEN sources is saved as fixtures and the confirmed CSS selectors are recorded"
  artifacts:
    - path: "src/types/events.ts"
      provides: "NormalizedEvent, SourceResult, SourceStatus, EventCategory, CacheFile"
      contains: "isSeed"
    - path: "src/sources/base.ts"
      provides: "SourceAdapter interface"
      contains: "scrape"
    - path: "src/config.ts"
      provides: "typed env config loader (PORT, CACHE_DIR, CACHE_TTL_MS)"
    - path: "src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html"
      provides: "saved live HTML for parser tests"
    - path: "src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html"
      provides: "saved live HTML for parser tests"
    - path: "src/sources/SELECTORS.md"
      provides: "confirmed cheerio selectors for both sources"
  key_links:
    - from: "src/sources/base.ts"
      to: "src/types/events.ts"
      via: "import NormalizedEvent"
      pattern: "import.*events"
---

<objective>
Scaffold the TypeScript/Fastify project, define the domain contracts every other plan imports, and run the mandatory Wave-0 live-source discovery so parser plans receive real selectors instead of guesses.

Purpose: Foundation of the walking skeleton. Interfaces are defined first (interface-first ordering) so downstream plans build against fixed contracts. The selector-discovery task de-risks both parsers (RESEARCH Pitfall 5 + 10: class names were not captured during research).
Output: A buildable/lintable/testable project skeleton, the single-source-of-truth type module, the source-adapter interface, the typed config loader, saved HTML fixtures, and a confirmed-selector reference.
</objective>

## Phase Goal

**As an** API consumer (the future surgut-go web UI), **I want to** call `/health`, `/api/events`, and `/api/sources/status` against the live deployed service and receive honest, source-attributed, freshness-stamped event data, **so that** the product UI can be built on an always-up, trustworthy data pipeline.

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@AGENTS.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold the TypeScript/Fastify project</name>
  <read_first>
    - .planning/research/STACK.md (locked versions, pinned package.json, "What NOT to Use")
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Standard Stack, Validation Architecture, Wave 0 Gaps)
    - .gitignore (already present; append, do not overwrite)
    - AGENTS.md (no native modules; types on public functions)
  </read_first>
  <action>
    Run `npm init -y`, then install LOCKED deps from STACK.md: prod fastify@^5.8.5, @fastify/static@^9.1.3, cheerio@^1.2.0, p-retry@^8.0.0, robots-parser@^3.0.1, node-cron@^4.5.0; dev typescript@^5, tsx@^4.22.4, esbuild@^0.28.1, vitest@^4.1.9, @vitest/coverage-v8@^4.1.9, @types/node@^20, @types/node-cron@^3, @types/robots-parser@^3. Do NOT install puppeteer, playwright, sqlite3, better-sqlite3, axios, node-fetch, or ts-node (forbidden in STACK.md). DO NOT set "type":"module" in package.json — leave it CommonJS-default so the esbuild `--format=cjs` bundle runs cleanly with `node server.js` (tsx and vitest handle TypeScript/ESM source without it; setting "type":"module" would make Node load the CJS bundle as ESM and throw `require is not defined`). Create tsconfig.json (target ES2022, module ESNext, moduleResolution "bundler", strict true, noEmit true, esModuleInterop true, types ["node"], include src — "bundler" resolution permits extensionless relative imports as the esbuild/RESEARCH code examples use). Create vitest.config.ts (include src/**/*.test.ts, coverage provider v8, thresholds.lines 80). Create eslint.config.js (flat config; minimal config that passes, forbidding explicit any). Create .dockerignore (node_modules, .git, .planning, .env*, *.log, dist, coverage). Append to .gitignore: server.js, cache/, coverage/. Add npm scripts: dev = tsx watch src/server.ts; build = the esbuild command from RESEARCH (esbuild src/server.ts --bundle --platform=node --format=cjs --outfile=server.js --external:./public --external:./cache); typecheck = tsc --noEmit; lint = eslint .; test = vitest run.
  </action>
  <verify>
    <automated>npm install && npm run typecheck && npm run lint && npx vitest run --passWithNoTests</automated>
  </verify>
  <acceptance_criteria>
    - npm install completes with zero native-build errors
    - package.json does NOT contain "type":"module" (CJS-default so `node server.js` runs the esbuild --format=cjs bundle); tsconfig moduleResolution is "bundler"
    - package.json contains exactly the prod deps listed; no forbidden packages at top level
    - npm run typecheck, npm run lint, and npx vitest run --passWithNoTests all exit 0
    - build script string matches the esbuild command in RESEARCH (multi-flag, outfile server.js)
  </acceptance_criteria>
  <done>Fresh npm install yields a project where typecheck, lint, and an empty test run pass; all four npm scripts exist.</done>
</task>

<task type="auto">
  <name>Task 2: Define domain contracts (types + adapter interface + config)</name>
  <read_first>
    - .planning/research/ARCHITECTURE.md (Pattern 1: Source Adapter Interface — NormalizedEvent, SourceResult, SourceAdapter sketches)
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Source Adapter TypeScript Interface; JSON File Cache Schema; CacheFile)
  </read_first>
  <action>
    Create src/types/events.ts exporting: SourceStatus = 'live'|'cached'|'blocked'|'error'|'seed'; EventCategory = 'concert'|'club'|'theater'|'exhibition'|'lecture'|'sport'|'standup'|'other'; Mood = 'drink'|'dance'|'learn'|'music'; interface NormalizedEvent with the EXACT fields from RESEARCH (id, title, startDate:Date, endDate?:Date, venue, address?, priceText, priceMin?, priceMax?, isFree:boolean, sourceName, sourceUrl, category:EventCategory, tags:string[], ageLimit?, imageUrl?, fetchedAt:Date, and REQUIRED isSeed:boolean — not optional, per AGG-02); interface SourceResult (name, displayName, homeUrl, status:SourceStatus, eventCount, fetchedAt:Date|null, error?); interface CacheFile (version:1, savedAt:string ISO, sources:SourceResult[], events:NormalizedEvent[]). Create src/sources/base.ts exporting interface SourceAdapter (readonly name, displayName, homeUrl, timeoutMs; scrape(): Promise<NormalizedEvent[]> — contract: returns non-empty array or throws, never returns []). Create src/config.ts exporting loadConfig() returning typed { port:number; cacheDir:string; cacheTtlMs:number } from process.env.PORT ?? 3000, process.env.CACHE_DIR ?? '/app/cache', process.env.CACHE_TTL_MS ?? 14400000. Never import dotenv; never read .env (CLAUDE.md). All exports explicitly typed (QA-01).
  </action>
  <verify>
    <automated>npm run typecheck && grep -q "isSeed: boolean" src/types/events.ts && grep -q "Promise<NormalizedEvent" src/sources/base.ts && ! grep -rq "dotenv" src/</automated>
  </verify>
  <acceptance_criteria>
    - src/types/events.ts exports NormalizedEvent with required (non-optional) isSeed:boolean
    - src/sources/base.ts imports NormalizedEvent from ../types/events and declares scrape(): Promise<NormalizedEvent[]>
    - src/config.ts reads only process.env (no dotenv import)
    - npm run typecheck exits 0
  </acceptance_criteria>
  <done>Types, adapter interface, and config compile cleanly and are the single source of truth for all downstream plans.</done>
</task>

<task type="auto">
  <name>Task 3: Wave-0 live-source selector discovery + fixtures</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Live Source Probe sections; Pitfall 5, 10; Open Questions 1-2)
    - .planning/research/PITFALLS.md (Pitfall 3, 7, 10)
  </read_first>
  <action>
    Fetch and save real HTML so parser plans use confirmed selectors. Save curl of https://kassa-ugra.ru/afisha (plus ?page=2, ?page=3, 2s apart) into src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html. Save curl of https://afisha.surguta.ru/ into src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html. For kassa-ugra run a class-frequency probe (grep -oP 'class="[^"]*"' | sort | uniq -c | sort -rn | head -40) and confirm anchor selector a[href^="/event/"] resolves and that the container plus venue/date/price child text nodes are locatable. For afisha.surguta confirm grep -c 'href="/content/' is > 10 (Open Question 2 — if 0, record a BLOCKER: site needs JS, do not proceed to write a parser). Record the afisha.surguta response Content-Type charset (Pitfall 10 — flag if windows-1251). Write src/sources/SELECTORS.md documenting per source: the confirmed event-link selector, the container traversal to title/venue/date/price, the date string format observed, and the charset. Use polite header User-Agent: surgut-go/1.0 (+https://surgut-go.apps.sielom.ru) on every request.
  </action>
  <verify>
    <automated>test -s src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html && test -s src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html && grep -q 'href="/event/' src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html && grep -q 'href="/content/' src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html && grep -qi 'selector' src/sources/SELECTORS.md</automated>
  </verify>
  <acceptance_criteria>
    - Both fixture files exist and are non-empty
    - kassa-ugra fixture contains href="/event/ anchors; afisha.surguta fixture contains > 10 href="/content/ links
    - SELECTORS.md documents the confirmed selectors, container traversal, date formats, and charset for both sources
    - If afisha.surguta yields 0 /content/ links, a BLOCKER is recorded in SELECTORS.md instead of fabricated selectors
  </acceptance_criteria>
  <done>Real HTML fixtures are saved and confirmed selectors are documented; downstream parser plans no longer guess.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dev machine → live source HTTP | curl fetches untrusted third-party HTML during discovery |
| npm registry → project | dependency supply chain |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | scraped HTML fixtures | accept | Fixtures are static test data only; never executed; cheerio `.text()` used downstream strips HTML |
| T-01-SC | Tampering | npm installs | mitigate | All packages Approved on npm registry per RESEARCH Package Legitimacy Audit (none [ASSUMED]/[SUS]); install only the locked list; slopcheck PyPI mismatch noted, npm verification authoritative |
</threat_model>

<verification>
- npm install + typecheck + lint + empty vitest run all green
- NormalizedEvent.isSeed is required; SourceAdapter.scrape returns Promise<NormalizedEvent[]>
- Both fixtures saved; SELECTORS.md present with confirmed selectors
</verification>

<success_criteria>
- A fresh clone builds the contracts cleanly and the toolchain (tsc/eslint/vitest/esbuild scripts) is wired
- Downstream plans can import all domain types from src/types/events.ts and the adapter contract from src/sources/base.ts
- Both parser plans have real HTML + confirmed selectors to work from
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-1-SUMMARY.md` when done
</output>
