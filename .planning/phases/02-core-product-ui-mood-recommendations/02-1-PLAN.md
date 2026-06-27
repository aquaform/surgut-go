---
phase: 02-core-product-ui-mood-recommendations
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/recommend/mood-map.ts
  - src/recommend/mood-map.test.ts
  - src/recommend/recommend.ts
  - src/recommend/recommend.test.ts
autonomous: true
requirements: [MOOD-01, MOOD-02, MOOD-03]
must_haves:
  truths:
    - "getRecommendations(mood, ...) returns only future events; past-dated items are filtered out"
    - "Every returned recommendation carries a non-empty reason string"
    - "For drink/dance, tonight-evening events outrank later events; for learn/music nearest-first"
    - "A still-running exhibition (endDate in future, startDate in past) appears in learn recommendations"
  artifacts:
    - path: "src/recommend/mood-map.ts"
      provides: "MOOD_MAPPINGS constant for all 4 moods + MoodMapping interface"
      contains: "MOOD_MAPPINGS"
    - path: "src/recommend/recommend.ts"
      provides: "isEventMatchForMood, scoreEvent, buildReasonText, getRecommendations pure functions"
      exports: ["getRecommendations", "isEventMatchForMood", "buildReasonText"]
    - path: "src/recommend/recommend.test.ts"
      provides: "Ranking + reason + filter + exhibition branch coverage"
  key_links:
    - from: "src/recommend/recommend.ts"
      to: "src/recommend/mood-map.ts"
      via: "import MOOD_MAPPINGS / MoodMapping"
      pattern: "from '\\./mood-map'"
    - from: "src/recommend/recommend.ts"
      to: "src/types/events.ts"
      via: "import NormalizedEvent / Mood / EventCategory"
      pattern: "from '\\.\\./types/events'"
---

<objective>
Build the pure-function recommendation engine: a static mood→category/keyword/venue mapping table (MOOD-01), a deterministic tonight-first ranking function with past-event filtering and still-running-exhibition handling (MOOD-02), and per-recommendation "почему рекомендовано" reason generation (MOOD-03).

Purpose: This is the testable core of the phase's value proposition. It is pure (no I/O, no Fastify, no DOM) so it can be unit-tested to full branch coverage and consumed by the API route in plan 02-3.
Output: src/recommend/mood-map.ts, src/recommend/recommend.ts, and their test files. No route, no server changes.
</objective>

<phase_goal>
**As a** mobile user in Surgut, **I want to** tap a mood button and immediately see ranked, honest event cards with a "почему рекомендовано" reason, **so that** I can decide where to go tonight.

This plan delivers the engine slice: given a mood and the live event set, produce ranked recommendations with reasons. Plan 02-3 exposes it over HTTP; plan 02-4 renders it in the browser.
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
<!-- Domain types the engine consumes. From src/types/events.ts — use directly, no exploration. -->

export type EventCategory = 'concert' | 'club' | 'theater' | 'exhibition' | 'lecture' | 'sport' | 'standup' | 'other';
export type Mood = 'drink' | 'dance' | 'learn' | 'music';

export interface NormalizedEvent {
  id: string;
  title: string;
  startDate: Date;        // UTC; Surgut is UTC+5
  endDate?: Date;         // set for exhibitions with explicit end
  venue: string;
  priceText: string;      // "Цена не указана" sentinel when unknown
  isFree: boolean;
  sourceName: string;     // 'kassa-ugra' | 'afisha-surguta' | 'seed'
  sourceUrl: string;
  category: EventCategory;
  tags: string[];         // SPARSE — most events have []
  imageUrl?: string;
  isSeed: boolean;
}
</interfaces>

