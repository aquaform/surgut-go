---
phase: 01-deployable-pipeline-green-sources
plan: 01-5
type: execute
wave: 4
depends_on: [01-3, 01-4]
files_modified:
  - src/pipeline/run.ts
  - src/pipeline/run.test.ts
  - src/pipeline/dedup.ts
  - src/cache/refresh.ts
  - src/server.ts
autonomous: true
requirements: [AGG-05, CACHE-02, CACHE-03, SRC-08]
must_haves:
  truths:
    - "runPipeline runs all adapters in parallel with per-source error isolation, producing events plus a SourceResult per source"
    - "A source that throws (incl. min-results parse error) is marked error/cached and its previous events are kept — never overwritten with empty"
    - "The background refresh loop runs on a cron schedule, never blocks the HTTP path, and atomically swaps the index"
    - "Duplicate events prefer the live record over the seed record"
  artifacts:
    - path: "src/pipeline/run.ts"
      provides: "runPipeline(registry) -> { events, sources } with Promise.allSettled + per-source timeout"
    - path: "src/pipeline/dedup.ts"
      provides: "dedup(events) -> NormalizedEvent[] (minimal Phase-1 prefer-live key)"
    - path: "src/cache/refresh.ts"
      provides: "startRefreshLoop({store,index,registry,config}) (node-cron, fire-and-forget, serve-stale)"
  key_links:
    - from: "src/cache/refresh.ts"
      to: "src/pipeline/run.ts"
      via: "runRefresh calls runPipeline then store.save + index.rebuild"
      pattern: "runPipeline"
    - from: "src/server.ts"
      to: "src/cache/refresh.ts"
      via: "startRefreshLoop after listen"
      pattern: "startRefreshLoop"
---

<objective>
Build the parallel scrape pipeline with per-source error isolation and the background refresh loop, then wire it into the boot entrypoint — so live data populates the cache and index without ever blocking or breaking the serving path.

Purpose: ARCHITECTURE build step 6 + Patterns 2-3. This delivers serve-stale-on-failure (CACHE-03), the min-results guard handling (AGG-05), per-source status tracking (SRC-08), and cron-scheduled background refresh (CACHE-02). At this point the registry still holds only seedAdapter; real adapters slot in at plan 01-7 without changing this wiring.
Output: runPipeline, a minimal Phase-1 dedup, startRefreshLoop (with a serve-stale test), and the entrypoint wiring.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@src/types/events.ts
@src/sources/base.ts
@src/sources/registry.ts
@src/cache/store.ts
@src/pipeline/index-events.ts
@src/config.ts
</context>

