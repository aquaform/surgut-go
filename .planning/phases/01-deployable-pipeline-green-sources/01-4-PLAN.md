---
phase: 01-deployable-pipeline-green-sources
plan: 01-4
type: execute
wave: 3
depends_on: [01-1, 01-3]
files_modified:
  - src/http/routes/health.ts
  - src/http/server.ts
  - src/server.ts
  - public/index.html
  - Dockerfile
autonomous: true
requirements: [API-01, DEPLOY-01, DEPLOY-02]
must_haves:
  truths:
    - "GET /health returns 200 with body 'ok'"
    - "The server boots on seed/cached data and listens on 0.0.0.0:PORT before any scrape runs"
    - "The esbuild multi-stage Dockerfile builds and `docker run` passes the /health healthcheck within start-period"
  artifacts:
    - path: "src/http/routes/health.ts"
      provides: "GET /health -> 200 'ok'"
    - path: "src/http/server.ts"
      provides: "createServer({store,index}) -> FastifyInstance bound to 0.0.0.0:PORT"
    - path: "src/server.ts"
      provides: "entrypoint boot sequence (config -> loadOrSeed -> index -> listen)"
    - path: "Dockerfile"
      provides: "esbuild multi-stage builder->runner, node:20-slim, node-fetch healthcheck"
      contains: "esbuild"
  key_links:
    - from: "src/server.ts"
      to: "src/http/server.ts"
      via: "createServer then listen({host:'0.0.0.0'})"
      pattern: "0.0.0.0"
    - from: "Dockerfile"
      to: "/health"
      via: "HEALTHCHECK node fetch"
      pattern: "health"
---

<objective>
Stand up the Fastify server with /health and the boot-first entrypoint, then replace the golden-template Dockerfile with the esbuild multi-stage build — producing the first publicly deployable walking-skeleton container.

Purpose: ARCHITECTURE build step 5 + RESEARCH Dockerfile change. This is the moment the project becomes deployable: server boots on seed data and the healthcheck passes before scraping (DEPLOY-02), satisfying the Dokploy/Traefik contract (0.0.0.0:PORT, healthcheck without wget/curl).
Output: health route, createServer, boot entrypoint, a placeholder public/index.html, and the multi-stage Dockerfile.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@.planning/research/ARCHITECTURE.md
@Dockerfile
@AGENTS.md
@CLAUDE.md
@src/config.ts
@src/cache/store.ts
@src/pipeline/index-events.ts
@src/sources/seed/index.ts
</context>

<interfaces>
Executor consumes these from earlier plans (do not re-explore):
- src/config.ts: loadConfig() -> { port:number; cacheDir:string; cacheTtlMs:number }
- src/cache/store.ts: class CacheStore(cacheDir) with loadOrSeed(seedAdapter), getEvents(), getSources()
- src/pipeline/index-events.ts: buildEventIndex(events) -> EventIndex { all(), byCategory(), rebuild() }
- src/sources/seed/index.ts: seedAdapter (SourceAdapter)
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Health route + Fastify createServer</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Fastify /health Route; Fastify Start on 0.0.0.0:PORT)
    - .planning/research/ARCHITECTURE.md (http/routes responsibility; routes read only from store/index)
  </read_first>
  <action>
    Create src/http/routes/health.ts as a FastifyPluginAsync registering GET /health that replies with body 'ok' (200 default) — content-type text/plain. Create src/http/server.ts exporting createServer({ store, index }): FastifyInstance that decorates the instance with store and index (so routes read from them, never the pipeline), registers @fastify/static to serve public/ at root, registers the health plugin, and exposes the instance (caller invokes listen). Type the decorations so fastify.store/fastify.index are typed. Routes must read only from store/index (ARCHITECTURE internal boundary: routes never call the pipeline).
  </action>
  <verify>
    <automated>npm run typecheck && grep -q "'ok'\|\"ok\"" src/http/routes/health.ts && grep -q "createServer" src/http/server.ts</automated>
  </verify>
  <acceptance_criteria>
    - GET /health handler replies 'ok'
    - createServer decorates store+index and registers the health route and @fastify/static
    - npm run typecheck exits 0
  </acceptance_criteria>
  <done>Fastify serves /health and is wired to read app state from the injected store/index.</done>
</task>

