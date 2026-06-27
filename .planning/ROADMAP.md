# Roadmap: surgut-go

## Overview

Three phases deliver the product from nothing to a fully deployed city-events aggregator. Phase 1 builds the honest data pipeline — deployable on day one with seed data and both GREEN sources scraping in the background. Phase 2 delivers the core value: a user taps a mood button and gets ranked event cards. Phase 3 expands event coverage with cautiously-added YELLOW sources and text search. Every phase is a vertical, deployable slice; no phase blocks another on user-facing features.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Deployable Pipeline & Green Sources** - Boot-first deploy with seed data, both GREEN scrapers, JSON cache, and core API — live on surgut-go.apps.sielom.ru (completed 2026-06-27)
- [ ] **Phase 2: Core Product UI & Mood Recommendations** - Mobile-first main page with 4 mood buttons, ranked event cards, dedup, date/price filters, and visible source status — core value delivered end-to-end
- [ ] **Phase 3: Yellow Sources & Text Search** - Three cautiously-added YELLOW source adapters (afisha.ru, kassir.ru, Yandex Afisha disabled-by-default) and keyword search

## Phase Details

### Phase 1: Deployable Pipeline & Green Sources
**Goal**: The app boots in under 200 ms on seed/cached data, scrapes both GREEN sources in the background, exposes working API endpoints with honest source-status transparency, and is deployed live to surgut-go.apps.sielom.ru.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AGG-01, AGG-02, AGG-04, AGG-05, SRC-01, SRC-02, SRC-03, SRC-07, SRC-08, CACHE-01, CACHE-02, CACHE-03, CACHE-04, API-01, API-02, API-04, API-05, DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, QA-01
**Success Criteria** (what must be TRUE):
  1. `GET /health` returns 200 `ok` within the Docker healthcheck start-period, before any live scrape completes (seed data is already in memory)
  2. `GET /api/events` returns real normalized events sourced from both kassa-ugra.ru and afisha.surguta.ru with `isSeed: false`; seed events carry `isSeed: true` and are structurally impossible to mistake for live data
  3. `GET /api/sources/status` shows per-source `status`, `fetchedAt`, and `eventCount`; killing a source mid-cycle causes the next response to show `cached` with the last-valid event count, never an empty list
  4. lint, typecheck, and build all pass cleanly with no type errors on public functions
  5. The app is publicly reachable at https://surgut-go.apps.sielom.ru with `/health`, `/api/events`, and `/api/sources/status` returning correct responses
**Plans**: 8 plans (6 waves) — Walking Skeleton; see 01-SKELETON.md
Plans:
- [x] 01-1-PLAN.md — Scaffold project + domain contracts + Wave-0 live-source selector discovery
- [x] 01-2-PLAN.md — Russian date/price utilities (TDD) + polite HTTP fetch + robots compliance
- [x] 01-3-PLAN.md — Honest seed fallback + durable JSON cache store + in-memory EventIndex
- [x] 01-4-PLAN.md — Boot-first Fastify server + /health + esbuild multi-stage Dockerfile (deployable skeleton)
- [x] 01-5-PLAN.md — Parallel scrape pipeline (error isolation, min-results, serve-stale) + cron refresh loop
- [x] 01-6-PLAN.md — API routes: /api/events (filters + Ajv) and /api/sources/status
- [x] 01-7-PLAN.md — kassa-ugra.ru + afisha.surguta.ru GREEN adapters (fixture-tested) + registry wiring
- [x] 01-8-PLAN.md — Quality gate + GitHub repo (push main) + operator /deploy to surgut-go.apps.sielom.ru

### Phase 2: Core Product UI & Mood Recommendations
**Goal**: A user on mobile taps one of four mood buttons and immediately sees ranked, honest event cards with a "Почему рекомендовано" label — the core value proposition is delivered end-to-end in the browser.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: AGG-03, MOOD-01, MOOD-02, MOOD-03, API-03, UI-01, UI-02, UI-03, UI-04, UI-05, UI-07, QA-02
**Success Criteria** (what must be TRUE):
  1. A user on mobile can tap "🍸 Хочу выпить" (or any mood button) and see ranked event cards within 1 second, each carrying a "Почему рекомендовано" label (e.g., "Стендап · Open mic")
  2. When the same event appears in two sources, only one card is shown in the results (composite-key dedup by normalized title + date day + venue)
  3. Date filter chips (Сегодня / Завтра / Выходные / 7 дней) correctly filter events in Asia/Yekaterinburg timezone; the free-events toggle hides paid events and only events with `isFree: true` remain
  4. Each event card and the source status panel visibly distinguish live / cached / demo data — no seed event is ever presented without a "Демо" or "Кэш" badge
  5. vitest coverage for parsers, dedup, mood mapping, and date/price utilities reaches 80%+ (measured by coverage report)
**Plans**: 4 plans (3 waves)
Plans:
- [ ] 02-1-PLAN.md — Pure recommendation engine: mood mapping + tonight-first ranking + reason text (MOOD-01/02/03)
- [ ] 02-2-PLAN.md — Dedup + EventIndex tests proving AGG-03 cross-source collapse and feeding QA-02 coverage
- [ ] 02-3-PLAN.md — GET /api/recommendations route + shared serializer + ?upcoming filter (API-03)
- [ ] 02-4-PLAN.md — Mobile UI shell + vanilla client (mood/cards/filters/source panel/Демо badges) + QA-02 coverage gate (UI-01..05,07)
**UI hint**: yes

### Phase 3: Yellow Sources & Text Search
**Goal**: Event coverage is expanded with three YELLOW source adapters added cautiously with documented guards, and users can search events by keyword.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SRC-04, SRC-05, SRC-06, UI-06
**Success Criteria** (what must be TRUE):
  1. Events from afisha.ru/surgut appear in `/api/events` with correct source attribution; a parse failure (HTTP 200 but fewer than 2 events returned) logs a `parseError` and does not overwrite the existing cache
  2. Events from sur.kassir.ru (minimum 10 events) appear in results; AJAX pagination is handled via direct endpoint discovery or date-filtered URLs — no Playwright or headless browser is used
  3. The afisha.yandex.ru adapter is disabled by default (`enabled: false` in source config with `tosRisk: true` documented); enabling it via config toggle adds Yandex events; an HTTP 403 response marks the source as `blocked` without crashing the refresh loop
  4. Text search in the UI filters visible event cards by keyword (case-insensitive, Russian locale) without a page reload
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Deployable Pipeline & Green Sources | 8/8 | Complete   | 2026-06-27 |
| 2. Core Product UI & Mood Recommendations | 0/4 | Planned | - |
| 3. Yellow Sources & Text Search | 0/TBD | Not started | - |
