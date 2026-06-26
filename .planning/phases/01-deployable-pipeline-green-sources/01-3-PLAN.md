---
phase: 01-deployable-pipeline-green-sources
plan: 01-3
type: execute
wave: 2
depends_on: [01-1]
files_modified:
  - src/sources/seed/index.ts
  - src/sources/seed/events.json
  - src/sources/registry.ts
  - src/cache/store.ts
  - src/cache/store.test.ts
  - src/pipeline/index-events.ts
autonomous: true
requirements: [CACHE-01, CACHE-04, AGG-02]
must_haves:
  truths:
    - "The seed adapter returns real example events synchronously, every one flagged isSeed:true"
    - "CacheStore.save writes events.json atomically and load() reconstructs the same data; isStale respects TTL"
    - "On a missing/corrupt cache file, the store falls back to seed events so the app always has data"
    - "buildEventIndex turns a flat event array into an in-memory index that can be rebuilt atomically"
  artifacts:
    - path: "src/sources/seed/events.json"
      provides: "~12 real example events, all isSeed:true"
      contains: "isSeed"
    - path: "src/sources/seed/index.ts"
      provides: "seedAdapter (SourceAdapter) returning seed events synchronously"
    - path: "src/cache/store.ts"
      provides: "CacheStore: load/save(atomic)/isStale/getEvents/getSources/loadOrSeed"
    - path: "src/pipeline/index-events.ts"
      provides: "buildEventIndex + EventIndex with rebuild()"
    - path: "src/sources/registry.ts"
      provides: "ordered active adapter array (initially [seedAdapter])"
  key_links:
    - from: "src/cache/store.ts"
      to: "src/sources/seed/index.ts"
      via: "loadOrSeed falls back to seedAdapter"
      pattern: "seed"
---

<objective>
Build the honest seed fallback, the durable JSON cache store, and the in-memory event index — the data layer of the walking skeleton.

Purpose: ARCHITECTURE build steps 3-4 + 7. These let the server boot instantly on real-but-labelled data (CACHE-04) and persist live results across restart (CACHE-01), while keeping reads I/O-free via the EventIndex. isSeed:true on every seed event makes it structurally impossible to present seed as live (AGG-02).
Output: seedAdapter + events.json, registry, CacheStore (atomic write + TTL + seed fallback, tested), and buildEventIndex/EventIndex.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@.planning/research/ARCHITECTURE.md
@src/types/events.ts
@src/sources/base.ts
@src/config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Seed adapter + real seed events + registry</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Real Event Examples tables for both sources; Open Question 4: ~12 seed events)
    - .planning/research/ARCHITECTURE.md (Anti-Pattern 4: fabricating live status; sources/seed/ responsibility)
    - src/types/events.ts, src/sources/base.ts
  </read_first>
  <action>
    Create src/sources/seed/events.json containing ~12 real events drawn from the RESEARCH "Real Event Examples" tables (7 kassa-ugra + 5 afisha.surguta), each a valid NormalizedEvent with EVERY event isSeed:true, status-appropriate sourceName ('seed'), real titles/venues/dates (store startDate as ISO string; the adapter revives to Date), realistic category/tags/priceText. Do NOT fabricate isSeed:false. Create src/sources/seed/index.ts exporting seedAdapter implementing SourceAdapter (name 'seed', displayName 'Демо-данные', homeUrl '', timeoutMs 0) whose scrape() returns the parsed events synchronously (Promise.resolve), reviving date strings to Date and stamping fetchedAt=now and isSeed:true defensively. Create src/sources/registry.ts exporting the ordered active-adapter array, initially [seedAdapter] (real adapters appended in plan 01-7).
  </action>
  <verify>
    <automated>npm run typecheck && node -e "const e=require('./src/sources/seed/events.json'); if(!Array.isArray(e)||e.length<10) process.exit(1); if(e.some(x=>x.isSeed!==true)) process.exit(1)"</automated>
  </verify>
  <acceptance_criteria>
    - events.json has >= 10 events; every event has isSeed:true (none false)
    - seedAdapter implements SourceAdapter and returns the events synchronously with Date-typed startDate and fetchedAt
    - registry.ts exports an array that includes seedAdapter
  </acceptance_criteria>
  <done>The app has an honest, always-available seed fallback wired through the same adapter contract as live sources.</done>
