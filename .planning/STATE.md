---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: checkpoint
stopped_at: "01-8 deploy checkpoint (DEPLOY-04 pending operator /deploy)"
last_updated: "2026-06-27T02:45:00.000Z"
last_activity: 2026-06-26
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 8
  completed_plans: 8
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26)

**Core value:** Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных.
**Current focus:** Phase 01 — deployable-pipeline-green-sources

## Current Position

Phase: 01 (deployable-pipeline-green-sources) — EXECUTING
Plan: 8 of 8
Status: Deploy checkpoint — awaiting operator /deploy
Last activity: 2026-06-27

Progress: [█████████░] 95% (deploy gate pending)

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
| Phase 01 P01-4 | 20 | 3 tasks | 4 files |
| Phase 01 P01-5 | 7 | 3 tasks | 5 files |
| Phase 01-deployable-pipeline-green-sources P01-6 | 25min | 3 tasks | 6 files |
| Phase 01-deployable-pipeline-green-sources P01-7 | 25 | 3 tasks | 7 files |
| Phase 01-deployable-pipeline-green-sources P01-8 | 10min | 2 tasks (deploy pending) | 1 file |

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
- [Phase ?]: FastifyInstance module augmentation in server.ts: typed store/index decorations
- [Phase ?]: Boot-first main(): listen() completes before any scrape fires — DEPLOY-02 satisfied
- [Phase ?]: Dockerfile two-stage esbuild was pre-implemented in 01-1; Task 3 was verification-only
- [Phase ?]: Ajv querystring schema rejects invalid enum values with 400 FST_ERR_VALIDATION on events route
- [Phase ?]: filterByDate in events route uses surgutDayBoundaryMs for UTC+5 (Asia/Yekaterinburg) date filtering
- [Phase ?]: sources/status route exposes human-readable error only — no stack traces or internal URLs (T-01-14 mitigated)
- [01-8]: Public GitHub repo aquaform/surgut-go created; origin set; main pushed — DEPLOY-03 satisfied
- [01-8]: Quality gate (lint/typecheck/79 tests/build/docker) passed clean on existing code — QA-01 satisfied

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

Last session: 2026-06-27T02:45:00.000Z
Stopped at: 01-8 deploy checkpoint — quality gate passed, GitHub repo published at https://github.com/aquaform/surgut-go, awaiting operator /deploy
Resume file: None
