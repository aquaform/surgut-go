---
phase: 03-yellow-sources-text-search
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/utils/date.ts
  - src/utils/date.test.ts
  - src/types/events.ts
  - src/http/serialize.ts
autonomous: true
requirements: [UX-01, SRC-04, SRC-06]
must_haves:
  truths:
    - "parseRussianDate('7 октября в 19:00') returns a timed UTC Date (19:00 Surgut → 14:00 UTC), not a date-only midnight value"
    - "parseRussianDate('15 сентября, 19:00') returns 19:00 (not UTC midnight) — Format 4 wins over Format 2"
    - "parseDateFull returns hasTime:true for Formats 1/3/4 and hasTime:false for Format 2, relative labels, and ranges"
    - "parseRussianDate is behavior-preserving: all existing date.test.ts assertions still pass"
    - "NormalizedEvent and SerializedEvent both carry an optional hasTime; serializeEvent passes it through unchanged"
  artifacts:
    - path: "src/utils/date.ts"
      provides: "Format 3 + Format 4 branches and parseDateFull sibling; parseRussianDate delegates"
      contains: "parseDateFull"
    - path: "src/types/events.ts"
      provides: "optional hasTime field on NormalizedEvent"
      contains: "hasTime"
    - path: "src/http/serialize.ts"
      provides: "hasTime on SerializedEvent + passthrough in serializeEvent"
      contains: "hasTime"
  key_links:
    - from: "src/utils/date.ts parseRussianDate"
      to: "parseDateFull"
      via: "delegation (returns .date ?? null)"
      pattern: "parseDateFull"
    - from: "src/http/serialize.ts serializeEvent"
      to: "SerializedEvent.hasTime"
      via: "field passthrough e.hasTime"
      pattern: "hasTime:\\s*e\\.hasTime"
---

<objective>
Phase Goal (user story): As a Surgut resident, I want event times shown correctly (and the data model ready for new sources), so that date-only events stop showing a fake "05:00" and the next adapters can declare real start times.

This plan lays the shared date + model foundation that every other Phase-3 plan depends on. It adds two new Russian date formats (afisha.ru "DD месяца в HH:MM" and Yandex "DD месяца, HH:MM"), introduces a `parseDateFull()` sibling that reports whether the source string carried an explicit time, and threads an optional `hasTime` field through the domain model and serializer. This is the backend half of UX-01 and the date-parsing prerequisite for SRC-04 and SRC-06.

Purpose: One foundation touch of the shared, high-contention files (date.ts, events.ts, serialize.ts) so that the Wave-2 adapter and UI plans never collide on them.
Output: Extended date parser, `parseDateFull`, optional `hasTime` on the model and serialized output, new date tests. Zero behavior change for existing callers; all current tests stay green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-yellow-sources-text-search/03-RESEARCH.md

