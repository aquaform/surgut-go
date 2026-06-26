---
phase: 01-deployable-pipeline-green-sources
plan: 01-8
type: execute
wave: 6
depends_on: [01-7]
files_modified:
  - README.md
autonomous: false
requirements: [QA-01, DEPLOY-03, DEPLOY-04]
user_setup:
  - service: github
    why: "DEPLOY-03 requires a public GitHub repo so Dokploy can pull and build"
    dashboard_config:
      - task: "Authenticate gh CLI if not already (gh auth status / gh auth login)"
        location: "local shell"
  - service: dokploy
    why: "DEPLOY-04 public deploy to surgut-go.apps.sielom.ru"
    env_vars:
      - name: DOKPLOY_APP_ID
        source: "Dokploy dashboard -> application -> settings (operator runs /deploy)"
    dashboard_config:
      - task: "Run the /deploy slash-command with the Dokploy applicationId (deploy is operator-driven, never manual curl)"
        location: "Claude /deploy command"
must_haves:
  truths:
    - "lint, typecheck, build, and the full vitest suite all pass cleanly with no type errors on public functions"
    - "A public GitHub repo exists, origin is set, and main is pushed"
    - "After /deploy, https://surgut-go.apps.sielom.ru serves /health 'ok', /api/events, and /api/sources/status correctly"
  artifacts:
    - path: "README.md"
      provides: "run/build/deploy instructions for the deployed service"
  key_links:
    - from: "git origin"
      to: "github.com/<owner>/surgut-go"
      via: "gh repo create + push main"
      pattern: "origin"
---

<objective>
Run the final quality gate, publish the GitHub repository, and hand off to the operator-run /deploy so the walking skeleton goes live at surgut-go.apps.sielom.ru.

Purpose: ARCHITECTURE deploy milestone. QA-01 is the phase quality gate (lint+typecheck+build green, types on public functions). DEPLOY-03 creates the repo Dokploy needs. DEPLOY-04 is the public deploy — performed by the operator via /deploy (never manual curl, per AGENTS.md/CLAUDE.md), then verified live.
Output: a green CI gate, a pushed public repo, and a verified live deployment.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md
@AGENTS.md
@CLAUDE.md
@Dockerfile
</context>

<tasks>

<task type="auto">
  <name>Task 1: Final quality gate (lint + typecheck + build + tests + docker)</name>
  <read_first>
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (Validation Architecture; Phase gate; QA-01 row)
    - AGENTS.md (types on all public functions; deploy contract)
  </read_first>
  <action>
    Run the full phase gate and fix any failures before proceeding: npm run lint; npm run typecheck (zero type errors, public functions typed — QA-01); npm run test (full vitest suite green, including date/price/store/pipeline/both adapters); npm run build (esbuild produces server.js); docker build -t surgut-go . then a local docker run smoke test hitting /health, /api/events, /api/sources/status. Do not advance with any red check. Do not read or print .env (CLAUDE.md).
  </action>
  <verify>
    <automated>npm run lint && npm run typecheck && npm run test && npm run build && docker build -t surgut-go:gate .</automated>
  </verify>
  <acceptance_criteria>
    - lint, typecheck, full test suite, and esbuild build all exit 0
    - docker build succeeds; local container serves all three endpoints
    - no type errors on public functions (QA-01)
  </acceptance_criteria>
  <done>The phase passes its quality gate locally and in Docker.</done>
</task>

<task type="auto">
  <name>Task 2: Create GitHub repo, add origin, push main</name>
  <read_first>
    - AGENTS.md ("After first code: gh repo create <app> --public, add remote origin, push main — required for Dokploy")
    - .planning/phases/01-deployable-pipeline-green-sources/01-RESEARCH.md (DEPLOY-03; Environment Availability: gh CLI)
  </read_first>
  <action>
    Confirm gh auth (gh auth status); if unauthenticated, surface an auth checkpoint rather than failing. Update README.md with a short project description, local run command (npm run dev / docker build+run), the three endpoints, and the live URL. Commit all phase work. Then `gh repo create surgut-go --public --source=. --remote=origin --push` (or, if the repo already exists, add the origin remote and `git push -u origin main`). Verify origin is set and main is on the remote. Never use git push --force (CLAUDE.md). Do not commit .env or secrets/.
  </action>
  <verify>
    <automated>git remote get-url origin && git ls-remote --heads origin main | grep -q refs/heads/main</automated>
  </verify>
  <acceptance_criteria>
    - A public GitHub repo named surgut-go exists with origin configured
    - main is pushed to origin (git ls-remote shows refs/heads/main)
    - No .env or secrets/ content is committed
  </acceptance_criteria>
  <done>The repo is public and pushed — Dokploy can now pull and build (DEPLOY-03 satisfied).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <what-built>A deployable container (esbuild multi-stage Dockerfile, boots on seed, scrapes both GREEN sources in background) pushed to a public GitHub repo, with all three endpoints verified locally and in Docker.</what-built>
  <how-to-verify>
    1. Run the `/deploy` slash-command with the Dokploy applicationId for surgut-go (deploy is operator-driven via Dokploy — NOT manual curl, per AGENTS.md/CLAUDE.md). This is the only step Claude cannot perform autonomously.
    2. After the deploy completes, verify the live service:
       - `curl -s https://surgut-go.apps.sielom.ru/health` returns `ok` (200)
       - `curl -s https://surgut-go.apps.sielom.ru/api/events` returns a JSON envelope with events (seed immediately; live isSeed:false events after the first background refresh)
       - `curl -s https://surgut-go.apps.sielom.ru/api/sources/status` returns per-source status with fetchedAt + eventCount
    3. Confirm that within a few minutes /api/events shows at least some events with isSeed:false from kassa-ugra and/or afisha-surguta (background refresh succeeded), and that source status reflects live/cached honestly.
  </how-to-verify>
  <resume-signal>Reply "approved" once the three live endpoints respond correctly, or describe what failed (e.g., healthcheck timeout, empty events, source error) so the gap can be closed.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local repo → public GitHub | source becomes public; no secrets may leak |
| Dokploy → public internet | the live service is publicly reachable |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-19 | Info Disclosure | secrets in public repo | mitigate | .gitignore excludes .env/.env.*/secrets/; config only from process.env; never read/print .env (CLAUDE.md) |
| T-01-20 | Tampering | destructive git | mitigate | No git push --force; no rm -rf; standard push only (CLAUDE.md) |
| T-01-21 | Elevation of Privilege | manual prod curl deploy | mitigate | Deploy only via operator-run /deploy with Dokploy applicationId; no manual prod mutation |
</threat_model>

<verification>
- Local + Docker: lint/typecheck/test/build green; all three endpoints respond
- GitHub: public repo, origin set, main pushed, no secrets committed
- Live (post /deploy): /health 'ok', /api/events, /api/sources/status correct at surgut-go.apps.sielom.ru
</verification>

<success_criteria>
- QA-01: lint + typecheck + build pass; types on public functions
- DEPLOY-03: GitHub repo created, origin added, main pushed
- DEPLOY-04: public deploy via /deploy verified at https://surgut-go.apps.sielom.ru
</success_criteria>

<output>
Create `.planning/phases/01-deployable-pipeline-green-sources/01-8-SUMMARY.md` when done
</output>