</task>

<task type="auto">
  <name>Task 2: CacheStore with atomic write, TTL, and seed fallback (test-first)</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (JSON File Cache Schema + Atomic Write; CacheFile)
    - .planning/research/ARCHITECTURE.md (Cache: Single-Container Ephemeral Reality)
    - src/types/events.ts (CacheFile), src/config.ts
  </read_first>
  <behavior>
    - save(cacheFile) then load() roundtrips all events + sources fields (Date fields survive via ISO revive)
    - save writes via a .tmp file then rename (atomic); no partial file is ever read
    - isStale(ttlMs) is true when savedAt age exceeds ttlMs, false when fresh, true when no data
    - loadOrSeed(seedAdapter): on missing/corrupt file, populates store from seedAdapter events and marks stale
  </behavior>
  <action>
    Write src/cache/store.test.ts FIRST (RED) covering the behaviors above using a temp cacheDir. Then implement src/cache/store.ts: class CacheStore(cacheDir). load(): reads ${cacheDir}/events.json, JSON.parse to CacheFile, returns boolean. save(data:CacheFile): mkdir recursive, write to events.json.tmp, fs.rename to events.json (atomic on POSIX). isStale(ttlMs): Date.now() - savedAt > ttlMs. getEvents()/getSources() return in-memory data or []. loadOrSeed(seedAdapter): try load(); if false, build a CacheFile from await seedAdapter.scrape() with a 'seed' SourceResult and set in-memory data (stale). Revive date strings to Date on read.
  </action>
  <verify>
    <automated>npx vitest run src/cache/store.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - store.test.ts committed RED before store.ts
    - save→load roundtrip preserves events and sources; write is atomic (.tmp then rename)
    - isStale honors TTL; loadOrSeed populates seed data on missing/corrupt file
  </acceptance_criteria>
  <done>CacheStore durably persists live data and degrades to seed without ever serving an empty/partial file.</done>
</task>

<task type="auto">
  <name>Task 3: In-memory EventIndex</name>
  <read_first>
    - .planning/research/ARCHITECTURE.md (Data Flow; pipeline/index-events.ts responsibility; atomic in-memory swap)
    - src/types/events.ts
  </read_first>
  <action>
    Create src/pipeline/index-events.ts: export buildEventIndex(events:NormalizedEvent[]) returning an EventIndex object exposing all() (sorted by startDate ASC), byCategory(cat), and rebuild(newEvents) that atomically swaps the internal arrays/maps (assign new structures, no in-place mutation, so concurrent reads never see a half-built index). Keep it pure/in-memory with no I/O. This is the structure routes read from in plan 01-6.
  </action>
  <verify>
    <automated>npm run typecheck && grep -q "rebuild" src/pipeline/index-events.ts && grep -q "buildEventIndex" src/pipeline/index-events.ts</automated>
  </verify>
  <acceptance_criteria>
    - buildEventIndex returns an index with all(), byCategory(), and rebuild()
    - rebuild swaps references atomically (no in-place array mutation visible mid-rebuild)
    - npm run typecheck exits 0
  </acceptance_criteria>
  <done>Reads are served from an in-memory index that the refresh loop can swap atomically.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cache file on disk → process | a corrupt/partial JSON file must never crash boot |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-05 | Tampering | events.json on disk | mitigate | load() try/catches JSON.parse and falls back to seed; save() is atomic via .tmp+rename so no partial read |
| T-01-06 | Spoofing | seed-as-live | mitigate | Every seed event is isSeed:true (AGG-02); seed status is 'seed', never 'live' |
</threat_model>

<verification>
- vitest green for store roundtrip + atomic write + TTL + seed fallback
- events.json: >= 10 events, all isSeed:true
- typecheck green; EventIndex exposes rebuild
</verification>

<success_criteria>
- CACHE-01: live results persist to disk and survive restart with TTL freshness
- CACHE-04: honest seed fallback always available and labelled
- AGG-02: no path produces a seed event with isSeed:false
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-3-SUMMARY.md` when done
</output>
