---
phase: 01-deployable-pipeline-green-sources
plan: 01-1
subsystem: infra
tags: [typescript, fastify, cheerio, vitest, esbuild, eslint, html-parsing, scraping]

# Dependency graph
requires: []
provides:
  - TypeScript/Fastify project scaffold with locked dependency versions
  - NormalizedEvent, SourceResult, CacheFile, SourceStatus, EventCategory, Mood type definitions
  - SourceAdapter interface (pipeline-facing contract)
  - Typed config loader (PORT, CACHE_DIR, CACHE_TTL_MS from process.env)
  - Live HTML fixtures for kassa-ugra.ru and afisha.surguta.ru
  - Confirmed CSS selectors for both GREEN sources documented in SELECTORS.md
affects:
  - 01-2 (kassa-ugra parser imports types + uses fixtures + confirmed selectors)
  - 01-3 (afisha-surguta parser same)
  - 01-4 (seed adapter imports NormalizedEvent)
  - 01-5 (server imports SourceAdapter, config)
  - All plans in Phase 1 (types are the single source of truth)

# Tech tracking
tech-stack:
  added:
    - fastify@5.8.5
    - "@fastify/static"@9.1.3
    - cheerio@1.2.0
    - p-retry@8.0.0
    - robots-parser@3.0.1
    - node-cron@4.5.0
    - typescript@5.9.3
    - tsx@4.22.4
    - esbuild@0.28.1
    - vitest@4.1.9
    - "@vitest/coverage-v8"@4.1.9
    - "@types/node"@20.19.43
    - "@types/node-cron"@3.0.11
    - eslint@9.39.4
    - "@typescript-eslint/eslint-plugin"@8.62.0
    - "@typescript-eslint/parser"@8.62.0
  patterns:
    - CJS-default package.json (no "type":"module") + esbuild --format=cjs → server.js
    - tsconfig moduleResolution "bundler" permits extensionless imports
    - ESLint flat CJS config (eslint.config.js with require/module.exports)
    - Two-stage Dockerfile: builder (esbuild) → runner (zero node_modules)

key-files:
  created:
    - package.json
    - package-lock.json
    - tsconfig.json
    - vitest.config.ts
    - eslint.config.js
    - .dockerignore
    - src/types/events.ts
    - src/sources/base.ts
    - src/config.ts
    - src/server.ts (stub — full server in plan 01-5)
    - src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html
    - src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html
    - src/sources/SELECTORS.md
  modified:
    - .gitignore (appended server.js, cache/, coverage/)
    - Dockerfile (replaced single-stage with two-stage esbuild builder)

key-decisions:
  - "CJS-default package.json: no type:module keeps esbuild --format=cjs bundle runnable as node server.js"
  - "tsconfig moduleResolution: bundler supports extensionless relative imports used in all code examples"
  - "eslint.config.js uses CJS require() to avoid MODULE_TYPELESS_PACKAGE_JSON warning in eslint v9"
  - "Omitted @types/robots-parser (404 on npm) — robots-parser ships its own TS types per RESEARCH"
  - "kassa-ugra fixture: pages 1-3 concatenated into single file (103 KB) to cover all events"
  - "afisha.surguta.ru charset confirmed UTF-8 (not windows-1251) — Pitfall 10 resolved"

patterns-established:
  - "Pattern 1: All domain types exported from single src/types/events.ts — downstream plans must not re-declare types"
  - "Pattern 2: SourceAdapter.scrape() throws or returns non-empty array; returning [] is a contract violation (AGG-05)"
  - "Pattern 3: Config loaded from process.env only via loadConfig() — no dotenv, never read .env"
  - "Pattern 4: HTML fixtures saved to src/sources/<source>/__fixtures__/ for parser unit tests"

requirements-completed: [SRC-01, AGG-01, AGG-02, QA-01]

# Metrics
duration: 19min
completed: 2026-06-27
---

# Phase 01 Plan 1: Foundation Scaffold Summary

**TypeScript/Fastify skeleton with locked deps, NormalizedEvent/SourceAdapter domain contracts, and confirmed CSS selectors from live HTML fixtures of both GREEN sources**

## Performance

- **Duration:** 19 min
- **Started:** 2026-06-26T19:44:10Z
- **Completed:** 2026-06-27T00:03:00Z
- **Tasks:** 3
- **Files modified/created:** 13

## Accomplishments

- Complete TypeScript project scaffold: typecheck + lint + vitest all exit 0 from a fresh install
- Single-source-of-truth domain types (NormalizedEvent with required `isSeed:boolean`, SourceResult, CacheFile) that every downstream plan imports
- Confirmed cheerio selectors for both GREEN sources from real live HTML — no parser guessing needed
- Live HTML fixtures saved (103 KB kassa-ugra 3 pages; 241 KB afisha.surguta main page)
- Pitfall 10 resolved: afisha.surguta.ru is UTF-8, not windows-1251 — no TextDecoder needed

