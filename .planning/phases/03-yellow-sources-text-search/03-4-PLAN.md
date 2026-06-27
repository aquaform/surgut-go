---
phase: 03-yellow-sources-text-search
plan: 4
type: execute
wave: 3
depends_on: ["03-1", "03-2", "03-3"]
files_modified:
  - src/config.ts
  - src/sources/registry.ts
  - src/pipeline/run.ts
  - src/pipeline/run.test.ts
  - src/cache/refresh.ts
  - src/server.ts
autonomous: true
requirements: [SRC-04, SRC-05, SRC-06]
must_haves:
  truths:
    - "afisha-ru is an active source: its events appear in the pipeline output with sourceName 'afisha-ru' and status 'live' on success"
    - "kassir-sur appears in /api/sources/status with status 'blocked', eventCount 0, and its human-readable reason — never scraped, never faked (SRC-05)"
    - "When yandex is disabled (default), it surfaces as 'blocked'; when enabled via the ENABLE_YANDEX_AFISHA env flag, it joins the active registry and its events are included (SRC-06)"
    - "An HTTP 403 (or 'blocked'-tagged) scrape error maps the source status to 'blocked', not 'error', and the refresh loop keeps running (criterion 3)"
    - "A parse failure on afisha-ru (HTTP 200 + <2 events) yields status 'error' and serves the prior cached events for that source — cache is not overwritten (criterion 1)"
  artifacts:
    - path: "src/sources/registry.ts"
      provides: "afisha-ru in active sourceRegistry + exported disabledSources + buildActiveRegistry/disabled assembly helpers"
      contains: "afishaRuAdapter"
    - path: "src/pipeline/run.ts"
      provides: "403→blocked mapping + disabledSources merge into SourceResult[]"
      contains: "blocked"
    - path: "src/config.ts"
      provides: "enableYandexAfisha flag from env"
      contains: "YANDEX"
  key_links:
    - from: "src/server.ts"
      to: "startRefreshLoop registry + disabled list"
      via: "env-gated assembly of active vs disabled sources"
      pattern: "ENABLE_YANDEX_AFISHA|enableYandexAfisha"
    - from: "src/pipeline/run.ts rejection handler"
      to: "SourceResult.status 'blocked'"
      via: "403/blocked message detection"
      pattern: "403|blocked"
    - from: "src/pipeline/run.ts"
      to: "/api/sources/status"
      via: "disabledSources merged as blocked results"
      pattern: "disabled"
---

<objective>
Phase Goal (user story): As a Surgut resident, I want the new sources to actually show up — afisha.ru events in my results, Кассир honestly marked as disabled, and Яндекс available only when an operator turns it on — so that coverage grows without the app ever lying about its data.

This plan is the integration layer that wires the three Wave-2 source modules into the running pipeline. It registers afisha-ru as an active source, threads a `disabledSources` list (kassir always; yandex when its env flag is off) into the pipeline so they appear in `/api/sources/status` as `blocked` without ever being scraped, adds the HTTP-403→`blocked` mapping so a Yandex block can never crash the refresh loop, and env-gates Yandex via `ENABLE_YANDEX_AFISHA`. All shared, high-contention files (registry.ts, run.ts, refresh.ts, server.ts, config.ts) are edited here, once, in Wave 3 — after the adapter modules exist.

