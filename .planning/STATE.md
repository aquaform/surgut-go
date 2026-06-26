# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26)

**Core value:** Пользователь нажимает кнопку-настроение и сразу получает релевантные, актуальные карточки событий Сургута с честным указанием источника и свежести данных.
**Current focus:** Phase 1 — Deployable Pipeline & Green Sources

## Current Position

Phase: 1 of 3 (Deployable Pipeline & Green Sources)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-06-26 — Roadmap created; ready to plan Phase 1

Progress: [░░░░░░░░░░] 0%

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

Last session: 2026-06-26
Stopped at: Roadmap written; STATE.md and REQUIREMENTS.md traceability initialized. Next: `/gsd:plan-phase 1`
Resume file: None
