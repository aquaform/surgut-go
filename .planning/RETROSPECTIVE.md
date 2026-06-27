# Retrospective: surgut-go

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-27
**Phases:** 3 | **Plans:** 17 | **Tasks:** 28 | **Commits:** ~93 | **Timeline:** 2026-06-23 → 2026-06-27 (~4 days)

### What Was Built
A live, honest city-events aggregator for Surgut: server-side scrape pipeline (2 GREEN sources + seed) → normalize → dedup → JSON cache with TTL/serve-stale → mood recommendations → mobile-first vanilla UI with date/free/category filters + text search + honesty badges. Deployed to https://surgut-go.apps.sielom.ru via Dokploy. 216 tests, ~85% line coverage.

### What Worked
- **Boot-first/scrape-second architecture** (decided in research) paid off: `/health` passes the Docker healthcheck instantly on seed; live data fills in the background. Made the app deployable from Phase 1.
- **Live source-probing during research** (not just training memory) gave accurate GREEN/YELLOW/RED verdicts up front — avoided planning adapters that can't work without headless.
- **`isSeed` as a required, non-optional field** made "never present seed as live" structurally enforceable rather than a convention.
- **Plan-checker caught a real blocker every phase** (e.g. `type:module` × esbuild cjs) before execution.
- **Live end-to-end smokes caught what unit tests + per-plan checks missed** — the biggest wins of the milestone (see below).

### What Was Inefficient
- **Two integration bugs slipped past per-plan "green" checks** and were only caught by live smokes: (1) the esbuild bundle crashed on boot because full `cheerio` pulled in `undici` (fixed via `cheerio/slim`); (2) text search was dead code (placed after a date-chip early-return) and filtered nothing. Per-plan checks verified "esbuild succeeds" / "searchQuery present" — not "the running app works." Lesson: an end-to-end live smoke per phase is non-negotiable.
- **First deploy went to the wrong server** (serverId null → Dokploy panel host, not the Traefik ingress) → public 404 despite a healthy container. Cost real debugging time; now captured in memory + DEPLOY.md.
- **Client JS (`public/app.js`) has no unit coverage** — both UI bugs above were browser-only catches.

### Patterns Established
- Per-phase loop: research (live-probe) → plan (opus) → plan-check (sonnet) → execute (sonnet, TDD) → **live smoke** → verify → /deploy → public check.
- Honesty model: every event carries `isSeed`; every source surfaces `live|cached|blocked|error|seed`; blocked/RED sources shown transparently, never faked (kassir).
- esbuild multi-stage → single `server.js`, zero node_modules in prod; use `cheerio/slim` to avoid bundling undici.

### Key Lessons
1. **Evidence over claims, at the system level.** "Tests pass" and "esbuild succeeds" are not "the deployed app works." Always run the built artifact and curl/click it.
2. **Honesty beats coverage.** kassir is RED (needs headless, which violates the slim constraint) → ship it `blocked` with a reason, don't fabricate. The roadmap criterion was rewritten to record the constraint.
3. **Know your infra topology.** The Dokploy panel host ≠ the Traefik ingress server; apps must target the right `serverId`.

### Cost Observations
- Model mix: planning on opus, research/execution/verification on sonnet (balanced profile).
- Execution mode: sequential on main tree (worktrees off) — reliable for a fresh project with npm/docker steps; lost some parallelism in 2-plan waves.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Tests | Notable |
|-----------|--------|-------|-------|---------|
| v1.0 MVP  | 3 | 17 | 216 | 2 integration bugs caught only by live smoke; honest RED-source handling |