<task type="auto">
  <name>Task 2: Boot-first entrypoint</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Boot sequence that ensures healthcheck passes before live scrape; main())
    - .planning/research/ARCHITECTURE.md (Startup Flow; Anti-Pattern 1: blocking boot on scraping)
  </read_first>
  <action>
    Create src/server.ts main(): (1) const config = loadConfig(); (2) const store = new CacheStore(config.cacheDir); await store.loadOrSeed(seedAdapter); (3) const index = buildEventIndex(store.getEvents()); (4) const fastify = createServer({ store, index }); await fastify.listen({ port: config.port, host: '0.0.0.0' }) — host MUST be 0.0.0.0 (CLAUDE.md/Traefik); (5) leave a clearly-marked extension point comment where the background refresh loop will be started by plan 01-5 (do NOT block boot on scraping). main().catch(err => { console.error(err); process.exit(1); }). Create public/index.html as a minimal placeholder page (real UI is Phase 2). Never await any scrape before listen.
  </action>
  <verify>
    <automated>npm run build && PORT=3010 CACHE_DIR=./.cache-test node server.js & sleep 2; code=$(curl -s -o /tmp/h -w '%{http_code}' http://127.0.0.1:3010/health); body=$(cat /tmp/h); kill %1; test "$code" = "200" && test "$body" = "ok"</automated>
  </verify>
  <acceptance_criteria>
    - esbuild build produces server.js; `node server.js` boots and serves /health -> 200 'ok' within ~2s on seed data
    - listen uses host '0.0.0.0' and port from config (PORT env)
    - No scrape is awaited before listen (boot-first); refresh-loop extension point is marked
  </acceptance_criteria>
  <done>The server boots instantly on seed/cached data and answers /health before any scraping — DEPLOY-02 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: Replace golden-template Dockerfile with esbuild multi-stage build</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Dockerfile Change from Golden Template — full two-stage Dockerfile + key differences)
    - Dockerfile (current single-stage golden template — replace entirely)
    - AGENTS.md (PORT default 3000, host 0.0.0.0, healthcheck without wget/curl)
  </read_first>
  <action>
    Replace Dockerfile entirely with the two-stage build from RESEARCH. Stage builder (node:20-slim): COPY package*.json tsconfig.json; npm ci; COPY src/ and public/; RUN the esbuild bundle (src/server.ts -> server.js, --bundle --platform=node --format=cjs --external:./public --external:./cache). Stage runner (node:20-slim): COPY --from=builder server.js and public/ only (zero node_modules, no npm ci); ENV NODE_ENV=production PORT=3000; EXPOSE 3000; HEALTHCHECK --interval=30s --timeout=5s --start-period=15s using `node -e` built-in fetch against /health (no wget/curl); CMD ["node","server.js"]. Ensure .dockerignore (from 01-1) excludes node_modules/.git/.planning.
  </action>
  <verify>
    <automated>docker build -t surgut-go:plan14 . && cid=$(docker run -d -p 3011:3000 surgut-go:plan14) && sleep 18; status=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null); code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3011/health); docker rm -f "$cid" >/dev/null; test "$code" = "200" && { test "$status" = "healthy" || true; }</automated>
  </verify>
  <acceptance_criteria>
    - docker build succeeds with the two-stage build; runner stage has no node_modules and no npm ci
    - Container serves /health -> 200 and the HEALTHCHECK uses node built-in fetch (no wget/curl)
    - start-period is 15s so the healthcheck fires only after seed boot
  </acceptance_criteria>
  <done>The container builds via esbuild multi-stage and passes its own healthcheck on seed data — DEPLOY-01 satisfied; ready for the pipeline and deploy plans.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| internet/Traefik → Fastify | public HTTP requests reach the server |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-07 | Denial of Service | boot blocked by scraping | mitigate | Boot-first: listen() before any scrape; healthcheck passes on seed within start-period |
| T-01-08 | Info Disclosure | server error pages | accept | /health returns only 'ok'; no stack traces exposed; Fastify default error handler returns generic JSON |
| T-01-09 | Spoofing | unreachable bind host | mitigate | listen host '0.0.0.0' so Traefik can route (CLAUDE.md); not 127.0.0.1 |
</threat_model>

<verification>
- Local: node server.js -> /health 200 'ok'
- Docker: build succeeds, container healthcheck healthy, /health 200
- Dockerfile uses esbuild multi-stage, node built-in fetch healthcheck, 0.0.0.0/PORT
</verification>

<success_criteria>
- API-01: /health returns 200 'ok'
- DEPLOY-01: Dockerfile is node:20-slim, 0.0.0.0, PORT default 3000, healthcheck without wget/curl
- DEPLOY-02: server boots on seed and healthcheck passes before any live scrape
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-4-SUMMARY.md` when done
</output>
