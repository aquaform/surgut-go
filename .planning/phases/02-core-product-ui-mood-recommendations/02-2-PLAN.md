---
phase: 02-core-product-ui-mood-recommendations
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pipeline/dedup.test.ts
  - src/pipeline/index-events.test.ts
autonomous: true
requirements: [AGG-03, QA-02]
must_haves:
  truths:
    - "The same event arriving from two sources collapses to a single result"
    - "A live record beats a seed record on key collision (prefer live)"
    - "Two genuinely different events on different dates are NOT merged"
    - "buildEventIndex returns events sorted by startDate ASC and byCategory returns the correct subset"
  artifacts:
    - path: "src/pipeline/dedup.test.ts"
      provides: "AGG-03 cross-source dedup coverage (composite key + prefer-live policy + Cyrillic slug)"
    - path: "src/pipeline/index-events.test.ts"
      provides: "EventIndex sort/byCategory/rebuild coverage"
  key_links:
    - from: "src/pipeline/dedup.test.ts"
      to: "src/pipeline/dedup.ts"
      via: "import { dedup }"
      pattern: "from '\\./dedup'"
    - from: "src/pipeline/index-events.test.ts"
      to: "src/pipeline/index-events.ts"
      via: "import { buildEventIndex }"
      pattern: "from '\\./index-events'"
---

<objective>
Complete AGG-03 (cross-source dedup) by proving the already-implemented src/pipeline/dedup.ts satisfies the composite-key + prefer-live requirement, and raise QA-02 coverage on the previously-untested pipeline modules by adding tests for src/pipeline/index-events.ts.

Purpose: AGG-03's code already exists from Phase 1; the requirement's remaining work is verification via tests (per 02-RESEARCH "Phase 2 Scope for AGG-03"). dedup.ts and index-events.ts currently have NO tests, dragging branch/function coverage below 80% — these tests close that gap.
Output: src/pipeline/dedup.test.ts and src/pipeline/index-events.test.ts. NO production code changes (dedup.ts and index-events.ts are not modified).
</objective>

<phase_goal>
**As a** mobile user in Surgut, **I want to** tap a mood button and immediately see ranked, honest event cards with a "почему рекомендовано" reason, **so that** I can decide where to go tonight.

This plan guarantees the user never sees the same event twice (dedup) and that the index feeding recommendations is correctly ordered — the data-integrity slice of the phase. Runs in parallel with plan 02-1 (disjoint files).
</phase_goal>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md

<interfaces>
<!-- Functions under test. From src/pipeline/. Do NOT modify these source files. -->

// src/pipeline/dedup.ts
export function dedup(events: NormalizedEvent[]): NormalizedEvent[];
// key = sha1(toSlug(title) | startDate.toISOString().slice(0,10) | toSlug(venue))
// collision policy: existing.isSeed && !incoming.isSeed → replace with live; else first-seen wins

// src/pipeline/index-events.ts
export interface EventIndex {
  all(): NormalizedEvent[];                                  // sorted by startDate ASC
  byCategory(category: EventCategory): NormalizedEvent[];    // subset, sorted ASC, [] if none
  rebuild(newEvents: NormalizedEvent[]): void;               // atomic swap
}
export function buildEventIndex(events: NormalizedEvent[]): EventIndex;
</interfaces>

