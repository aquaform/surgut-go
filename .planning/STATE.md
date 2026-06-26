---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 01-3-PLAN.md: seed adapter, CacheStore (atomic+TTL+seed fallback), EventIndex. Next: 01-4"
last_updated: "2026-06-27T01:22:00.000Z"
last_activity: 2026-06-27
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 8
  completed_plans: 3
  percent: 37
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26)

**Core value:** Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных.
**Current focus:** Phase 01 — deployable-pipeline-green-sources

## Current Position

Phase: 01 (deployable-pipeline-green-sources) — EXECUTING
Plan: 3 of 8
Status: Ready to execute
Last activity: 2026-06-26

Progress: [███░░░░░░░] 37%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-deployable-pipeline-green-sources P01-1 | 19min | 3 tasks | 13 files |
| Phase 01-deployable-pipeline-green-sources P01-2 | 3min | 3 tasks | 6 files |
| Phase 01-deployable-pipeline-green-sources P01-3 | 12min | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Stack fully locked: Node.js 20 + TypeScript + Fastify + cheerio + esbuild + vitest
- Cache strategy: JSON file on disk with TTL (no native addons; survives restarts)
- Boot order: seed data first → Fastify listen → background scrape (never block healthcheck on scraping)
- Source tiers: kassa-ugra + afisha.surguta.ru are GREEN (Phase 1); afisha.ru + kassir.ru + Yandex Afisha are YELLOW (Phase 3); tbank.ru is RED (never MVP)
- afisha.surguta.ru requires 10 s crawl-delay per robots.txt — must be in fetch layer before first scrape
- Category URL mapping for afisha.surguta.ru is a discovery task at Phase 1 start (30-min curl investigation)
- [Phase ?]: CJS-default package.json + esbuild --format=cjs: node server.js works without type:module
- [Phase ?]: afisha.surguta.ru charset is UTF-8 not windows-1251 — Pitfall 10 resolved; no TextDecoder needed
- [Phase ?]: tsconfig moduleResolution: bundler permits extensionless relative imports throughout the project
- [Phase ?]: @types/robots-parser does not exist on npm — robots-parser ships its own TS types (confirmed)

### Pending Todos

None yet.

### Blockers/Concerns

- afisha.surguta.ru category `href` values not captured in research — requires `curl` discovery before Phase 1 parser is written (Pitfall 10)
- sur.kassir.ru AJAX endpoint unknown — requires DevTools investigation at Phase 3 start (Pitfall 8)
- afisha.ru HTML selectors may be stale by Phase 3 — re-probe before writing adapter

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Source | tbank.ru (CSR, needs headless) | v2+ | Research 2026-06-26 |
| Source | afisha.yandex.ru (ToS risk) | Phase 3, disabled-by-default | Research 2026-06-26 |
| Feature | Accounts / favorites / personalization | v2+ | Project init |
| Feature | Geolocation / map view | v2+ | Project init |

## Session Continuity

Last session: 2026-06-27T01:22:00.000Z
Stopped at: Completed 01-3-PLAN.md: seed adapter, CacheStore (atomic+TTL+seed fallback), EventIndex. Next: 01-4
Resume file: None
