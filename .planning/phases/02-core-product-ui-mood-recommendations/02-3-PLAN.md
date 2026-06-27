---
phase: 02-core-product-ui-mood-recommendations
plan: 3
type: execute
wave: 2
depends_on: [02-1]
files_modified:
  - src/http/serialize.ts
  - src/http/routes/events.ts
  - src/http/routes/events.test.ts
  - src/http/routes/recommendations.ts
  - src/http/routes/recommendations.test.ts
  - src/http/server.ts
autonomous: true
requirements: [API-03]
must_haves:
  truths:
    - "GET /api/recommendations?mood=drink returns 200 with items[] each carrying { event, reason }"
    - "Missing mood or an invalid mood value returns 400 (Ajv enum)"
    - "isSeed is preserved verbatim in every serialized recommendation event"
    - "GET /api/events?upcoming=true hides past-dated events; omitting it preserves existing behavior"
  artifacts:
    - path: "src/http/serialize.ts"
      provides: "Shared serializeEvent() + SerializedEvent type used by both routes"
      exports: ["serializeEvent"]
    - path: "src/http/routes/recommendations.ts"
      provides: "GET /api/recommendations?mood= Fastify plugin"
      exports: ["default"]
    - path: "src/http/server.ts"
      provides: "recommendationsRoute registered before the static wildcard"
      contains: "recommendationsRoute"
  key_links:
    - from: "src/http/routes/recommendations.ts"
      to: "src/recommend/recommend.ts"
      via: "import getRecommendations"
      pattern: "getRecommendations"
    - from: "src/http/routes/recommendations.ts"
      to: "src/recommend/mood-map.ts"
      via: "import MOOD_MAPPINGS"
      pattern: "MOOD_MAPPINGS"
    - from: "src/http/server.ts"
      to: "src/http/routes/recommendations.ts"
      via: "fastify.register(recommendationsRoute)"
      pattern: "register\\(recommendationsRoute\\)"
---

<objective>
Expose the recommendation engine over HTTP as GET /api/recommendations?mood=drink|dance|learn|music (API-03), extract the shared serializeEvent() helper to eliminate duplication (Pitfall 5), and add a non-breaking ?upcoming=true option to GET /api/events that hides past-dated items.

Purpose: This is the network slice connecting the plan 02-1 engine to the plan 02-4 browser UI. After this plan, a user can curl the endpoint and receive ranked, honest recommendations with reasons.
Output: src/http/serialize.ts (new), src/http/routes/recommendations.ts (+test), recommendations registered in server.ts, and events.ts refactored to share the serializer + gain ?upcoming.
</objective>

<phase_goal>
**As a** mobile user in Surgut, **I want to** tap a mood button and immediately see ranked, honest event cards with a "почему рекомендовано" reason, **so that** I can decide where to go tonight.

This plan delivers the API slice. The recommendations.test.ts route test is the automated end-to-end proof that mood → ranked, reason-bearing, honesty-preserving JSON works before the UI consumes it.
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
@.planning/phases/02-core-product-ui-mood-recommendations/02-1-SUMMARY.md

<interfaces>
<!-- Engine contract from plan 02-1 (src/recommend/). Use directly. -->
import { MOOD_MAPPINGS } from '../../recommend/mood-map';
import { getRecommendations } from '../../recommend/recommend';
// getRecommendations(mood, MOOD_MAPPINGS[mood], events, now) -> Array<{ event: NormalizedEvent; reason: string }>

<!-- Existing serializer to EXTRACT, from src/http/routes/events.ts (verbatim shape). -->
function serializeEvent(e: NormalizedEvent): Record<string, unknown>;
// returns id,title,startDate(ISO),endDate(ISO?),venue,address,priceText,priceMin,priceMax,
// isFree,sourceName,sourceUrl,category,tags,ageLimit,imageUrl,fetchedAt(ISO),isSeed

<!-- Fastify decorations available on the instance (from src/http/server.ts). -->
// fastify.index.all(): NormalizedEvent[]   (in-memory, no I/O)
// fastify.store.getSources(): SourceResult[]

<!-- Existing route-test harness pattern, from src/http/routes/events.test.ts: -->
// Fastify() instance; fastify.decorate('index', buildEventIndex(fixtures));
// fastify.decorate('store', { getSources: () => [] } as unknown as CacheStore);
// await fastify.register(route); await fastify.ready();
// fastify.inject({ method: 'GET', url: '/api/...' });
</interfaces>