## Task Commits

1. **Task 1: Scaffold TypeScript/Fastify project** — `c36a6da` (chore)
2. **Task 2: Define domain contracts** — `cebdc65` (feat)
3. **Task 3: Wave-0 live-source selector discovery + fixtures** — `6358eca` (feat)

**Plan metadata:** (docs commit, see below)

## Files Created/Modified

- `package.json` — npm project, scripts (dev/build/typecheck/lint/test), no type:module
- `package-lock.json` — locked dependency tree
- `tsconfig.json` — ES2022, moduleResolution bundler, strict, noEmit
- `vitest.config.ts` — include src/**/*.test.ts, coverage v8, 80% line threshold
- `eslint.config.js` — flat CJS config, @typescript-eslint no-explicit-any error
- `.dockerignore` — excludes node_modules, .planning, .env*, logs
- `.gitignore` — appended server.js, cache/, coverage/
- `Dockerfile` — two-stage esbuild builder → slim runner with zero node_modules
- `src/server.ts` — stub entry point (intentional; full server in plan 01-5)
- `src/types/events.ts` — NormalizedEvent, SourceResult, CacheFile, SourceStatus, EventCategory, Mood
- `src/sources/base.ts` — SourceAdapter interface with scrape(): Promise<NormalizedEvent[]>
- `src/config.ts` — loadConfig() → { port, cacheDir, cacheTtlMs } from process.env only
- `src/sources/kassa-ugra/__fixtures__/afisha-2026-06-27.html` — 103 KB live HTML (3 pages)
- `src/sources/afisha-surguta/__fixtures__/main-2026-06-27.html` — 241 KB live HTML
- `src/sources/SELECTORS.md` — confirmed CSS selectors, HTML structure samples, date/price formats

## Decisions Made

- CJS-default package.json (no `"type":"module"`) so `node server.js` runs the esbuild CJS bundle without `require is not defined` errors
- `tsconfig.moduleResolution: "bundler"` supports the extensionless relative imports used in all source examples
- ESLint flat config with CJS `require()` syntax avoids `MODULE_TYPELESS_PACKAGE_JSON` Node.js warning in eslint v9
- Concatenated kassa-ugra pages 1–3 into a single fixture file (103 KB) — downstream test loads one file covering all events

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Omitted @types/robots-parser (404 on npm registry)**
- **Found during:** Task 1 (npm install dev deps)
- **Issue:** `@types/robots-parser@^3` returns HTTP 404 from npm registry — package does not exist
- **Fix:** Omitted from install. RESEARCH.md explicitly states "robots-parser ships own types; include for safety" (redundant). Verified: `npm list robots-parser` confirms types bundled with the package itself; typecheck exits 0 without the @types package.
- **Files modified:** package.json (package not added)
- **Verification:** `npm run typecheck` exits 0 with no type errors from robots-parser usage
- **Committed in:** c36a6da (Task 1 commit)

**2. [Rule 1 - Bug] ESLint config rewritten from ESM to CJS**
- **Found during:** Task 1 (npm run lint)
- **Issue:** `eslint.config.js` using `import` syntax in a CJS package triggered `[MODULE_TYPELESS_PACKAGE_JSON]` warning (performance overhead, misleading for a CJS project)
- **Fix:** Rewrote `eslint.config.js` using `require()`/`module.exports` — pure CJS flat config
- **Files modified:** eslint.config.js
- **Verification:** `npm run lint` exits 0 with no warnings
- **Committed in:** c36a6da (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking package install, 1 bug fix)
**Impact on plan:** Both fixes preserve the plan's intent exactly. No scope creep.

## Known Stubs

| Stub | File | Reason | Resolved by |
|------|------|---------|-------------|
| `export {}` placeholder | `src/server.ts` | Minimal TypeScript file for typecheck to validate the include path; full Fastify server wired in plan 01-5 | Plan 01-5 |

## Issues Encountered

- `@types/robots-parser` does not exist on npm. Auto-resolved: RESEARCH confirmed the package ships its own types and the @types was listed as "redundant".
- Multiple `npm install` commands triggered background processing due to prior installs holding the package lock. Waited for lock release using `until` loop. No functional impact.

## Next Phase Readiness

- Plans 01-2 (kassa-ugra parser) and 01-3 (afisha-surguta parser) have real HTML fixtures and confirmed selectors — no guessing required
- All domain types are established as the single source of truth
- Toolchain (typecheck/lint/test/build scripts) is wired and green
- Dockerfile two-stage build is ready for plan 01-6 (Docker build verification)

---
*Phase: 01-deployable-pipeline-green-sources*
*Completed: 2026-06-27*