Project rules (AGENTS.md / CLAUDE.md): types on all public functions; small clean modules; rule-based only (NO ML); never read/print .env.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: MOOD_MAPPINGS table + structural tests (MOOD-01)</name>
  <read_first>
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (section "Domain: Mood Mapping (MOOD-01)" — the exact MOOD_MAPPINGS table and MoodMapping interface)
    - src/types/events.ts (Mood, EventCategory unions)
  </read_first>
  <files>src/recommend/mood-map.ts, src/recommend/mood-map.test.ts</files>
  <behavior>
    - MOOD_MAPPINGS has exactly one entry for each of the 4 Mood values (drink, dance, learn, music)
    - Each entry has non-empty categories[], titleKeywords[], venueKeywords[], a non-empty label, and a non-empty emoji
    - Every category listed is a valid EventCategory; all keyword/venue strings are lowercase
  </behavior>
  <action>
    Create src/recommend/mood-map.ts exporting the MoodMapping interface (fields: categories EventCategory[], titleKeywords string[], venueKeywords string[], label string, emoji string) and the MOOD_MAPPINGS constant typed as Record<Mood, MoodMapping>. Copy the four mood entries exactly from the 02-RESEARCH.md "MOOD_MAPPINGS Constant" table (drink/dance/learn/music with their categories, titleKeywords, venueKeywords, label, emoji). Import Mood and EventCategory as type-only imports from ../types/events. All keyword and venue strings must be lowercase to match the lowercased comparison done in recommend.ts.
    Create src/recommend/mood-map.test.ts with a describe block asserting: Object.keys(MOOD_MAPPINGS) equals the 4 mood ids; for each mapping categories.length > 0, titleKeywords.length > 0, venueKeywords.length > 0, label.length > 0, emoji.length > 0; every keyword equals its own toLowerCase().
  </action>
  <verify>
    <automated>npx vitest run src/recommend/mood-map.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/recommend/mood-map.test.ts passes
    - npx tsc --noEmit reports no errors for mood-map.ts
    - MOOD_MAPPINGS is typed Record<Mood, MoodMapping> (no `any`)
  </acceptance_criteria>
  <done>mood-map.ts exports MOOD_MAPPINGS for all 4 moods with full types; structural tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Ranking + matching + reason engine with tests (MOOD-02, MOOD-03)</name>
  <read_first>
    - .planning/phases/02-core-product-ui-mood-recommendations/02-RESEARCH.md (sections "Domain: Ranking (MOOD-02)", "Domain: Почему рекомендовано (MOOD-03)", and "Exhibitions with Range Dates" under Data Quality)
    - src/recommend/mood-map.ts (created in Task 1 — MoodMapping, MOOD_MAPPINGS)
    - src/types/events.ts (NormalizedEvent)
    - src/http/routes/events.ts (reference for the UTC+5 SURGUT_OFFSET_MS arithmetic pattern already used in the codebase)
  </read_first>
  <files>src/recommend/recommend.ts, src/recommend/recommend.test.ts</files>
  <behavior>
    - isEventMatchForMood: true when event.category ∈ mapping.categories OR any titleKeyword is a substring of event.title.toLowerCase() OR any venueKeyword is a substring of event.venue.toLowerCase()
    - getRecommendations excludes events whose effective date is in the past; a still-running exhibition (endDate > now) is treated as "today" and NOT excluded
    - For mood drink/dance a today-evening (local hour >= 17) event scores above a tomorrow event of the same mood; for learn/music nearest-first ordering holds
    - buildReasonText precedence: venue match → "Площадка подходит: <venue>"; else title-keyword match → up to 2 capitalized keywords joined with " · "; else CATEGORY_LABELS fallback
    - getRecommendations returns at most 50 items, each shaped { event, reason } sorted by score descending
  </behavior>
  <action>
    Create src/recommend/recommend.ts implementing the functions from the research: a module-level SURGUT_OFFSET_MS = 5*60*60*1000; a CATEGORY_LABELS Record<EventCategory,string> (Russian labels per research); exported isEventMatchForMood(event, mapping): boolean; exported buildReasonText(event, mapping): string; a private scoreEvent(event, mood, now): number using the effectiveDate rule (when startDate < now AND endDate exists AND endDate > now, use now as the effective date so still-running exhibitions count as today, else use startDate; if effectiveDate < now return -1), today-evening/today/tomorrow/future-decay buckets, eveningBoost of 10 only for drink|dance, and a 0–3 completeness bonus (imageUrl present, priceText !== 'Цена не указана', venue non-empty); and exported getRecommendations(mood, mapping, events, now): Array<{ event: NormalizedEvent; reason: string }> that filters by isEventMatchForMood AND score >= 0, sorts by score descending, slices to the top 50, and attaches buildReasonText to each. Type every public function signature. Import MOOD_MAPPINGS/MoodMapping from ./mood-map and NormalizedEvent/Mood/EventCategory type-only from ../types/events.
    Create src/recommend/recommend.test.ts with deterministic fixtures using fixed Date instances and an injected `now` (do NOT call new Date() inside assertions — pass now explicitly). Cover every branch: (a) past event excluded; (b) today-evening drink event scores higher than a tomorrow drink event; (c) learn/music nearest-first without evening boost; (d) category-only match qualifies an event; (e) title-keyword match qualifies an event with sparse tags; (f) venue match qualifies an event; (g) buildReasonText returns the venue branch, the keyword branch (capitalized, max 2, joined with " · "), and the category-label fallback; (h) still-running exhibition (startDate past, endDate future) appears in learn results; (i) empty candidate set returns []; (j) result length is capped at 50.
  </action>
  <verify>
    <automated>npx vitest run src/recommend/recommend.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - npx vitest run src/recommend/recommend.test.ts passes with all branches above asserted
    - npx tsc --noEmit reports no errors for recommend.ts
    - No call to new Date() without an argument inside getRecommendations/scoreEvent (now is a parameter) — grep -nE "new Date\(\s*\)" src/recommend/recommend.ts returns nothing
    - All 79 pre-existing tests still pass: npm run test
  </acceptance_criteria>
  <done>recommend.ts exports getRecommendations/isEventMatchForMood/buildReasonText with full ranking, past-event filtering, exhibition pinning, and reason precedence; every branch tested green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Pure functions; no untrusted input crosses a boundary here — callers (plan 02-3 route) validate input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | scoreEvent date math | mitigate | now is an injected parameter; deterministic tests pin behavior so silent ranking regressions are caught |
| T-02-02 | Information Disclosure | seed vs live in reason | accept | engine does not strip isSeed; field is carried through to the route untouched (honesty enforced downstream in 02-3/02-4) |
| T-02-SC | Tampering | package installs | n/a | Phase 2 adds ZERO npm packages (per 02-RESEARCH Package Legitimacy Audit); no install task exists |
</threat_model>

<verification>
- npx vitest run src/recommend/ passes
- npx tsc --noEmit clean
- npm run test keeps all pre-existing tests green (no regressions)
</verification>

<success_criteria>
getRecommendations produces ranked, reason-bearing, past-filtered recommendations for all 4 moods, validated by branch-complete unit tests; engine is pure and importable by the API route.
</success_criteria>

<output>
Create `.planning/phases/02-core-product-ui-mood-recommendations/02-1-SUMMARY.md` when done.
</output>