Project rules: types on all public functions; reads must come from fastify.index (NO I/O in request path); Ajv validates input; never read/print .env. Pitfall 3: do NOT add a Fastify route for GET / — @fastify/static serves index.html. Keep the deploy contract intact (node server.js, no SPA build).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract serialize.ts + add ?upcoming filter to /api/events</name>
  <read_first>
    - src/http/routes/events.ts (the existing serializeEvent function to lift out, the querystring schema, and the handler filter chain)
    - src/http/routes/events.test.ts (existing test style + fixtures to extend)
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (Open Question 1 — ?upcoming=true non-breaking addition; Pitfall 5 — serialize duplication)
    - src/types/events.ts (NormalizedEvent)
  </read_first>
  <files>src/http/serialize.ts, src/http/routes/events.ts, src/http/routes/events.test.ts</files>
  <behavior>
    - serializeEvent in src/http/serialize.ts produces the identical object shape currently emitted by events.ts (all 17 fields, Date fields as ISO strings, isSeed preserved)
    - GET /api/events?upcoming=true returns only events whose startDate >= now (server time); a still-running exhibition (endDate > now) is retained
    - GET /api/events with no upcoming param returns the exact same result set as before (no behavior change)
    - upcoming combines with existing date/category/free filters
  </behavior>
  <action>
    Create src/http/serialize.ts exporting a SerializedEvent type (or Record<string, unknown>) and serializeEvent(e: NormalizedEvent) moved verbatim from events.ts. In src/http/routes/events.ts, delete the local serializeEvent and import it from ../serialize; add `upcoming` as an optional boolean to the EventsQuerystring interface and to the querystring schema properties (type boolean, additionalProperties stays false); in the handler, when upcoming === true filter events by effective-date >= now where effective date is now when (startDate < now AND endDate exists AND endDate > now) else startDate — reusing the same still-running-exhibition rule as the engine. Extend src/http/routes/events.test.ts with cases: ?upcoming=true drops a past-dated fixture; ?upcoming=true keeps a still-running exhibition fixture; omitting upcoming returns the unchanged baseline count; an unknown query param still yields 400.
  </action>
  <verify>
    <automated>npx vitest run src/http/routes/events.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/http/routes/events.test.ts passes including the new upcoming cases
    - events.ts imports serializeEvent from ../serialize (grep -n "from '../serialize'" src/http/routes/events.ts matches) and defines no local serializeEvent (grep -c "function serializeEvent" src/http/routes/events.ts == 0)
    - npx tsc --noEmit clean
    - All pre-existing events route tests still pass (no behavior change when upcoming is absent)
  </acceptance_criteria>
  <done>Shared serializer extracted and reused; /api/events gains a non-breaking ?upcoming=true filter with tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: recommendations route + server registration (API-03)</name>
  <read_first>
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (section "Domain: API-03 Endpoint" — route contract, Ajv schema, handler, response shape)
    - src/http/routes/events.ts (FastifyPluginAsync pattern, querystring schema style, fastify.index.all() usage)
    - src/http/serialize.ts (serializeEvent, created in Task 1)
    - src/recommend/mood-map.ts and src/recommend/recommend.ts (MOOD_MAPPINGS, getRecommendations from plan 02-1)
    - src/http/server.ts (registration order: API routes BEFORE the static wildcard)
  </read_first>
  <files>src/http/routes/recommendations.ts, src/http/server.ts</files>
  <behavior>
    - GET /api/recommendations?mood=<enum> validates mood ∈ {drink,dance,learn,music} via Ajv with additionalProperties:false
    - Handler reads fastify.index.all() (no I/O), calls getRecommendations(mood, MOOD_MAPPINGS[mood], events, new Date()), and returns { mood, label, emoji, items:[{ event: serializeEvent(e), reason }], meta:{ count, generatedAt } }
    - isSeed is preserved on each serialized event
    - recommendationsRoute is registered in server.ts before the @fastify/static wildcard
  </behavior>
  <action>
    Create src/http/routes/recommendations.ts as a FastifyPluginAsync default export following the events.ts plugin shape. Define the querystring schema requiring mood with enum ['drink','dance','learn','music'] and additionalProperties:false (Ajv returns 400 automatically on miss/invalid — no custom error handling). In the handler read mood from req.query, resolve mapping = MOOD_MAPPINGS[mood], call getRecommendations(mood, mapping, fastify.index.all(), new Date()), and reply.send the RecommendationsResponse: mood, mapping.label, mapping.emoji, items mapped to { event: serializeEvent(event), reason }, and meta { count: items.length, generatedAt: new Date().toISOString() }. Import serializeEvent from ../serialize, MOOD_MAPPINGS from ../../recommend/mood-map, getRecommendations from ../../recommend/recommend, and Mood type-only from ../../types/events. In src/http/server.ts import recommendationsRoute and register it alongside the other API routes (before fastifyStatic) so the exact path wins over the static wildcard.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -n "register(recommendationsRoute)" src/http/server.ts</automated>
  </verify>
  <acceptance_criteria>
    - recommendations.ts default-exports a FastifyPluginAsync; npx tsc --noEmit clean
    - server.ts imports and registers recommendationsRoute before the fastifyStatic registration (grep confirms register(recommendationsRoute) appears above the fastifyStatic line)
    - Handler performs no disk/network I/O — only fastify.index.all() (grep -n "index.all" src/http/routes/recommendations.ts matches; no fetch/readFile present)
  </acceptance_criteria>
  <done>GET /api/recommendations?mood= is implemented and registered; returns mood/label/emoji/items/meta reading only from the in-memory index.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: recommendations route tests (API-03)</name>
  <read_first>
    - src/http/routes/recommendations.ts (the route under test, from Task 2)
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (section "Recommended vitest Pattern for Route Testing" — the exact inject() harness)
    - src/http/routes/events.test.ts (decorate index/store + inject pattern)
    - src/sources/seed/index.ts (seedAdapter.scrape() to build a realistic fixture index)
  </read_first>
  <files>src/http/routes/recommendations.test.ts</files>
  <behavior>
    - GET /api/recommendations?mood=music → 200, body.mood === 'music', body.items is an array, body.label and body.emoji are non-empty, meta.count === items.length
    - Each item has item.event and a non-empty item.reason string
    - GET /api/recommendations (missing mood) → 400
    - GET /api/recommendations?mood=sleep (invalid enum) → 400
    - isSeed from the source data is preserved in item.event.isSeed
  </behavior>
  <action>
    Create src/http/routes/recommendations.test.ts using Fastify().inject() exactly like the research harness: in beforeAll build an index from seedAdapter.scrape() via buildEventIndex, decorate('store', { getSources: () => [] } as unknown as CacheStore) and decorate('index', index), register the recommendations route, await ready. Add it-cases for: mood=music returns 200 with the asserted body shape (mood, array items, non-empty label/emoji, meta.count === items.length); every item has a non-empty reason; missing mood → 400; invalid mood=sleep → 400; at least one seed item retains isSeed:true in item.event. afterAll closes the instance.
  </action>
  <verify>
    <automated>npx vitest run src/http/routes/recommendations.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/http/routes/recommendations.test.ts passes all five cases
    - The 400 cases assert res.statusCode === 400 (Ajv enum/required rejection)
    - npm run test keeps the entire suite green (all prior tests + the new ones)
  </acceptance_criteria>
  <done>API-03 is verified end-to-end by inject tests proving 200 happy path with reasons, 400 validation, and isSeed honesty preservation.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → /api/recommendations | Untrusted querystring (mood) crosses into the server |