<interfaces>
- src/sources/base.ts: SourceAdapter { name, displayName, homeUrl, timeoutMs, scrape(): Promise<NormalizedEvent[]> }
- src/types/events.ts: NormalizedEvent, SourceResult, SourceStatus
- src/cache/store.ts: CacheStore { save(CacheFile), getEvents(), getSources() }
- src/pipeline/index-events.ts: EventIndex.rebuild(events)
- src/sources/registry.ts: ordered SourceAdapter[]
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: runPipeline with error isolation, timeout, min-results guard, serve-stale (test-first)</name>
  <read_first>
    - .planning/research/ARCHITECTURE.md (Pattern 2; Background Refresh Flow; pipeline/run.ts)
    - .planning/research/PITFALLS.md (Pitfall 1: stale-as-live; Pitfall 3/9: empty overwrites valid cache)
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (CACHE-03 serve-stale test row; Pitfall 9)
  </read_first>
  <behavior>
    - With one adapter that resolves N events and one that throws: result.events contains the N, the throwing source has a SourceResult status 'error' and is NOT represented by an empty event set that replaces prior data
    - Each SourceResult carries name, status, eventCount, fetchedAt
    - Serve-stale: given a prior set of events for a source and a failing refresh, the prior events for that source remain available (not wiped)
    - A successful source yields status 'live' with eventCount = its events length
  </behavior>
  <action>
    Write src/pipeline/run.test.ts FIRST (RED) using fake adapters (one resolving, one rejecting) for the behaviors above. Then implement src/pipeline/run.ts: export runPipeline(registry: SourceAdapter[], prev?: { events: NormalizedEvent[]; sources: SourceResult[] }): Promise<{ events: NormalizedEvent[]; sources: SourceResult[] }>. Use Promise.allSettled over registry.map(a => withTimeout(a.scrape(), a.timeoutMs)). On fulfilled: push events, SourceResult status 'live', eventCount, fetchedAt=now. On rejected (any throw including the adapter's own min-results ParseError, AGG-05): produce SourceResult status 'error' (human-readable error string only, no stack) and RETAIN that source's previous events from prev (serve-stale, CACHE-03) rather than dropping them; if no prev, contribute nothing for that source. Aggregate all retained+fresh events. Implement a small withTimeout helper. Never let one source's failure reject the whole pipeline.
  </action>
  <verify>
    <automated>npx vitest run src/pipeline/run.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - run.test.ts committed RED before run.ts
    - A throwing source yields status 'error' and keeps its previous events (serve-stale); the healthy source yields status 'live'
    - SourceResult error strings contain no stack traces
  </acceptance_criteria>
  <done>The pipeline isolates per-source failure, honors the min-results guard, and never overwrites good data with empty.</done>
</task>

<task type="auto">
  <name>Task 2: Minimal Phase-1 dedup (prefer live over seed)</name>
  <read_first>
    - .planning/research/ARCHITECTURE.md (Pattern 3: Deduplication — eventKey, prefer live over seed)
    - src/types/events.ts
  </read_first>
  <action>
    Create src/pipeline/dedup.ts: export dedup(events:NormalizedEvent[]): NormalizedEvent[] using a composite key sha1(titleSlug | startDate day | venueSlug). On collision, keep the existing unless the incoming is isSeed:false and existing is isSeed:true (prefer live over seed). This is the MINIMAL Phase-1 dedup only — the full fuzzy ±30min/venue composite key is Phase 2 (AGG-03). Document that scope boundary in a top-of-file comment. Keep it a pure function.
  </action>
  <verify>
    <automated>npm run typecheck && grep -q "createHash\|sha1" src/pipeline/dedup.ts</automated>
  </verify>
  <acceptance_criteria>
    - dedup is a pure function keyed on titleSlug|dateDay|venueSlug
    - On duplicate, a live (isSeed:false) record wins over a seed (isSeed:true) record
    - A comment marks full fuzzy dedup as Phase-2 scope
  </acceptance_criteria>
  <done>Duplicate suppression exists at Phase-1 fidelity and never presents seed over live.</done>
</task>

<task type="auto">
  <name>Task 3: Background refresh loop + entrypoint wiring</name>
  <read_first>
    - .planning/research/ARCHITECTURE.md (Pattern 2 boot sequence + refresh loop; Anti-Pattern 1/5)
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Boot sequence main(); node-cron usage in STACK)
    - src/server.ts (the extension-point comment left by plan 01-4)
  </read_first>
  <action>
    Create src/cache/refresh.ts: export startRefreshLoop({ store, index, registry, config }): void. Define runRefresh(): read prev from store, results = await runPipeline(registry, prev), deduped = dedup(results.events), store.save({ version:1, savedAt:new Date().toISOString(), sources: results.sources, events: deduped }), index.rebuild(deduped). Fire runRefresh() once immediately (fire-and-forget, .catch logs a warning — never throws into boot). Schedule periodic refresh with node-cron (e.g. cron.schedule for a cadence aligned to config.cacheTtlMs; a fixed e.g. every-2-hours expression is acceptable, documented). Then edit src/server.ts to call startRefreshLoop({ store, index, registry, config }) AFTER fastify.listen (replacing the extension-point comment) — refresh must never block boot. Routes/pipeline coupling stays forbidden: only refresh.ts imports the pipeline.
  </action>
  <verify>
    <automated>npm run build && grep -q "startRefreshLoop" src/server.ts && grep -q "node-cron\|cron.schedule\|import cron" src/cache/refresh.ts && PORT=3012 CACHE_DIR=./.cache-test2 node server.js & sleep 2; code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3012/health); kill %1; test "$code" = "200"</automated>
  </verify>
  <acceptance_criteria>
    - startRefreshLoop runs an immediate fire-and-forget refresh and schedules periodic refresh via node-cron
    - server.ts starts the loop only after listen; boot still serves /health 200 immediately
    - A refresh failure logs a warning and never crashes the process (serve-stale)
  </acceptance_criteria>
  <done>Live data refreshes in the background on a schedule, off the request path, with serve-stale safety — CACHE-02 satisfied and the entrypoint is complete.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| adapters → pipeline | a misbehaving/slow source must not take down serving |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-10 | Denial of Service | one slow/failing source | mitigate | Promise.allSettled + per-source withTimeout(timeoutMs); failure isolated, serve-stale retains prior events |
| T-01-11 | Tampering | empty parse overwrites cache | mitigate | Min-results guard (adapter throws) -> status 'error', prior events retained (AGG-05/CACHE-03) |
| T-01-12 | Info Disclosure | SourceResult.error | mitigate | error is a short human-readable string; no stack traces or internal URLs |
</threat_model>

<verification>
- vitest green for run.test.ts (error isolation + serve-stale)
- dedup prefers live over seed
- build green; server boots, starts refresh loop after listen, /health still 200
</verification>

<success_criteria>
- AGG-05: empty/parse-failed source does not overwrite valid cache
- CACHE-02: cron background refresh off the request path
- CACHE-03: serve-stale-on-failure retains last good events
- SRC-08: per-source status/eventCount/fetchedAt produced each run
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-5-SUMMARY.md` when done
</output>
