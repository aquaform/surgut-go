---
phase: 01-deployable-pipeline-green-sources
plan: 01-6
type: execute
wave: 4
depends_on: [01-4]
files_modified:
  - src/http/routes/events.ts
  - src/http/routes/sources.ts
  - src/http/server.ts
autonomous: true
requirements: [API-02, API-04, API-05, SRC-08]
must_haves:
  truths:
    - "GET /api/events returns normalized events with a meta envelope and accepts validated date/category/free query params"
    - "GET /api/sources/status returns per-source status, fetchedAt, and eventCount"
    - "Invalid query params are rejected with a predictable validation error (Ajv schema), not a crash"
    - "Both routes read only from the injected store/index — never the pipeline"
  artifacts:
    - path: "src/http/routes/events.ts"
      provides: "GET /api/events with Ajv querystring + response schema"
    - path: "src/http/routes/sources.ts"
      provides: "GET /api/sources/status returning SourceResult[]"
  key_links:
    - from: "src/http/routes/events.ts"
      to: "src/http/server.ts (fastify.index/store)"
      via: "reads index.all()/store.getEvents()"
      pattern: "index|store"
    - from: "src/http/server.ts"
      to: "src/http/routes/events.ts"
      via: "register events + sources plugins"
      pattern: "register"
---

<objective>
Add the two read API endpoints — /api/events and /api/sources/status — with Ajv schema validation, reading from the in-memory index and cache store.

Purpose: ARCHITECTURE build step 8. Completes the honest API surface: clients get normalized events plus transparent per-source freshness (SRC-08). Schema validation gives predictable error responses (API-05). Routes read only from store/index (no pipeline coupling). This plan is parallel to 01-5 (disjoint files).
Output: events route (with date/category/free filters), sources/status route, both registered in createServer.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@.planning/research/ARCHITECTURE.md
@src/types/events.ts
@src/http/server.ts
@src/pipeline/index-events.ts
@src/cache/store.ts
</context>

<interfaces>
- src/http/server.ts: createServer({store,index}) decorates fastify.store (CacheStore) + fastify.index (EventIndex). Add route registrations here.
- src/pipeline/index-events.ts: EventIndex { all(), byCategory(cat) }
- src/cache/store.ts: CacheStore { getEvents(), getSources() }
- src/types/events.ts: NormalizedEvent, SourceResult, EventCategory
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: GET /api/events with schema validation + filters</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Fastify /api/events Route with Schema Validation; Security Domain V5 input validation)
    - .planning/research/ARCHITECTURE.md (routes read from EventIndex only; Data Flow)
  </read_first>
  <action>
    Create src/http/routes/events.ts as a FastifyPluginAsync registering GET /api/events with an Ajv schema: querystring properties date (enum today|tomorrow|weekend|week), category (string, ideally enum of EventCategory), free (boolean), additionalProperties false; response 200 schema { events: array, meta: { count: number, generatedAt: string } }. Handler reads from fastify.index.all() (or store.getEvents()), applies the validated filters in-memory (date buckets computed in Asia/Yekaterinburg / UTC+5 per RESEARCH; free filter on isFree; category on category), and returns { events, meta: { count, generatedAt: new Date().toISOString() } }. No I/O, no pipeline calls. Serialize Date fields as ISO in the response.
  </action>
  <verify>
    <automated>npm run build && PORT=3013 CACHE_DIR=./.cache-test3 node server.js & sleep 2; c1=$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3013/api/events'); c2=$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3013/api/events?date=bogus'); kill %1; test "$c1" = "200" && test "$c2" = "400"</automated>
  </verify>
  <acceptance_criteria>
    - GET /api/events returns 200 with { events, meta:{count,generatedAt} } on seed data
    - An invalid query value (e.g. date=bogus) returns a 400 validation error (Ajv), not a 500/crash
    - Handler reads only from index/store; date filtering uses UTC+5
  </acceptance_criteria>
  <done>Clients can fetch normalized events with validated filters and a freshness-bearing envelope.</done>
</task>

<task type="auto">
  <name>Task 2: GET /api/sources/status</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (SourceResult interface; source-status flow; Security: status exposes human-readable only)
    - .planning/research/PITFALLS.md (Pitfall 1 + Security Mistakes: no stack traces via status)
  </read_first>
  <action>
    Create src/http/routes/sources.ts as a FastifyPluginAsync registering GET /api/sources/status with a response schema describing SourceResult[] (name, displayName, homeUrl, status, eventCount, fetchedAt, error?). Handler returns fastify.store.getSources() mapped to expose only human-readable fields (status string, short error message) — never stack traces or internal retry detail (Security Domain / Info Disclosure). fetchedAt serialized as ISO or null. If no sources yet, return the seed source entry.
  </action>
  <verify>
    <automated>npm run build && PORT=3014 CACHE_DIR=./.cache-test4 node server.js & sleep 2; out=$(curl -s 'http://127.0.0.1:3014/api/sources/status'); kill %1; echo "$out" | grep -q '"status"' && echo "$out" | grep -q '"eventCount"'</automated>
  </verify>
  <acceptance_criteria>
    - GET /api/sources/status returns per-source status, fetchedAt, and eventCount
    - Response exposes only human-readable status/error (no stack traces, no internal URLs with tokens)
  </acceptance_criteria>
  <done>Source freshness/status is transparently exposed — SRC-08 served over HTTP.</done>
</task>

<task type="auto">
  <name>Task 3: Register both routes in createServer</name>
  <read_first>
    - src/http/server.ts (createServer — add registrations)
  </read_first>
  <action>
    Edit src/http/server.ts to register the events and sources plugins alongside health. Keep registration order/prefixes correct (API routes under /api, health at /health, @fastify/static last so it does not shadow API routes). Do not introduce any pipeline import into server.ts (routes-pipeline coupling stays forbidden).
  </action>
  <verify>
    <automated>npm run build && grep -q "events" src/http/server.ts && grep -q "sources" src/http/server.ts && ! grep -q "pipeline/run" src/http/server.ts</automated>
  </verify>
  <acceptance_criteria>
    - createServer registers health + events + sources plugins
    - server.ts imports no pipeline module
    - npm run build succeeds
  </acceptance_criteria>
  <done>All three Phase-1 read endpoints are live behind one Fastify instance.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → API query params | untrusted query input crosses here |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-13 | Tampering | /api/events query params | mitigate | Fastify Ajv querystring schema with enums + additionalProperties:false; invalid input -> 400 (ASVS V5) |
| T-01-14 | Info Disclosure | /api/sources/status | mitigate | Returns only human-readable status/error; no stack traces or tokenized URLs (RESEARCH Security Domain) |
| T-01-15 | Denial of Service | per-request scraping | mitigate | Routes read in-memory index/store only; no pipeline call in request path (ARCHITECTURE Anti-Pattern 2/5) |
</threat_model>

<verification>
- /api/events -> 200 with meta; invalid param -> 400
- /api/sources/status -> per-source status+eventCount, human-readable only
- server.ts registers all routes, imports no pipeline
</verification>

<success_criteria>
- API-02: /api/events returns normalized events with filter params
- API-04: /api/sources/status returns per-source status + freshness
- API-05: responses schema-validated; errors predictable
- SRC-08: per-source status surfaced over HTTP
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-6-SUMMARY.md` when done
</output>
