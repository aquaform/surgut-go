---
phase: 01-deployable-pipeline-green-sources
plan: 01-4
subsystem: http
tags: [fastify, health, boot-first, dockerfile, esbuild, docker, deploy]

# Dependency graph
requires:
  - 01-1 (NormalizedEvent/SourceAdapter types; tsconfig; package.json; Dockerfile already replaced)
  - 01-3 (CacheStore.loadOrSeed, buildEventIndex, seedAdapter)
provides:
  - GET /health → 200 'ok' (text/plain) via src/http/routes/health.ts
  - createServer({ store, index }) in src/http/server.ts — typed decorations, static assets, health route
  - Boot-first entrypoint (src/server.ts): loadConfig → loadOrSeed → buildEventIndex → listen(0.0.0.0:PORT)
  - public/index.html — placeholder UI
  - Dockerfile (two-stage esbuild, already in place from 01-1; confirmed working end-to-end)
affects:
  - 01-5 (refresh loop wires into server.ts extension point)
  - 01-8 (api/events + api/sources routes register on the same server instance)
  - DEPLOY (container is now deployable via /deploy to Dokploy)

# Tech tracking
tech-stack:
  added:
    - "@fastify/static"@9.1.3 (serving public/ at root prefix)
  patterns:
    - FastifyInstance module augmentation (declare module 'fastify') for typed store/index decorations
    - Boot-first: listen() resolves before any scrape fires — healthcheck always passes on seed data
    - esbuild CJS __dirname resolves to output file directory — serves public/ from correct location

key-files:
  created:
    - src/http/routes/health.ts
    - src/http/server.ts
    - public/index.html
  modified:
    - src/server.ts (replaced stub with full boot-first main() entrypoint)

key-decisions:
  - "FastifyInstance module augmentation in server.ts: typed store/index decorations let routes access shared state with full TS safety"
  - "healthRoute registered before @fastify/static: exact routes always win over static wildcard in Fastify routing"
  - "path.join(__dirname, 'public') in createServer: esbuild CJS output sets __dirname to output dir, so public/ resolves correctly in both dev and Docker"
  - "Boot order: listen() is step 4 of 5 — scrape loop is explicitly step 5 (fire-and-forget), never awaited before listen"
  - "Dockerfile was already two-stage esbuild in plan 01-1; Task 3 verified it end-to-end with docker build + container healthcheck"

# Metrics
duration: ~20min
completed: 2026-06-27
---

# Phase 01 Plan 4: Fastify Server, Boot-first Entrypoint, Docker Verification Summary

**Fastify /health route, typed createServer factory, boot-first main() entrypoint — project is deployable: container builds via esbuild multi-stage and passes Docker HEALTHCHECK on seed data**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-27
- **Tasks:** 3
- **Files created/modified:** 4

## Accomplishments

- `GET /health → 200 'ok'` (text/plain) — HEALTHCHECK passes; Traefik liveness probe satisfied
- `createServer({ store, index })` with typed FastifyInstance decorations — routes access shared state with full TypeScript safety; `@fastify/static` serves `public/` at root
- Boot-first `main()` in `src/server.ts`: seed data loaded in-process (no network), server listening and answering /health in ~50ms, before any scrape fires — DEPLOY-02 satisfied
- `npm run build` → `server.js` (1.5 MB CJS bundle, 48ms)
- `docker build` succeeds with two-stage esbuild (runner stage: zero node_modules); container starts with `STATUS=healthy`; `GET /health` returns 200 "ok" from inside container — DEPLOY-01 satisfied
- `public/index.html` placeholder page in place for Phase 2 UI

## Task Commits

1. **Task 1: Health route + Fastify createServer** — `ded757d` (feat)
   - `src/http/routes/health.ts`, `src/http/server.ts`
2. **Task 2: Boot-first entrypoint** — `e65c5d1` (feat)
   - `src/server.ts` (replaced stub), `public/index.html`
3. **Task 3: Docker verification** — no code commit required; Dockerfile was already two-stage esbuild from plan 01-1; verified end-to-end (see Deviations)

## Real Verification Output

### Local: `node server.js` + `/health`

```
PORT=3010 CACHE_DIR=./.cache-test node server.js &
{"msg":"Server listening at http://127.0.0.1:3010"}
{"msg":"Server ready on port 3010"}

curl -s http://127.0.0.1:3010/health
→ HTTP 200  body: ok
```

