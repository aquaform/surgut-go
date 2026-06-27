---
phase: 03-yellow-sources-text-search
plan: 3
subsystem: sources
tags: [disabled-stub, honesty-mandate, yandex-afisha, kassir-sur, tosRisk, fixture]
dependency_graph:
  requires: ["03-1"]
  provides: ["kassirSurAdapter (disabled stub, SRC-05)", "yandexAfishaAdapter (SRC-06)"]
  affects: ["03-4 (registry wiring uses kassirSurAdapter.enabled + yandexAfishaAdapter.enabled)"]
tech_stack:
  added: []
  patterns:
    - "disabled stub: enabled:false as const + reason + throw safety net (T-03-07)"
    - "tosRisk flag for operator-consent-required adapters (T-03-06)"
    - "403→blocked tagged rethrow: err.message.includes('403') → new Error('HTTP 403 — source blocked') (T-03-08)"
    - "carousel dedup by slug: seenSlugs Set + rawHref.split('?')[0] slug extraction"
    - "Format 4 date parsing via parseDateFull (DD месяца, HH:MM → hasTime:true)"
key_files:
  created:
    - src/sources/kassir-sur/index.ts
    - src/sources/kassir-sur/index.test.ts
    - src/sources/yandex-afisha/index.ts
    - src/sources/yandex-afisha/index.test.ts
    - src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html
  modified: []
decisions:
  - "kassir-sur is an honest disabled stub (not wired to an empty scraper): scrape() throws, reason string is machine-readable for status panel"
  - "Yandex fixture has 2 unique events (Пикник, КняZz) repeated 2–3× by carousel; dedup by slug is the correct approach"
  - "data-test-id anchor attributes (featured.slideTitle, ticketsPrice.price) used only in documentation — selectors use h3 and [data-test-id=ticketsPrice.price] to avoid hashed CSS classes (Pitfall 1)"
  - "vi.mock at top-level of test file (hoisted before tests) + vi.mocked().mockRejectedValueOnce() for 403 test — avoids the nested-mock vitest warning"
metrics:
  duration: "~30 minutes"
  completed_date: "2026-06-27"
  tasks_completed: 2
  files_changed: 5
---

# Phase 03 Plan 3: kassir-sur Disabled Stub + yandex-afisha Adapter Summary

**One-liner:** kassir-sur ships as an honest disabled stub (enabled:false + throw safety net); yandex-afisha is a cheerio/slim SSR adapter (disabled by default, tosRisk:true) with Format 4 date parsing and a 403→blocked tagged rethrow.

## What Was Built

### Task 1: kassir-sur honest disabled stub (commit 2b9f30e)

`src/sources/kassir-sur/index.ts` exports `kassirSurAdapter` typed `SourceAdapter & { enabled: false; reason: string }`:

- `enabled: false as const` — cannot be accidentally truthy-checked
- `reason: 'Требует браузера; источник полностью клиентский — отключён в MVP'` — machine-readable for `/api/sources/status` error field
- `scrape()` throws `'kassir-sur: adapter disabled — fully client-rendered source'` unconditionally (T-03-07 safety net)
- Top-of-file doc comment records all four live-probe URLs (2026-06-27) that each returned 0 static event cards
- No HTTP fetch code, no parsing code, no placeholder/invented data

`src/sources/kassir-sur/index.test.ts` — 7 tests verifying: `enabled===false`, `reason` non-empty, correct name/homeUrl/timeoutMs, `scrape()` rejects, throw message matches `/kassir-sur.*disabled/i`.

### Task 2: yandex-afisha adapter + fixture (commit fc0598f)

**Fixture** `src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html` (220 KB, live capture 2026-06-27):
- Contains 2 unique events (Пикник, КняZz) in the featured carousel, each repeated 2–3× by slick clones
- Date format confirmed: "15 сентября, 19:00" and "12 декабря, 19:00" (Format 4)

**Parser** `parseYandexAfisha(html)`:
- Selects `a[href*="/surgut/concert/"], a[href*="/surgut/performance/"]` — filters `#schedule` (ticket buttons) and deduplicates by slug
- Traverses to `.parent()` (card container) for `h3` title, `p` with venue+date text, `[data-test-id="ticketsPrice.price"]` span
- Date extraction: regex `/(\d{1,2}\s+[а-яёА-ЯЁ]+,\s+\d{2}:\d{2})/i` → `parseDateFull` → `hasTime:true`
- UTC conversion: "19:00 Surgut (UTC+5)" → "14:00 UTC" — verified in tests
- Min-results guard: `<2 events → ParseError: yandex-afisha returned <2 events...`

**Adapter** `yandexAfishaAdapter`:
- `enabled: false` — off by default (ToS §3.1 risk documented)
- `tosRisk: true` — Yandex can block without notice
- `scrape()`: isAllowed gate → fetchHtml → catch(403) rethrow `'HTTP 403 — source blocked'` → parseYandexAfisha

`src/sources/yandex-afisha/index.test.ts` — 17 tests: fixture parsing (≥2 events, isSeed:false, hasTime:true, UTC dates for Пикник/КняZz, dedup, ParseError), adapter config (enabled:false, tosRisk:true), 403 mock test.

## Verification

```
Test Files  16 passed (16)
     Tests  209 passed (209)
  Duration  437ms
```

All 185 pre-existing tests continue to pass. New: 24 tests (7 kassir-sur + 17 yandex-afisha).

`npx tsc --noEmit` — clean.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

**Fixture acceptance criterion footnote:** The plan's acceptance criterion `grep -cE 'href="[^"]*/surgut/(concert|performance)/' yandex-2026-06-27.html` returns `1` (not ≥2) because the 220 KB HTML is single-line (minified). Using `grep -o` to count individual occurrences yields 12 matches. The fixture contains 2 unique event slugs which produce ≥2 events in parseYandexAfisha — the functional criterion is met.

**vi.mock placement:** Initial 403 test used nested `vi.mock` inside `describe()`, producing a vitest hoisting warning. Moved mocks to top-level of test file (correct vitest pattern) — warning eliminated.

## Known Stubs

None — this plan intentionally ships kassir-sur as a documented disabled stub (the stub IS the correct implementation; 03-4 wiring will surface it as 'blocked' in status).

## Threat Flags

No new threat surface introduced. All threats from PLAN.md threat model were mitigated:
- T-03-06: tosRisk:true + enabled:false documented
- T-03-07: scrape() throws; honesty grep gate passes (0 occurrences of fabricat/fake/placeholder/mock event in kassir-sur/index.ts)
- T-03-08: 403→tagged rethrow implemented and test-verified

## Self-Check: PASSED

Files created:
- src/sources/kassir-sur/index.ts ✓
- src/sources/kassir-sur/index.test.ts ✓
- src/sources/yandex-afisha/index.ts ✓
- src/sources/yandex-afisha/index.test.ts ✓
- src/sources/yandex-afisha/__fixtures__/yandex-2026-06-27.html ✓

Commits:
- 2b9f30e (kassir-sur stub) ✓
- fc0598f (yandex-afisha adapter) ✓