| client → /api/events | Untrusted querystring (date/category/free/upcoming) crosses into the server |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-04 | Tampering | mood querystring | mitigate | Ajv enum ['drink','dance','learn','music'] + additionalProperties:false at the framework layer; invalid input rejected with 400 before the handler runs |
| T-02-05 | Information Disclosure | recommendations error responses | mitigate | Handler does no I/O and throws nothing; Fastify default 400/500 shape only — no stack traces, no internal URLs |
| T-02-06 | Spoofing | seed served as live | mitigate | serializeEvent preserves isSeed verbatim; route test asserts isSeed survives so the UI can badge demo data |
| T-02-SC | Tampering | package installs | n/a | no new packages added |
</threat_model>

<verification>
- npx vitest run src/http/routes/ passes (events + recommendations)
- npx tsc --noEmit clean
- grep confirms recommendationsRoute registered before the static wildcard in server.ts
- npm run test all green (no regressions to the 79 existing tests)
</verification>

<success_criteria>
GET /api/recommendations?mood= returns ranked, reason-bearing, isSeed-honest JSON for all four moods, rejects bad input with 400, reads only from the in-memory index, and shares one serializer with /api/events; ?upcoming=true cleanly hides past events.
</success_criteria>

<output>
Create `.planning/phases/02-core-product-ui-mood-recommendations/02-3-SUMMARY.md` when done.
</output>
