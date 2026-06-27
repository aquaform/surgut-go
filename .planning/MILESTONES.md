# Milestones

## v1.0 MVP (Shipped: 2026-06-27)

**Phases completed:** 3 phases, 17 plans, 28 tasks

**Key accomplishments:**

- TypeScript/Fastify skeleton with locked deps, NormalizedEvent/SourceAdapter domain contracts, and confirmed CSS selectors from live HTML fixtures of both GREEN sources
- TDD-built parseRussianDate + parseRussianPrice (20 tests, all green) and polite fetchHtml/isAllowed layer covering all observed kassa-ugra + afisha.surguta formats
- Honest seed fallback with 12 real Surgut events (all isSeed:true), atomic JSON cache with TTL + seed fallback, and pure in-memory EventIndex with atomic rebuild
- Fastify /health route, typed createServer factory, boot-first main() entrypoint — project is deployable: container builds via esbuild multi-stage and passes Docker HEALTHCHECK on seed data
- Parallel scrape pipeline with per-source error isolation, serve-stale fallback, Phase-1 dedup, and a 2-hour background refresh loop wired into the boot entrypoint — live data refreshes off the request path with zero impact on /health
- GET /api/events and GET /api/sources/status — Ajv-validated routes reading from in-memory store/index; date/category/free filters in UTC+5; sources expose honest freshness status; 21 new tests; all 59 tests green
- Two GREEN source adapters implemented and fixture-tested with TDD: kassa-ugra.ru (3 pages, 2s politeness) and afisha.surguta.ru (listing-only, 10s crawl-delay constant), both normalising to NormalizedEvent with isSeed:false, registered alongside seed; seed status no longer reported as "live"

---