Purpose: Deliver the user-visible outcomes of SRC-04/05/06 by connecting modules to the pipeline and the status endpoint, honestly.
Output: active afisha-ru, blocked kassir + (default) yandex, 403→blocked mapping, env toggle, run.ts tests, green build.
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
From src/sources/registry.ts — `export const sourceRegistry: SourceAdapter[] = [kassaUgraAdapter, afishaSurgutaAdapter, seedAdapter]`.
From src/sources/afisha-ru/index.ts (03-2) — afishaRuAdapter.
From src/sources/kassir-sur/index.ts (03-3) — kassirSurAdapter (enabled:false, reason).
From src/sources/yandex-afisha/index.ts (03-3) — yandexAfishaAdapter (enabled:false, tosRisk:true); scrape throws 'HTTP 403 — source blocked' on 403.
From src/pipeline/run.ts — runPipeline(registry, prev?) → { events, sources }; rejection handler currently sets status:'error', retains prevEventsFor (serve-stale). SourceResult has status (SourceStatus incl. 'blocked'), eventCount, fetchedAt, error?.
From src/cache/refresh.ts — RefreshOptions { store, index, registry, config }; runRefresh calls runPipeline(registry, prev) then dedup + store.save({ sources, events }).
From src/server.ts — startRefreshLoop({ store, index, registry: sourceRegistry, config }) after listen().
From src/config.ts — loadConfig(): AppConfig { port, cacheDir, cacheTtlMs }.
From src/http/routes/sources.ts — reads store.getSources(); response enum already includes 'blocked'.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Register afisha-ru, add disabledSources, and env-gate Yandex</name>
  <files>src/config.ts, src/sources/registry.ts, src/server.ts</files>
  <read_first>
    - src/sources/registry.ts (current static array)
    - src/server.ts (boot assembly + startRefreshLoop call)
    - src/config.ts (loadConfig pattern; env-only)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (sections "Source Config Extension Pattern" Option B, "Disabled Source in Status Response", Open Question 2)
  </read_first>
  <action>
    In src/config.ts add `enableYandexAfisha: boolean` to AppConfig, read from `process.env['ENABLE_YANDEX_AFISHA'] === 'true'` (default false). In src/sources/registry.ts: import afishaRuAdapter, kassirSurAdapter, yandexAfishaAdapter; add `afishaRuAdapter` to the active `sourceRegistry` (place it after afishaSurgutaAdapter, before seedAdapter). Export a type `DisabledSource = { name: string; displayName: string; homeUrl: string; reason: string }` and a helper `buildSources(config: AppConfig): { active: SourceAdapter[]; disabled: DisabledSource[] }` that returns active = sourceRegistry plus yandexAfishaAdapter when `config.enableYandexAfisha`, and disabled = [kassir-sur entry] plus a yandex entry (reason 'Отключён по умолчанию — риск ToS; включается ENABLE_YANDEX_AFISHA') when NOT enabled. Derive the kassir disabled entry from kassirSurAdapter.name/displayName/homeUrl/reason — do not duplicate the reason string literal. In src/server.ts, call `buildSources(config)` and pass `registry: active` and a new `disabledSources: disabled` field into `startRefreshLoop`.
  </action>
  <acceptance_criteria>
    - `grep -n "afishaRuAdapter" src/sources/registry.ts` shows it in the active array
    - `grep -n "enableYandexAfisha" src/config.ts src/server.ts` shows the flag plumbed
    - `grep -n "buildSources\|disabledSources" src/sources/registry.ts src/server.ts` shows the assembly + handoff
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -n "afishaRuAdapter" src/sources/registry.ts</automated>
  </verify>
  <done>afisha-ru is active; disabledSources assembled (kassir always, yandex when off); ENABLE_YANDEX_AFISHA toggles yandex into the active registry; server passes both lists to the refresh loop.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Map 403→blocked and merge disabledSources in the pipeline</name>
  <files>src/pipeline/run.ts, src/pipeline/run.test.ts, src/cache/refresh.ts</files>
  <read_first>
    - src/pipeline/run.ts (rejection handler ~114-133; PipelineResult; prevEventsFor serve-stale)
    - src/pipeline/run.test.ts (existing test harness + fake adapters)
    - src/cache/refresh.ts (RefreshOptions + runPipeline call + store.save)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (sections "HTTP 403 → blocked Status Mapping", "Disabled Source in Status Response")
  </read_first>
  <behavior>
    - An adapter that throws an error whose message includes 'HTTP 403' (or 'blocked') yields a SourceResult with status==='blocked' (not 'error'); the loop still produces results for all other sources
    - A non-403 throw still yields status==='error' with serve-stale events retained (unchanged behavior)
    - When a disabledSources list is passed, runPipeline output `.sources` includes one entry per disabled source with status==='blocked', eventCount===0, fetchedAt===null, and error===reason — and those sources are never scraped
    - All existing run.test.ts cases still pass
  </behavior>
  <action>
    Extend `runPipeline(registry, prev?, disabled?: DisabledSource[])`. In the rejection handler, compute `isBlocked = (errorMsg).includes('HTTP 403') || (errorMsg.toLowerCase()).includes('blocked')` and set `status: isBlocked ? 'blocked' : 'error'` (keep serve-stale `prevEventsFor` and human-readable error message for both). After the registry loop, append one `SourceResult` per `disabled` entry: `{ name, displayName, homeUrl, status: 'blocked', eventCount: 0, fetchedAt: null, error: reason }` — no scrape() is ever called for these. In src/cache/refresh.ts, add `disabledSources?: DisabledSource[]` to RefreshOptions and pass it as the third arg to `runPipeline(registry, prev, disabledSources)` (store.save already persists results.sources). Add run.test.ts cases for: a 403-tagged throw → 'blocked'; a disabled list → merged blocked entries with the reason; and confirm a generic throw is still 'error'.
  </action>
  <acceptance_criteria>
    - `grep -n "blocked" src/pipeline/run.ts` shows the 403 mapping and the disabled merge
    - `npx vitest run src/pipeline/run.test.ts` passes including new 403 + disabled-merge cases
    - `npx vitest run` full suite green (no regressions)
    - `npx tsc --noEmit` clean
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/pipeline/run.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>403/blocked errors map to status 'blocked' without crashing the loop; disabledSources surface as blocked results with their reason; serve-stale on generic errors unchanged; new + existing run tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Full integration gate — build, suite, and live status check</name>
  <files>src/server.ts</files>
  <read_first>
    - src/server.ts (final boot wiring)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (Success criteria recap, criterion 1 and 3)
  </read_first>
  <action>
    Run the full quality gate and an end-to-end smoke. Execute `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, and `npm run build`. Then boot the built server (`node server.js` with a temp CACHE_DIR) and curl `/api/sources/status`: confirm afisha-ru is present (status live or, on a transient parse miss, error/cached — never silently absent) and that kassir-sur is present with status 'blocked' and a non-empty reason, and yandex-afisha is present with status 'blocked' (default env). Do NOT run /deploy (operator-only). If afisha-ru shows 'error' due to a live parse miss, that is acceptable here as long as the fixture tests in 03-2 pass — note it in the SUMMARY. Confirm the existing test count did not regress (≥162 plus the new Phase-3 tests).
  </action>
  <acceptance_criteria>
    - `npm run lint` and `npx tsc --noEmit` pass clean
    - `npx vitest run` passes with no failures and ≥162 tests
    - `npm run build` produces server.js
    - Booted `/api/sources/status` JSON contains entries for afisha-ru, kassir-sur (status 'blocked', reason set), and yandex-afisha (status 'blocked')
  </acceptance_criteria>
  <verify>
    <automated>npm run lint && npx tsc --noEmit && npx vitest run && npm run build</automated>
  </verify>
  <done>Lint/typecheck/tests/build all green; live /api/sources/status honestly shows afisha-ru active and kassir-sur + yandex-afisha blocked with reasons; deploy contract intact (node server.js, no SPA build).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| env config → registry assembly | Operator-controlled ENABLE_YANDEX_AFISHA flag gates ToS-risky source |
| scrape errors → status endpoint | Error messages mapped to public source status |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-12 | Denial of Service | one source 403/throw crashing refresh loop | mitigate | Promise.allSettled isolation + 403→blocked mapping; runRefresh never throws (serve-stale) |
| T-03-13 | Spoofing/Honesty | disabled source shown as if it had data | mitigate | disabled entries forced to eventCount 0, fetchedAt null, status 'blocked', scrape never called |
| T-03-14 | Information Disclosure | error/reason strings in status response | mitigate | Only human-readable messages/reasons surfaced (existing T-01-14 invariant in sources route preserved) |
| T-03-15 | Tampering/ToS | Yandex enabled without operator intent | mitigate | Defaults to disabled; requires explicit ENABLE_YANDEX_AFISHA=true env opt-in |
| T-03-SC | Tampering | npm/pip/cargo installs | accept | Zero new packages (RESEARCH Package Legitimacy Audit) — gate N/A |
</threat_model>

<verification>
- `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` all green
- Booted `/api/sources/status` shows afisha-ru active and kassir-sur + yandex-afisha blocked with reasons
- 162 existing tests stay green; deploy contract (node server.js, no SPA build) intact
</verification>

<success_criteria>
afisha-ru events flow into the pipeline with correct attribution and a stale-serving parse guard (criterion 1); kassir-sur is honestly blocked with a documented reason (SRC-05, constraint-driven); yandex-afisha is disabled by default, env-toggleable, and a 403 maps to blocked without crashing the loop (criterion 3).
</success_criteria>

<output>
Create `.planning/phases/03-yellow-sources-text-search/03-4-SUMMARY.md` when done.
</output>