### Docker: build + container healthcheck + `/health`

```
docker build -t surgut-go:plan14 .
→ #11 [builder 7/7] RUN npx esbuild src/server.ts ... Done in 28ms
→ Successfully tagged surgut-go:plan14 (314 MB)

docker run -d -p 3011:3000 surgut-go:plan14
→ Container 178012896b3b — STATUS: Up (healthy)

curl -s http://127.0.0.1:3011/health
→ HTTP 200  body: ok
```

## Files Created/Modified

- `src/http/routes/health.ts` — `FastifyPluginAsync` registering `GET /health → reply.type('text/plain').send('ok')`
- `src/http/server.ts` — `createServer({ store, index })`: module augmentation on `FastifyInstance`, decorates `store`/`index`, registers health route and `@fastify/static`
- `src/server.ts` — full boot-first `main()`: `loadConfig` → `new CacheStore(cacheDir)` → `loadOrSeed(seedAdapter)` → `buildEventIndex(store.getEvents())` → `createServer` → `listen({ host: '0.0.0.0', port })` → extension point for plan 01-5 refresh loop
- `public/index.html` — minimal Russian placeholder page

## Decisions Made

- `declare module 'fastify'` augmentation adds `store: CacheStore` and `index: EventIndex` to `FastifyInstance` — routes can access them with full type checking without prop drilling
- Health route registered before `@fastify/static` — explicit ordering for clarity; in Fastify exact routes always win over wildcards regardless of registration order
- `path.join(__dirname, 'public')` for static root — esbuild `--format=cjs` sets `__dirname` to the output file's directory (`/app/` in Docker), matching where `public/` is copied

## Deviations from Plan

### Dockerfile already implemented — Task 3 verification-only

**[Info — no deviation rule triggered]**
- **Found during:** Task 3
- **Issue:** Plan 01-4 Task 3 says "Replace Dockerfile entirely with the two-stage build from RESEARCH". The Dockerfile was already replaced by plan 01-1 (confirmed by 01-1-SUMMARY.md: `modified: Dockerfile (replaced single-stage with two-stage esbuild builder)`). The current Dockerfile is identical to the RESEARCH.md specification.
- **Action:** Ran `docker build` and container healthcheck verification; confirmed all acceptance criteria pass. No code changes needed.
- **Impact:** Zero scope change. All requirements for Task 3 (DEPLOY-01) met.

### Port conflict during Docker verification

**[Rule 3 - Auto-fixed]**
- **Found during:** Task 3 container run
- **Issue:** First `docker run -d -p 3011:3000` succeeded (container `178012896b3b`). Second run attempt in the same bash block failed with "port is already allocated". Curl on port 3011 returned 200 from the first container, which was healthy.
- **Fix:** Cleaned up residual containers; verification results were captured correctly from the first (healthy) container run.
- **Impact:** Verification outcome unaffected — all acceptance criteria passed.

---

**Total deviations:** 1 info (Dockerfile pre-implemented), 1 auto-fixed (port conflict)
**Impact on plan:** Zero scope creep. All requirements satisfied.

## Known Stubs

| Stub | File | Reason | Resolved by |
|------|------|---------|-------------|
| Extension point comment | `src/server.ts` | `startRefreshLoop(...)` call will be added here in plan 01-5 | Plan 01-5 |
| Placeholder UI | `public/index.html` | Real frontend in Phase 2 | Phase 2 plans |

## Threat Flags

None — no new network endpoints beyond `/health` (already in threat model as T-01-08). No auth paths, file access beyond cwd/public, or schema changes at trust boundaries introduced.

T-01-07 (boot blocked by scraping) — **mitigated**: `listen()` completes before any scrape fires.
T-01-09 (unreachable bind host) — **mitigated**: `host: '0.0.0.0'` hardcoded in `main()`.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/http/routes/health.ts | FOUND |
| src/http/server.ts | FOUND |
| src/server.ts (full entrypoint) | FOUND |
| public/index.html | FOUND |
| commit ded757d | FOUND |
| commit e65c5d1 | FOUND |
| node server.js + /health → 200 ok | PASSED |
| docker build surgut-go:plan14 | PASSED |
| docker container healthcheck = healthy | PASSED |
| GET /health from container → 200 ok | PASSED |
| npm run typecheck | PASSED |