Existing test harness pattern: vitest describe/it/expect; fixtures are plain NormalizedEvent literals with explicit Date instances (see src/http/routes/events.test.ts for the fixture style). dedup.ts SCOPE BOUNDARY comment forbids extending it for fuzzy matching — Phase 2 adds tests only.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: dedup.test.ts — AGG-03 cross-source dedup proof</name>
  <read_first>
    - src/pipeline/dedup.ts (the dedup function + eventKey + toSlug under test — do NOT modify)
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (section "Domain: Dedup Enhancement (AGG-03)" — the exact test cases to cover)
    - src/http/routes/events.test.ts (NormalizedEvent fixture literal style)
    - src/types/events.ts (NormalizedEvent field list for valid fixtures)
  </read_first>
  <files>src/pipeline/dedup.test.ts</files>
  <behavior>
    - Same title + same startDate day + same venue from two different sourceNames → dedup returns length 1
    - When the first-seen record isSeed:true and the duplicate isSeed:false → the surviving record is the live one (isSeed:false)
    - When both records are live (both isSeed:false) → first-seen survives (stable)
    - Different titles on different dates → dedup returns both (length 2)
    - Same title+venue but startDate 31 minutes apart on the SAME calendar day → still merged (key uses date day only, not time)
    - Cyrillic titles produce a stable, collision-free slug (two distinct Cyrillic titles do not collapse)
  </behavior>
  <action>
    Create src/pipeline/dedup.test.ts importing dedup from ./dedup and NormalizedEvent from ../types/events. Build a small makeEvent(overrides) helper that returns a complete NormalizedEvent with sensible defaults (all required fields populated, fetchedAt a fixed Date). Write a describe('dedup (AGG-03)') with it-cases covering every bullet in <behavior>: cross-source collapse to 1; prefer-live-over-seed (assert the survivor's sourceName/isSeed); both-live first-seen-wins; distinct events preserved; same-day 31-minutes-apart still merged; two distinct Cyrillic titles remain separate. Assert on array length and on identifying fields (sourceName, isSeed, title) of the survivors, not object identity.
  </action>
  <verify>
    <automated>npx vitest run src/pipeline/dedup.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/pipeline/dedup.test.ts passes with all six behavior cases asserted
    - src/pipeline/dedup.ts is byte-for-byte unchanged: git diff --quiet src/pipeline/dedup.ts
    - npx vitest run --coverage src/pipeline/dedup.test.ts reports dedup.ts lines covered (function appears in coverage table)
  </acceptance_criteria>
  <done>AGG-03 is verified by tests proving cross-source dedup, prefer-live policy, and Cyrillic slug stability; dedup.ts untouched.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: index-events.test.ts — EventIndex coverage</name>
  <read_first>
    - src/pipeline/index-events.ts (buildEventIndex / all / byCategory / rebuild under test — do NOT modify)
    - src/types/events.ts (NormalizedEvent, EventCategory)
  </read_first>
  <files>src/pipeline/index-events.test.ts</files>
  <behavior>
    - buildEventIndex(events).all() returns events sorted by startDate ascending regardless of input order
    - byCategory(cat) returns only events of that category, sorted ASC; returns [] for a category with no events
    - rebuild(newEvents) atomically replaces contents — after rebuild, all() reflects the new array and not the old
    - buildEventIndex([]) yields all() === [] and byCategory(anything) === []
  </behavior>
  <action>
    Create src/pipeline/index-events.test.ts importing buildEventIndex from ./index-events and NormalizedEvent/EventCategory from ../types/events. Reuse a makeEvent(overrides) helper. Write describe('EventIndex') asserting: feeding events out of date order yields all() in ascending startDate order; byCategory('concert') returns only concert events in order and byCategory('sport') returns [] when none exist; after rebuild() with a fresh array the all() output equals the new set and excludes the prior events; the empty-index edge case returns [] for both all() and byCategory().
  </action>
  <verify>
    <automated>npx vitest run src/pipeline/index-events.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/pipeline/index-events.test.ts passes
    - src/pipeline/index-events.ts unchanged: git diff --quiet src/pipeline/index-events.ts
    - All pre-existing tests stay green: npm run test (≥ 79 + new tests, 0 failures)
  </acceptance_criteria>
  <done>EventIndex sort/byCategory/rebuild/empty branches are covered; index-events.ts untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Test-only plan; no runtime boundary added |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-03 | Spoofing | seed presented as live after dedup | mitigate | dedup test asserts prefer-live policy so a live duplicate always wins over seed, never the reverse |
| T-02-SC | Tampering | package installs | n/a | no new packages; test-only plan |
</threat_model>

<verification>
- npx vitest run src/pipeline/ passes
- git diff --quiet src/pipeline/dedup.ts && git diff --quiet src/pipeline/index-events.ts (no production changes)
- npm run test all green
</verification>

<success_criteria>
AGG-03 is proven complete by tests (no code change needed); previously-untested pipeline modules now carry coverage, lifting overall function/branch coverage toward the 80% QA-02 gate verified in plan 02-4.
</success_criteria>

<output>
Create `.planning/phases/02-core-product-ui-mood-recommendations/02-2-SUMMARY.md` when done.
</output>
