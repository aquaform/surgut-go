# Walking Skeleton — surgut-go

**Phase:** 1
**Generated:** 2026-06-27

## Capability Proven End-to-End

A deployed container boots in ~100 ms on honest seed data, passes the Docker healthcheck before any scrape runs, then background-refreshes from both GREEN sources (kassa-ugra.ru + afisha.surguta.ru) so that `GET /api/events` returns real normalized events (`isSeed:false`) and `GET /api/sources/status` reports per-source freshness — reachable publicly at https://surgut-go.apps.sielom.ru.

> User story (API-consumer framing for a backend walking skeleton):
> **As an** API consumer (the future surgut-go web UI), **I want to** call `/health`, `/api/events`, and `/api/sources/status` against the live deployed service and receive honest, source-attributed, freshness-stamped event data, **so that** the product UI can be built on an always-up, trustworthy data pipeline.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 (LOCKED) | LTS; built-in `fetch` (undici); no native HTTP client; matches `node:20-slim` deploy target |
| Language | TypeScript 5.x, types on all public functions | AGENTS.md mandate; catches parse-shape mismatches at compile time |
| HTTP framework | Fastify 5.8.5 | Schema-first, built-in Ajv route validation, first-class TS |
| HTML parsing | cheerio 1.2.0 (`import * as cheerio`) | No native deps; both GREEN sources are SSR plain HTML; `.text()` strips HTML/entities (XSS-safe) |
| HTTP fetch | native `fetch` + p-retry 8.0.0 + `AbortSignal.timeout` | No axios/node-fetch; Node 20 fetch is production-grade |
| robots/crawl | robots-parser 3.0.1 + per-domain delay (afisha.surguta = 10 s) | SRC-07 compliance |
| Scheduling | node-cron 4.5.0, background fire-and-forget | Boot-first/scrape-second; never blocks healthcheck |
| Cache | JSON file `${CACHE_DIR}/events.json`, atomic `.tmp`→rename, TTL (default 4 h) | No native DB; survives restart; single-container-safe |
| Serving | In-memory `EventIndex` rebuilt atomically by refresh loop | Zero I/O in request path; serve-stale-on-failure |
| Honesty | required `isSeed: boolean` on every event; seed always `isSeed:true` | Structurally impossible to present seed as live |
| Build | esbuild 0.28.1 multi-stage Docker (builder → slim runner, zero node_modules in runner); `server.js` is the bundle | Replaces golden-template single-stage Dockerfile |
| Dev | tsx 4.22.4 watch; vitest 4.1.9 for unit tests | No runtime TS in prod |
| Deploy | Dokploy via `/deploy` only; GitHub repo created first | DEPLOY-03/04 |
| Directory layout | `src/{types,config,utils,sources/<name>,pipeline,cache,http/routes}` + entrypoint `src/server.ts` | One file per concern; no god-files (AGENTS.md) |

## Stack Touched in Phase 1

- [x] Project scaffold (package.json, tsconfig, vitest.config, eslint, esbuild build, npm scripts) — Plan 01-1
- [x] Routing — `/health`, `/api/events`, `/api/sources/status` (Fastify, Ajv-validated) — Plans 01-4, 01-6
- [x] Cache — real JSON read AND atomic write, TTL staleness — Plans 01-3, 01-5
- [x] Real source scrape — kassa-ugra.ru + afisha.surguta.ru → NormalizedEvent[] — Plan 01-7
- [x] Deployment — esbuild multi-stage Dockerfile + GitHub repo + `/deploy` to surgut-go.apps.sielom.ru — Plans 01-4, 01-8

## Out of Scope (Deferred to Later Slices)

- Mood mapping / `/api/recommendations` / ranking (Phase 2)
- Full fuzzy dedup composite key with ±30 min tolerance (Phase 2; Phase 1 ships a minimal prefer-live-over-seed dedup only)
- Web UI / mood buttons / event cards / filter chips (Phase 2)
- YELLOW sources: afisha.ru, sur.kassir.ru, afisha.yandex.ru, text search (Phase 3)
- tbank.ru (RED — requires headless; v2+)
- afisha.surguta detail-page fetches for time precision (Phase 2; Phase 1 stores listing date at Surgut midnight when no time present)
- Persistent cache volume mount (env-ready via `CACHE_DIR`, not configured in Phase 1)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering the architectural decisions above:

- Phase 2: User taps a mood button → ranked honest event cards with "Почему рекомендовано"; full dedup; date/price filters; visible source/freshness badges.
- Phase 3: Three cautiously-added YELLOW source adapters (afisha.ru, sur.kassir.ru, afisha.yandex.ru disabled-by-default) + keyword text search.