<interfaces>
From src/types/events.ts — NormalizedEvent currently ends with `isSeed: boolean;` (line 54). Add `hasTime?: boolean;` as a new optional field.
From src/http/serialize.ts — SerializedEvent currently ends with `isSeed: boolean;`; serializeEvent maps 17 fields and preserves isSeed.
From src/utils/date.ts — `parseRussianDate(text, refYear?)`; helpers `toUTC`, `inferYear`, `RU_MONTHS`; Format 1 regex `^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+(\d{2}):(\d{2})`, Format 2 regex `^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s*,?\s*(\d{4})?`. Range handling strips at ` - `.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add Format 3 + Format 4 and parseDateFull() to the date parser</name>
  <files>src/utils/date.ts, src/utils/date.test.ts</files>
  <read_first>
    - src/utils/date.ts (full file — existing Format 1/2 chain, toUTC, inferYear, RU_MONTHS, range split)
    - src/utils/date.test.ts (existing assertion style and refYear usage)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (sections "New Date Format Required: parseRussianDate Format 3", "Format 4", "parseDateFull Sibling", Pitfall 3)
  </read_first>
  <behavior>
    - parseRussianDate('7 октября в 19:00', 2026) → Date, getUTCHours()===14 (19−5), getUTCDate()===7
    - parseRussianDate('23 октября в 19:00', 2026) → 14:00 UTC, day 23
    - parseRussianDate('15 сентября, 19:00', 2026) → getUTCHours()===14, NOT UTC midnight (Format 4 beats Format 2)
    - parseRussianDate('12 декабря, 19:00', 2026) → 14:00 UTC, month index 11
    - parseDateFull('7 октября в 19:00', 2026) → { hasTime:true } and same date as parseRussianDate
    - parseDateFull('15 сентября, 19:00', 2026) → { hasTime:true }
    - parseDateFull('15 апреля 2026') → { hasTime:false } (Format 2 / date-only)
    - parseDateFull('6 сен 20:00 Вс', 2026) → { hasTime:true } (Format 1)
    - parseDateFull('сегодня') → { hasTime:false }; parseDateFull('garbage') → null
    - Every existing date.test.ts case still passes unchanged (delegation is behavior-preserving)
  </behavior>
  <action>
    Refactor the matching logic into a new exported `parseDateFull(text: string, refYear?: number): { date: Date; hasTime: boolean } | null`. Move the existing Format 1, Format 2, range-strip, and relative-label logic into it. Insert Format 3 (`^(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+в\s+(\d{2}):(\d{2})`, "в" separator) and Format 4 (`^(\d{1,2})\s+([а-яёА-ЯЁ]+),\s+(\d{2}):(\d{2})\b`, comma+time) BOTH BEFORE the Format 2 branch — this ordering is mandatory (Pitfall 3: Format 2's optional-year regex would otherwise swallow the date and drop the time). Format 1/3/4 return hasTime:true via toUTC; Format 2, relative labels, and range starts return hasTime:false. Export an interface `ParsedDate { date: Date; hasTime: boolean }`. Rewrite `parseRussianDate` to `return parseDateFull(text, refYear)?.date ?? null;` so its signature and every existing caller are unchanged. Keep the never-throws contract (wrap in the existing try/catch). Add the Format 3/4 and parseDateFull test cases listed in the behavior block to date.test.ts.
  </action>
  <acceptance_criteria>
    - `npx vitest run src/utils/date.test.ts` passes, including the new Format 3, Format 4, and parseDateFull cases
    - `grep -n "parseDateFull" src/utils/date.ts` shows the exported function and parseRussianDate delegating to it
    - Format 3 and Format 4 branches appear textually BEFORE the Format 2 branch in the function body
    - `npx tsc --noEmit` is clean
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/utils/date.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>parseDateFull exists, exported, returns {date,hasTime}; Format 3/4 added before Format 2; parseRussianDate delegates with no behavior change; new + existing date tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Thread optional hasTime through model and serializer</name>
  <files>src/types/events.ts, src/http/serialize.ts</files>
  <read_first>
    - src/types/events.ts (NormalizedEvent interface, ends at isSeed line 54)
    - src/http/serialize.ts (SerializedEvent interface + serializeEvent 17-field map)
    - .planning/phases/03-yellow-sources-text-search/03-RESEARCH.md (section "Tier 2 — Explicit hasTime model field")
  </read_first>
  <action>
    Add `hasTime?: boolean;` to `NormalizedEvent` (optional — absent means "unknown", preserving backward compatibility for all existing adapters and cached data). Add `hasTime: boolean | undefined;` to `SerializedEvent` and add `hasTime: e.hasTime,` to the object returned by `serializeEvent`. Document on the model field that false means the source gave a date only (startDate stored at UTC midnight) and absent means the UI falls back to UTC-midnight inference. Do NOT modify the seed adapter, kassa-ugra, or afisha-surguta adapters — existing date-only events remain correct via the UI inference landed in plan 03-5; explicit hasTime is set only by the new Phase-3 adapters.
  </action>
  <acceptance_criteria>
    - `grep -n "hasTime" src/types/events.ts src/http/serialize.ts` shows the field on both interfaces and in the serializeEvent map
    - `npx vitest run` passes the full suite with no regressions (hasTime is optional → existing toMatchObject assertions unaffected)
    - `npx tsc --noEmit` is clean
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run</automated>
  </verify>
  <done>hasTime is optional on NormalizedEvent, present on SerializedEvent, passed through serializeEvent; full existing test suite stays green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| scraped HTML → date parser | Untrusted source strings reach parseRussianDate/parseDateFull |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Denial of Service | parseDateFull regexes | mitigate | Anchored, linear regexes (`^…`) with no nested quantifiers — no catastrophic backtracking on adversarial date strings |
| T-03-02 | Tampering | parser returning wrong Date silently | mitigate | never-throws contract returns null on unrecognized input; new test cases pin Format 3/4 outputs |
| T-03-SC | Tampering | npm/pip/cargo installs | accept | Zero new packages installed in this phase (RESEARCH Package Legitimacy Audit) — supply-chain gate N/A |
</threat_model>

<verification>
- `npx vitest run` — full suite green (≥162 existing + new date cases)
- `npx tsc --noEmit` — no type errors
- `npm run build` — esbuild bundle still produces server.js
</verification>

<success_criteria>
parseDateFull exported and returning {date,hasTime}; Format 3/4 parse afisha.ru and Yandex timed strings correctly and before Format 2; hasTime optional on the model and serialized; no behavior change for existing callers; all existing tests pass.
</success_criteria>

<output>
Create `.planning/phases/03-yellow-sources-text-search/03-1-SUMMARY.md` when done.
</output>
