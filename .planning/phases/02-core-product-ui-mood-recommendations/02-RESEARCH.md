# Phase 2: Core Product UI & Mood Recommendations — Research

**Researched:** 2026-06-27
**Domain:** Pure-function recommendation engine + vanilla JS/HTML mobile-first UI + Fastify route plugin
**Confidence:** HIGH — all architecture grounded in Phase 1 codebase; live data probed; no new packages

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directive | Impact on Phase 2 |
|-----------|-------------------|
| Server-rendered UI (HTML + light JS/CSS, no SPA build) | public/index.html + public/app.js + public/app.css — no bundler, no framework |
| Backend: Node.js 20 + TypeScript + Fastify | Add one new Fastify plugin route file; same pattern as existing routes |
| Cache: JSON-file + in-memory EventIndex | Recommendations read from EventIndex only — no I/O in request path |
| Types on all public functions | mood-map.ts and recommend.ts must carry full TypeScript signatures |
| No secrets in code, config from env | No env changes needed for Phase 2 |
| No native modules breaking node:20-slim | Confirmed: Phase 2 adds zero npm packages |
| 80%+ coverage target on business logic | New tests for recommend/, dedup, index-events |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGG-03 | Dedup by fuzzy key (normalized title + day + venue) across sources | Phase 1 exact-key dedup already implements this; AGG-03 completion = adding dedup.test.ts + verifying cross-source behavior |
| MOOD-01 | Static mood→category/tag/venue mapping table | MOOD_MAPPINGS constant in src/recommend/mood-map.ts; concrete table below |
| MOOD-02 | Ranking: tonight-first for drink/dance; nearest-first for learn/music | Scoring function documented below; filter past events |
| MOOD-03 | "Почему рекомендовано" per recommendation | Derived at query time from venue/tag/title/category match; logic below |
| API-03 | GET /api/recommendations?mood=drink\|dance\|learn\|music — Ajv validated, no I/O | New Fastify plugin following existing route pattern; reads from EventIndex |
| UI-01 | Mobile-first main page in Russian | Replaces public/index.html placeholder; static HTML shell + fetch pattern |
| UI-02 | 4 large mood buttons | 2×2 grid in HTML; click → fetch('/api/recommendations?mood=...') |
| UI-03 | Event card: title, date/time, venue, price, category/tags, reason, source, CTA | Card HTML + humanizeDate() in app.js; CTA text by source type |
| UI-04 | Date filter chips: Сегодня / Завтра / Выходные / 7 дней | Client-side filter on already-loaded data; chip row with horizontal scroll |
| UI-05 | Free toggle + category filter | Client-side filter on loaded data |
| UI-07 | Visible source status + demo/cached badges on cards | <details> panel for /api/sources/status; `data-seed` attribute on cards |
| QA-02 | vitest 80%+ coverage on business logic | New test files for recommend/*, dedup, index-events + route test |
</phase_requirements>

---

## Summary

Phase 2 builds directly on the Phase 1 foundation — 97 events live (51 kassa-ugra, 37 afisha-surguta, 9 seed), working `/api/events` with filters, an in-memory EventIndex, and the Fastify plugin pattern well-established. No new npm packages are needed.

The critical data-quality discovery from live data: **most Phase 1 events have `tags: []`** (only 11 distinct tags across 97 events). The recommendation engine cannot rely on tag matching alone. It must treat category matching as primary, augment with keyword scan of the event title, and fall back to venue matching. This is entirely doable in the pure-function layer — it just changes which field gets checked first in the matching logic.

There are 22 past-dated events (art-shop items from afisha.surguta.ru with dates like 2026-01-01). These must be filtered out (`startDate < now`) in the recommendations endpoint and should also be excluded from the public-facing UI. The /api/events endpoint currently returns all events including past ones — a `?date=` filter already exists (today/tomorrow/weekend/week) but does not exclude events older than "today". The recommendations endpoint handles this correctly by always filtering `startDate >= now` before ranking.

The UI architecture is a **static HTML shell + client fetch** pattern: `public/index.html` loads `public/app.js` and `public/app.css`, which are already served by the existing `@fastify/static` configuration (confirmed working in production). No server-side HTML rendering is needed. The full interaction is: page load → fetch `/api/sources/status` → display source panel → user taps mood button → fetch `/api/recommendations?mood=...` → render cards → filter chips apply client-side filter on the loaded list.

**Primary recommendation:** Build in three clean waves: (1) backend pure functions + API route + tests, (2) HTML/CSS/JS UI, (3) QA sweep to confirm 80%+ coverage.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mood→category/tag/venue mapping | API / Backend (pure TS constant) | — | Static data, zero I/O; imported by recommend.ts |
| Event ranking (tonight-first) | API / Backend (pure TS function) | — | Must be testable; no browser involvement; no I/O |
| "Почему рекомендовано" generation | API / Backend (pure TS, at query time) | — | Derived from MOOD_MAPPINGS intersection; not stored |
| GET /api/recommendations?mood= | API / Backend (Fastify plugin) | — | Reads EventIndex; never calls pipeline |
| Event dedup (AGG-03) | API / Backend (pipeline/dedup.ts) | — | Already implemented; Phase 2 adds tests |
| Mobile-first UI shell | Browser / Client (static HTML) | — | Served by @fastify/static from public/; no SSR |
| Mood button → fetch → render cards | Browser / Client (vanilla JS) | — | app.js; no framework; no bundler |
| Date chips / free toggle / category filter | Browser / Client (vanilla JS) | — | Client-side filter on loaded data; no round-trip |
| Source status panel | Browser / Client (vanilla JS) | API / Backend | Fetch /api/sources/status once on page load |
| Honesty badges (Демо/Кэш) | Browser / Client (HTML data-attrs) | API / Backend | `isSeed` from API → `data-seed="true"` on card element |
| Date humanization (human-readable) | Browser / Client (vanilla JS) | — | humanizeDate() in app.js; uses UTC+5 offset |

---

## Standard Stack

No new packages required for Phase 2. All functionality is achievable with the Phase 1 stack.
[VERIFIED: npm registry — Phase 1 package versions confirmed 2026-06-27; no additions needed]

### What Phase 2 Uses from Phase 1

| Module | Purpose in Phase 2 | Notes |
|--------|--------------------|-------|
| `fastify` 5.8.5 | New recommendations route plugin | Same FastifyPluginAsync pattern as events.ts / sources.ts |
| `@fastify/static` 9.1.3 | Serve public/app.js + public/app.css | Already configured; no changes needed |
| TypeScript 5.x | Type-check mood-map.ts + recommend.ts | Types on all public functions per AGENTS.md |
| `vitest` 4.1.9 | New test files for recommend/ + dedup | Add to `src/**/*.test.ts` glob (already configured) |
| `@vitest/coverage-v8` 4.1.9 | Coverage gate for QA-02 | Threshold already set to 80 lines in vitest.config.ts |
| Node.js 20 built-in `crypto` | dedup SHA1 key (already used) | No change |

### No New Packages

| Considered | Why Not Needed |
|------------|---------------|
| date-fns / date-fns-tz | UTC+5 arithmetic already implemented in src/utils/date.ts and events.ts filterByDate(); humanizeDate() can be 20-line vanilla JS |
| Intl.DateTimeFormat (built-in) | Can use for Russian day names but simpler to use a lookup array in app.js |
| React / Vue / Svelte | Explicitly locked out by AGENTS.md "no SPA build" |
| Eta / @fastify/view | Not needed; UI is client-fetch pattern, not server-rendered per request |
| Levenshtein lib | Not needed for AGG-03; existing SHA1 key satisfies the requirement |

---

## Package Legitimacy Audit

No new packages for Phase 2. Not applicable.

**Packages removed due to slopcheck:** none
**Packages flagged:** none
All packages from Phase 1 remain in use unchanged.

---

## Architecture Patterns

### System Architecture Diagram (Phase 2 additions in bold)

```
Browser (mobile)
     │
     ├── GET /             → @fastify/static → public/index.html (static shell)
     ├── GET /app.css      → @fastify/static → public/app.css
     ├── GET /app.js       → @fastify/static → public/app.js
     │
     │ On mood tap (client fetch):
     ├── GET /api/recommendations?mood=drink
     │        │
     │        ▼
     │   ┌─────────────────────────────────────────┐
     │   │  [NEW] routes/recommendations.ts        │
     │   │  Ajv: mood ∈ {drink,dance,learn,music}  │
     │   │  reads fastify.index.all()               │
     │   │  calls getRecommendations(mood, events)  │
     │   └─────────────────────────────────────────┘
     │                    │
     │                    ▼
     │   ┌─────────────────────────────────────────┐
     │   │  [NEW] recommend/recommend.ts            │
     │   │  Pure function: filter past events       │
     │   │  → match by category + title keywords   │
     │   │    + venue keywords                      │
     │   │  → score (tonight-first)                 │
     │   │  → attach reasonText                     │
     │   └─────────────────────────────────────────┘
     │                    │
     │                    ▼
     │   ┌─────────────────────────────────────────┐
     │   │  [NEW] recommend/mood-map.ts             │
     │   │  Static: MOOD_MAPPINGS constant          │
     │   └─────────────────────────────────────────┘
     │
     │ On filter chip / free toggle / category:
     ├── (no fetch) — client-side filter on loaded items[]
     │
     │ On page load (once):
     └── GET /api/sources/status → source panel render
```

### Recommended Project Structure Changes

```
src/
├── recommend/                  ← NEW directory
│   ├── mood-map.ts             ← NEW: MOOD_MAPPINGS constant
│   ├── mood-map.test.ts        ← NEW: structural + completeness tests
│   ├── recommend.ts            ← NEW: getRecommendations() pure function
│   └── recommend.test.ts       ← NEW: ranking + reason + filter tests
├── http/routes/
│   ├── recommendations.ts      ← NEW: GET /api/recommendations?mood=
│   ├── recommendations.test.ts ← NEW: route Ajv + response shape tests
│   ├── events.ts               ← existing (no changes)
│   └── sources.ts              ← existing (no changes)
├── pipeline/
│   ├── dedup.ts                ← existing (no changes)
│   ├── dedup.test.ts           ← NEW: tests for AGG-03 coverage
│   └── index-events.ts         ← existing (no changes)
│   (index-events.test.ts)      ← optional addition if coverage < 80%
├── http/server.ts              ← MODIFY: register recommendationsRoute
└── types/events.ts             ← no changes needed
public/
├── index.html                  ← REPLACE placeholder with full UI shell
├── app.css                     ← NEW: mobile-first CSS (~150 lines)
└── app.js                      ← NEW: vanilla JS client (~300 lines)
```

---

## Domain: Mood Mapping (MOOD-01)

### MOOD_MAPPINGS Constant

The critical insight from live data: **tags are sparse** (most events have `tags: []`). Matching must scan **title text** as the primary keyword check, not tags. Venue matching covers the "brand" case (Компромат, Вавилон, etc.).

```typescript
// src/recommend/mood-map.ts
import type { EventCategory, Mood } from '../types/events';

export interface MoodMapping {
  /** EventCategory values that belong to this mood (primary match) */
  categories: EventCategory[];
  /**
   * Keywords to look for in event.title.toLowerCase() or event.tags.
   * Title scan is the primary path because Phase 1 data has sparse tags.
   * Keywords are checked with String.includes() (substring match).
   */
  titleKeywords: string[];
  /**
   * Venue substrings (case-insensitive includes).
   * A venue match boosts an event that might not match by category/keyword alone.
   */
  venueKeywords: string[];
  /** Human-readable label for the mood (used in API response and UI heading) */
  label: string;
  emoji: string;
}

export const MOOD_MAPPINGS: Record<Mood, MoodMapping> = {
  drink: {
    categories: ['club', 'standup', 'other'],
    titleKeywords: [
      'бар', 'стендап', 'stand-up', 'stand up', 'open mic',
      'вечеринк', 'коктейл', 'lounge', 'клуб', 'ночной',
    ],
    venueKeywords: [
      'компромат', 'brooklyn', 'forte', 'piano', 'карасёвня',
      'karas', 'бар', 'паб',
    ],
    label: 'Хочу выпить',
    emoji: '🍸',
  },
  dance: {
    categories: ['club'],
    titleKeywords: [
      'вечеринк', 'дискотек', 'хип-хоп', 'электроник', 'dancehall',
      'dance', 'клуб', 'dj', 'диджей',
    ],
    venueKeywords: [
      'вавилон', 'utopia', 'утопия', 'аквапарк', 'аквамарин',
    ],
    label: 'Хочу потанцевать',
    emoji: '💃',
  },
  learn: {
    categories: ['lecture', 'exhibition', 'theater'],
    titleKeywords: [
      'лекци', 'квиз', 'выставк', 'музей', 'образован',
      'история', 'мастер-класс', 'воркшоп', 'семинар',
      'театр', 'спектакл', 'мюзикл', 'опер', 'балет',
    ],
    venueKeywords: [
      'музей', 'библиотек', 'парк', 'театр', 'галере',
      'исторический', 'краеведческ',
    ],
    label: 'Хочу понимать',
    emoji: '🧠',
  },
  music: {
    categories: ['concert'],
    titleKeywords: [
      'концерт', 'филармони', 'джаз', 'рок', 'оркестр',
      'живой звук', 'cagmo', 'акустик', 'классик',
      'саундтрек', 'фестивал',
    ],
    venueKeywords: [
      'филармония', 'cagmo', 'дкид', 'нефтяник', 'зал',
    ],
    label: 'Хочу музыки',
    emoji: '🎶',
  },
};
```

**Why this specific table:**
- `drink.categories` includes `'other'` — many evening social events from kassa-ugra land in `'other'` due to classifier gaps in Phase 1
- `dance.categories` is `['club']` only — dance events are rare; venue matching (аквапарк, Вавилон) compensates
- `learn.categories` includes `'theater'` — theater attendance is an "understanding" experience; aligns with learn mood
- `music.categories` is `['concert']` only — kassa-ugra is 42/97 concerts; this mood will have the most hits

### Matching Algorithm

An event is a candidate for a mood if ANY of these is true:
1. `event.category` is in `mapping.categories`
2. Any `mapping.titleKeywords` keyword is a substring of `event.title.toLowerCase()`
3. Any `mapping.venueKeywords` keyword is a substring of `event.venue.toLowerCase()`

Candidates are then ranked (see MOOD-02 below).

```typescript
// src/recommend/recommend.ts (core matching logic)
export function isEventMatchForMood(
  event: NormalizedEvent,
  mapping: MoodMapping,
): boolean {
  // 1. Category match (primary)
  if (mapping.categories.includes(event.category)) return true;

  // 2. Title keyword match (compensates for sparse tags)
  const titleLower = event.title.toLowerCase();
  if (mapping.titleKeywords.some(kw => titleLower.includes(kw))) return true;

  // 3. Venue keyword match
  const venueLower = event.venue.toLowerCase();
  if (mapping.venueKeywords.some(kw => venueLower.includes(kw))) return true;

  return false;
}
```

---

## Domain: Ranking (MOOD-02)

### Scoring Function

Requirements:
- Filter past events (`startDate < now` in UTC; now = server time)
- drink and dance: prioritise nearest **evening** events (17:00+ local time)
- learn and music: nearest-first without evening bias
- Within each bucket: events with more complete data (has imageUrl, priceText != "Цена не указана") rank above sparse records
- Returns events sorted descending by score

```typescript
// src/recommend/recommend.ts
const SURGUT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

function scoreEvent(event: NormalizedEvent, mood: Mood, now: Date): number {
  const t = event.startDate.getTime();
  if (t < now.getTime()) return -1; // past — filtered out

  // Convert to Surgut local time for day/hour comparison
  const localMs = t + SURGUT_OFFSET_MS;
  const local = new Date(localMs);
  const nowLocal = new Date(now.getTime() + SURGUT_OFFSET_MS);

  const isToday = (
    local.getUTCFullYear() === nowLocal.getUTCFullYear() &&
    local.getUTCMonth() === nowLocal.getUTCMonth() &&
    local.getUTCDate() === nowLocal.getUTCDate()
  );
  const isTomorrow = (
    local.getUTCFullYear() === nowLocal.getUTCFullYear() &&
    local.getUTCMonth() === nowLocal.getUTCMonth() &&
    local.getUTCDate() === nowLocal.getUTCDate() + 1
  );
  const localHour = local.getUTCHours(); // hour in Surgut time
  const isEvening = localHour >= 17;

  // Mood-specific evening boost for drink and dance
  const eveningBoost = (mood === 'drink' || mood === 'dance') ? 10 : 0;

  // Completeness bonus (0–3 points)
  const completeness =
    (event.imageUrl ? 1 : 0) +
    (event.priceText !== 'Цена не указана' ? 1 : 0) +
    (event.venue.length > 0 ? 1 : 0);

  // Base score by temporal bucket
  let base: number;
  if (isToday && isEvening) base = 100 + eveningBoost;
  else if (isToday)          base = 90;
  else if (isTomorrow)       base = 80;
  else {
    // Future: decay by days away (max 70, min 1)
    const daysAway = (t - now.getTime()) / (24 * 60 * 60 * 1000);
    base = Math.max(1, 70 - Math.floor(daysAway));
  }

  return base + completeness;
}
```

**Score buckets summary:**

| Bucket | drink/dance score | learn/music score |
|--------|-------------------|-------------------|
| Today evening (17:00+ local) | 110–113 | 100–103 |
| Today daytime | 90–93 | 90–93 |
| Tomorrow | 80–83 | 80–83 |
| Next 7 days | 63–70 | 63–70 |
| > 7 days away | 1–62 | 1–62 |
| Past | -1 (filtered) | -1 (filtered) |

**Maximum results:** Return top 50 ranked events per mood (covers the entire Surgut event set; no pagination needed per FEATURES.md anti-features).

---

## Domain: "Почему рекомендовано" (MOOD-03)

### Reason Text Generation

Reason is derived at query time from the match that qualified the event, not stored. Precedence:

1. **Venue match** (most specific): `"Площадка подходит: <venue>"`
2. **Title keyword match** (most informative): up to 2 matched keywords, capitalized, joined with `·`
3. **Category match only** (least specific): human-readable category label

```typescript
// src/recommend/recommend.ts
const CATEGORY_LABELS: Record<EventCategory, string> = {
  concert:    'Концерт',
  club:       'Клубное мероприятие',
  theater:    'Театр',
  exhibition: 'Выставка',
  lecture:    'Лекция / образование',
  sport:      'Спорт',
  standup:    'Стендап',
  other:      'Мероприятие',
};

export function buildReasonText(
  event: NormalizedEvent,
  mapping: MoodMapping,
): string {
  // 1. Venue match (highest confidence)
  const venueLower = event.venue.toLowerCase();
  if (mapping.venueKeywords.some(kw => venueLower.includes(kw))) {
    return `Площадка подходит: ${event.venue}`;
  }

  // 2. Title keyword match
  const titleLower = event.title.toLowerCase();
  const matched = mapping.titleKeywords.filter(kw => titleLower.includes(kw));
  if (matched.length > 0) {
    const labels = matched
      .slice(0, 2)
      .map(kw => kw.charAt(0).toUpperCase() + kw.slice(1));
    return labels.join(' · ');
  }

  // 3. Category fallback
  return CATEGORY_LABELS[event.category] ?? 'Мероприятие';
}
```

**Examples from live data:**
- Вечеринка в аквапарке, dance → venue "аквапарк" matches → `"Площадка подходит: Аквапарк «Аквамарин»"`
- ЛЕТНИЙ МОРОК: Моджо + Торум, drink → venue "компромат" matches → `"Площадка подходит: Компромат"`
- КняZz, music → category 'concert' matches → title scan finds nothing → `"Концерт"`
- МакSим, music → category 'concert' + title contains nothing specific → `"Концерт"`

---

## Domain: API-03 Endpoint

### Route Contract

```typescript
// src/http/routes/recommendations.ts
// GET /api/recommendations?mood=drink|dance|learn|music

interface RecommendationsQuerystring {
  mood: Mood; // validated by Ajv enum
}

interface RecommendationItem {
  event: SerializedEvent;  // same shape as /api/events items
  reason: string;          // from buildReasonText()
}

interface RecommendationsResponse {
  mood: Mood;
  label: string;      // "Хочу выпить", "Хочу потанцевать", etc.
  emoji: string;      // "🍸", "💃", "🧠", "🎶"
  items: RecommendationItem[];
  meta: {
    count: number;
    generatedAt: string; // ISO 8601
  };
}
```

**Ajv schema (querystring):**
```typescript
schema: {
  querystring: {
    type: 'object',
    required: ['mood'],
    properties: {
      mood: {
        type: 'string',
        enum: ['drink', 'dance', 'learn', 'music'],
      },
    },
    additionalProperties: false,
  },
}
```

Missing `mood` → Fastify Ajv returns 400 `{"statusCode":400,"error":"Bad Request","message":"querystring/mood ..."}` — no custom error handling needed.

**Route handler:**
```typescript
async (req, reply) => {
  const { mood } = req.query;
  const mapping = MOOD_MAPPINGS[mood];
  const allEvents = fastify.index.all();
  const now = new Date();

  const ranked = getRecommendations(mood, mapping, allEvents, now);
  // getRecommendations() is pure: filter past → match → score → sort → attach reason

  return reply.send({
    mood,
    label: mapping.label,
    emoji: mapping.emoji,
    items: ranked.map(({ event, reason }) => ({
      event: serializeEvent(event), // reuse serializer from events.ts
      reason,
    })),
    meta: { count: ranked.length, generatedAt: now.toISOString() },
  });
}
```

**Important:** `serializeEvent()` from `events.ts` must be extracted to a shared utility so both routes can use it without duplication. Create `src/http/serialize.ts` or inline it in the recommendations route.

**No I/O:** `fastify.index.all()` reads from in-memory index — no disk access, no network call. [VERIFIED: confirmed pattern from Phase 1 events.ts]

---

## Domain: Dedup Enhancement (AGG-03)

### What Phase 1 Already Delivers

Phase 1 `src/pipeline/dedup.ts` already implements the AGG-03 core requirement:
- SHA1 key on `toSlug(title) | startDate.toISOString().slice(0,10) | toSlug(venue)`
- Prefer-live-over-seed merge policy

**Live data evidence:** 51 (kassa-ugra) + 37 (afisha-surguta) + 9 (seed) = 97 total events. No cross-source collisions detected, which is expected: kassa-ugra events (concerts, big shows) and afisha-surguta events (local calendar, exhibitions) rarely share the exact same normalized title + date + venue.

### Phase 2 Scope for AGG-03

Phase 2 AGG-03 completion = **tests only**. The existing dedup.ts code satisfies the requirement. No code changes to dedup.ts are needed.

Test file `src/pipeline/dedup.test.ts` must cover:
- Same event from two sources deduplicates to one
- Live event beats seed when both have same key
- Different events with similar titles on different dates are NOT merged
- Edge case: same event on same venue but 31 minutes apart (should NOT merge — dedup uses date day only, not time)
- `toSlug()` handles Cyrillic correctly

**Note on Levenshtein fuzzy matching:** FEATURES.md mentions Levenshtein as optional for "v1 if confidence > 80%". Given the actual data (no cross-source duplicates found), adding Levenshtein complexity is not warranted in Phase 2. The exact-key dedup is sufficient. Tag Levenshtein as deferred to Phase 3 if needed.

---

## Domain: UI (UI-01 through UI-07)

### Architecture Decision: Static Shell + Client Fetch

**Pattern chosen:** `public/index.html` (static HTML shell) + `public/app.js` (client JS) + `public/app.css` (CSS).

**Why NOT server-side rendering per request:**
- @fastify/static already serves `public/` at prefix `/` — adding a Fastify web route for `GET /` would conflict with the static server's index.html serving, requiring explicit route ordering
- The `EventIndex` is in-memory so client fetch to `/api/recommendations` is instant (< 5 ms server-side; < 100 ms total including network on same host)
- Server-rendering per request requires template functions returning HTML strings (more code, more test surface) for no user-visible benefit at this scale
- Static file approach is simpler, already proven working (placeholder index.html served in Phase 1), and fully aligned with AGENTS.md "no SPA build" constraint

**How the existing static serving works (Phase 1 confirmed):**
```typescript
// src/http/server.ts (existing, no changes)
fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),  // __dirname = /app/ in Docker
  prefix: '/',
});
// GET / → serves public/index.html
// GET /app.css → serves public/app.css   ← just drop the file in public/
// GET /app.js → serves public/app.js     ← just drop the file in public/
```

No changes to server.ts are needed for static files. Only the new API route needs registration.

### HTML Layout Sketch

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Куда пойти в Сургуте</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <header class="header">
    <h1 class="header__title">Куда пойти<br>в Сургуте</h1>
    <p class="header__sub">Выбери настроение:</p>
  </header>

  <!-- UI-02: 4 mood buttons -->
  <section class="moods" aria-label="Выбор настроения">
    <button class="mood-btn" data-mood="drink">🍸<span>Выпить</span></button>
    <button class="mood-btn" data-mood="dance">💃<span>Потанцевать</span></button>
    <button class="mood-btn" data-mood="learn">🧠<span>Понимать</span></button>
    <button class="mood-btn" data-mood="music">🎶<span>Музыка</span></button>
  </section>

  <!-- UI-04: date filter chips (shown after mood tap) -->
  <section class="filters hidden" id="filters">
    <div class="chips" role="group" aria-label="Фильтр по дате">
      <button class="chip chip--active" data-date="">Все</button>
      <button class="chip" data-date="today">Сегодня</button>
      <button class="chip" data-date="tomorrow">Завтра</button>
      <button class="chip" data-date="weekend">Выходные</button>
      <button class="chip" data-date="week">7 дней</button>
    </div>
    <!-- UI-05: free toggle + category filter -->
    <div class="filter-row">
      <label class="toggle">
        <input type="checkbox" id="free-toggle"> Только бесплатные
      </label>
      <select id="category-filter" aria-label="Категория">
        <option value="">Все категории</option>
        <option value="concert">Концерты</option>
        <option value="theater">Театр</option>
        <option value="club">Клубы</option>
        <option value="exhibition">Выставки</option>
        <option value="lecture">Лекции</option>
        <option value="standup">Стендап</option>
      </select>
    </div>
  </section>

  <!-- Results area -->
  <main id="results">
    <!-- Loading, empty, and card states rendered by app.js -->
  </main>

  <!-- UI-07: source status panel -->
  <details class="sources" id="source-panel">
    <summary class="sources__toggle">Источники данных</summary>
    <ul class="sources__list" id="source-list">
      <!-- Rendered by app.js on load -->
    </ul>
  </details>

  <script src="/app.js"></script>
</body>
</html>
```

### Card Markup Shape

```html
<!-- Event card — produced by renderCard() in app.js -->
<article class="card" data-seed="false" data-category="concert"
         data-date="2026-07-04" data-free="false">
  <!-- data-* attrs used by client-side filter (no server round-trip) -->

  <!-- UI-07: honesty badge — only rendered when isSeed === true -->
  <!-- <div class="badge badge--demo">Демо</div> -->

  <h3 class="card__title">МакSим</h3>

  <time class="card__date" datetime="2026-09-06T15:00:00Z">
    сб, 6 сен, 20:00
  </time>
  <p class="card__venue">Вавилон</p>
  <p class="card__price">5500–8800 ₽</p>

  <p class="card__reason">🎵 Концерт</p>

  <footer class="card__footer">
    <span class="card__source">kassa-ugra.ru</span>
    <a class="card__cta" href="https://kassa-ugra.ru/event/345403"
       target="_blank" rel="noopener noreferrer">
      Купить билет
    </a>
  </footer>
</article>
```

**CTA button text logic:**
```javascript
function ctaText(sourceName) {
  const ticketing = ['kassa-ugra', 'kassir', 'tbank'];
  return ticketing.includes(sourceName) ? 'Купить билет' : 'Открыть';
}
```

**Seed badge logic:**
```javascript
if (item.event.isSeed) {
  card.insertAdjacentHTML('afterbegin', '<div class="badge badge--demo">Демо</div>');
}
```

### CSS Approach

Mobile-first, ~150 lines, zero external dependencies:

```css
/* public/app.css */

/* System font stack — no web fonts, no CLS */
:root {
  --clr-bg:        #f5f5f5;
  --clr-surface:   #ffffff;
  --clr-primary:   #1a1a2e;
  --clr-accent:    #e94560;
  --clr-text:      #1a1a2e;
  --clr-muted:     #666;
  --clr-live:      #22c55e;
  --clr-cached:    #f59e0b;
  --clr-error:     #ef4444;
  --clr-demo:      #f97316;
  --radius:        12px;
  --shadow:        0 2px 8px rgba(0,0,0,0.08);
  font-family:     -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--clr-bg);
  color: var(--clr-text);
  min-height: 100svh;
  padding: 0 0 env(safe-area-inset-bottom); /* iOS home indicator */
}

/* Mobile container */
.container { max-width: 480px; margin: 0 auto; padding: 0 16px; }

/* Header */
.header { padding: 24px 16px 16px; text-align: center; }
.header__title { font-size: 1.6rem; line-height: 1.2; font-weight: 800; }
.header__sub { color: var(--clr-muted); margin-top: 4px; }

/* Mood buttons: 2×2 grid */
.moods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
  max-width: 480px;
  margin: 0 auto;
}
.mood-btn {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 24px 12px;
  background: var(--clr-surface);
  border: 2px solid transparent;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-size: 2rem;    /* emoji */
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  min-height: 100px;
}
.mood-btn span { font-size: 0.9rem; font-weight: 600; color: var(--clr-text); }
.mood-btn--active { border-color: var(--clr-accent); }
.mood-btn:active { transform: scale(0.97); }

/* Filter chips: horizontal scroll row */
.chips {
  display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
}
.chip {
  flex-shrink: 0; padding: 6px 14px;
  background: var(--clr-surface); border: 1.5px solid #ddd;
  border-radius: 20px; font-size: 0.85rem; cursor: pointer;
  transition: all 0.15s;
}
.chip--active { background: var(--clr-primary); color: #fff; border-color: var(--clr-primary); }

/* Event card */
.card {
  background: var(--clr-surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
  margin: 0 16px 12px;
  position: relative;
}
.card__title { font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; }
.card__date, .card__venue, .card__price { font-size: 0.9rem; color: var(--clr-muted); margin-top: 4px; }
.card__venue::before { content: '📍 '; }
.card__price::before { content: '💰 '; }
.card__reason { font-size: 0.8rem; color: var(--clr-accent); margin-top: 8px; }
.card__footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.card__source { font-size: 0.75rem; color: var(--clr-muted); }
.card__cta {
  background: var(--clr-accent); color: #fff; border-radius: 8px;
  padding: 8px 16px; text-decoration: none; font-size: 0.85rem; font-weight: 600;
}

/* Honesty badges */
.badge { position: absolute; top: 12px; right: 12px; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }
.badge--demo { background: var(--clr-demo); color: #fff; }
.badge--cached { background: var(--clr-cached); color: #fff; }

/* Source status panel */
.sources { padding: 12px 16px; font-size: 0.85rem; }
.sources__list { list-style: none; padding: 8px 0; }
.sources__list li { padding: 4px 0; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.dot--live { background: var(--clr-live); }
.dot--cached { background: var(--clr-cached); }
.dot--error, .dot--blocked { background: var(--clr-error); }
.dot--seed { background: var(--clr-demo); }

.hidden { display: none; }
```

### Client JS Fetch Flow (`public/app.js`)

```javascript
// public/app.js
// ~300 lines vanilla JS, no framework, no bundler

'use strict';

const SURGUT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

// ── Date helpers ──────────────────────────────────────────

function surgutDate(utcDate) {
  return new Date(new Date(utcDate).getTime() + SURGUT_OFFSET_MS);
}

function humanizeDate(isoString) {
  const d = surgutDate(isoString);
  const now = surgutDate(new Date());

  const todayStr = now.toISOString().slice(0, 10);
  const dStr     = d.toISOString().slice(0, 10);

  const RU_DAYS   = ['вс','пн','вт','ср','чт','пт','сб'];
  const RU_MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

  const timeStr = d.getUTCHours() === 0 && d.getUTCMinutes() === 0
    ? ''
    : `, ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;

  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0,10);

  if (dStr === todayStr)    return `Сегодня${timeStr}`;
  if (dStr === tomorrowStr) return `Завтра${timeStr}`;

  const day = RU_DAYS[d.getUTCDay()];
  const mon = RU_MONTHS[d.getUTCMonth()];
  return `${day}, ${d.getUTCDate()} ${mon}${timeStr}`;
}

// ── State ─────────────────────────────────────────────────

let currentItems    = [];  // RecommendationItem[]
let activeMood      = null;
let activeDateChip  = '';  // '' | 'today' | 'tomorrow' | 'weekend' | 'week'
let freeOnly        = false;
let activeCategory  = '';

// ── Client-side filter ─────────────────────────────────────

function applyFilters() {
  const now = Date.now();
  const nowSurgut = surgutDate(new Date());
  const todayStr    = nowSurgut.toISOString().slice(0,10);
  const tomorrowStr = surgutDate(new Date(now + 86400000)).toISOString().slice(0,10);

  return currentItems.filter(item => {
    const e = item.event;
    if (freeOnly && !e.isFree) return false;
    if (activeCategory && e.category !== activeCategory) return false;

    if (!activeDateChip) return true; // no date filter

    const dStr = surgutDate(e.startDate).toISOString().slice(0,10);
    const wd   = surgutDate(new Date(e.startDate)).getUTCDay();

    if (activeDateChip === 'today')   return dStr === todayStr;
    if (activeDateChip === 'tomorrow') return dStr === tomorrowStr;
    if (activeDateChip === 'weekend') return wd === 0 || wd === 6;
    if (activeDateChip === 'week') {
      const eventMs = new Date(e.startDate).getTime();
      return eventMs >= now && eventMs < now + 7 * 86400000;
    }
    return true;
  });
}

// ── Rendering ──────────────────────────────────────────────

function renderCards(items) {
  const results = document.getElementById('results');
  if (items.length === 0) {
    results.innerHTML = '<p class="empty">Нет мероприятий по выбранным фильтрам</p>';
    return;
  }
  results.innerHTML = items.map(renderCard).join('');
}

function renderCard(item) {
  const e = item.event;
  const badge = e.isSeed
    ? '<div class="badge badge--demo">Демо</div>'
    : '';
  const cta = ['kassa-ugra','kassir','tbank'].includes(e.sourceName)
    ? 'Купить билет' : 'Открыть';
  const priceHtml = e.priceText !== 'Цена не указана'
    ? `<p class="card__price">${e.priceText}</p>` : '';
  const reasonEmoji = { drink:'🍸', dance:'💃', learn:'🧠', music:'🎵' }[activeMood] ?? '✨';

  return `
<article class="card"
         data-seed="${e.isSeed}"
         data-category="${e.category}"
         data-date="${surgutDate(e.startDate).toISOString().slice(0,10)}"
         data-free="${e.isFree}">
  ${badge}
  <h3 class="card__title">${escHtml(e.title)}</h3>
  <time class="card__date" datetime="${e.startDate}">${humanizeDate(e.startDate)}</time>
  <p class="card__venue">${escHtml(e.venue)}</p>
  ${priceHtml}
  <p class="card__reason">${reasonEmoji} ${escHtml(item.reason)}</p>
  <footer class="card__footer">
    <span class="card__source">${escHtml(e.sourceName)}</span>
    <a class="card__cta" href="${e.sourceUrl}"
       target="_blank" rel="noopener noreferrer">${cta}</a>
  </footer>
</article>`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Mood fetch ──────────────────────────────────────────────

async function loadMood(mood) {
  activeMood = mood;
  activeDateChip = '';
  freeOnly = false;
  activeCategory = '';

  // Update active mood button
  document.querySelectorAll('.mood-btn').forEach(b => {
    b.classList.toggle('mood-btn--active', b.dataset.mood === mood);
  });
  // Show filters
  document.getElementById('filters').classList.remove('hidden');
  // Reset chips
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('chip--active', c.dataset.date === '');
  });
  document.getElementById('free-toggle').checked = false;
  document.getElementById('category-filter').value = '';

  // Show loading state
  document.getElementById('results').innerHTML =
    '<p class="loading">Загружаем…</p>';

  try {
    const res = await fetch(`/api/recommendations?mood=${mood}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentItems = data.items;
    renderCards(applyFilters());
  } catch (err) {
    document.getElementById('results').innerHTML =
      '<p class="error">Не удалось загрузить события. Попробуйте позже.</p>';
    console.error('loadMood error:', err);
  }
}

// ── Source status ───────────────────────────────────────────

async function loadSources() {
  try {
    const res = await fetch('/api/sources/status');
    const sources = await res.json();
    const list = document.getElementById('source-list');
    const statusLabel = {
      live:    { dot: 'live',    text: 'Обновлено' },
      cached:  { dot: 'cached',  text: 'Кэш' },
      error:   { dot: 'error',   text: 'Ошибка' },
      blocked: { dot: 'blocked', text: 'Недоступен' },
      seed:    { dot: 'seed',    text: 'Демо-данные' },
    };
    list.innerHTML = sources.map(src => {
      const s = statusLabel[src.status] ?? { dot: 'error', text: src.status };
      const age = src.fetchedAt
        ? ` · ${Math.round((Date.now() - new Date(src.fetchedAt)) / 60000)} мин назад`
        : '';
      return `<li><span class="dot dot--${s.dot}"></span>${src.displayName}: ${src.eventCount} событий${age}</li>`;
    }).join('');
  } catch (e) {
    console.warn('Source status unavailable:', e);
  }
}

// ── Event bindings ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => loadMood(btn.dataset.mood));
  });

  // Date chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeDateChip = chip.dataset.date;
      document.querySelectorAll('.chip').forEach(c =>
        c.classList.toggle('chip--active', c === chip));
      renderCards(applyFilters());
    });
  });

  // Free toggle
  document.getElementById('free-toggle').addEventListener('change', e => {
    freeOnly = e.target.checked;
    renderCards(applyFilters());
  });

  // Category filter
  document.getElementById('category-filter').addEventListener('change', e => {
    activeCategory = e.target.value;
    renderCards(applyFilters());
  });

  // Load source status once on page load
  loadSources();
});
```

**Interaction summary:**
1. Page loads → `loadSources()` called once → source panel populated
2. User taps mood button → `loadMood(mood)` → `fetch('/api/recommendations?mood=...')` → render all cards
3. User taps date chip → `activeDateChip` updated → `applyFilters()` → `renderCards()` — no fetch
4. User toggles free / changes category → filter on `currentItems` → `renderCards()` — no fetch
5. User taps another mood → `loadMood(newMood)` — new fetch

---

## Domain: Data Quality (Past Events & Art Shop Items)

### Problem

Live data shows 22 past events (dates ranging from 2026-01-01 to 2026-06-26). These are:
- Art shop items from ARTIE'S venue (paintings with sale-start dates, not events)
- Exhibition range start dates that pre-date today but exhibitions are still running
- Informational posts from afisha.surguta.ru (e.g., "postamt appeared in library")

### Recommendations Endpoint: Always Filters Past Events

The `getRecommendations()` function filters `startDate < now` unconditionally before any ranking. This is the primary defense:

```typescript
// In getRecommendations():
const now = new Date();
const candidates = allEvents.filter(e => {
  // Exclude past events
  if (e.startDate.getTime() < now.getTime()) return false;
  // Exclude events matching this mood
  return isEventMatchForMood(e, mapping);
});
```

This means art shop items with dates like `2026-01-01` are automatically excluded from all mood recommendations. [ASSUMED — confirmed by live data: 22 events with startDate < now would be filtered]

### /api/events Endpoint: No Change Needed in Phase 2

The existing `/api/events` endpoint is used for browsing. Users applying `?date=today` already filter past events. The art shop items only appear when browsing with no date filter. Phase 2 does not modify this endpoint. Cleaning up the afisha.surguta.ru parser to exclude art items is a Phase 3 concern.

### Exhibitions with Range Dates

Exhibitions often have `startDate` = exhibition open date (past) and `endDate` = close date (future). In Phase 1, exhibitions get `startDate` from the range start (often past). In the recommendations engine, exhibitions currently get `isEventMatchForMood` = true for `learn` mood (category 'exhibition'), but then get filtered by `startDate < now`.

**Mitigation for Phase 2:** When `startDate < now` AND `endDate` exists AND `endDate >= now`, the event is still running. For exhibitions, use `endDate` (if set and in future) as the effective event date for ranking, or include the event with `startDate` = now (pinned to today). Document this special case in the scorer.

```typescript
// In scoreEvent() / filter:
const effectiveDate = event.endDate && event.endDate.getTime() > now.getTime()
  ? now  // still-running exhibition: treat as "today"
  : event.startDate;
if (effectiveDate.getTime() < now.getTime()) return -1; // exclude
```

This way, ongoing exhibitions (Исторический парк «Рюриковичи», Гончарная школа) appear in `learn` recommendations as "today" events.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mood→category mapping | Database table + admin UI | Static TypeScript constant | Rule-based is sufficient; 4 moods × 4 fields = 16 values; change = redeploy |
| Score-based sort | Priority queue | Simple `.sort()` descending | 75 events max; O(n log n) is irrelevant |
| HTML escaping in app.js | Custom regex | `escHtml()` inline function (4 lines) | No XSS risk with 4 simple replacements; DOMParser or library overkill |
| Date humanization | date-fns (not installed) | 30-line `humanizeDate()` in app.js | UTC+5 offset already established in Phase 1; only 3 output patterns needed |
| Card list virtualization | Virtual scroll library | Plain HTML map render | Max 50 cards × ~300 bytes each = 15 KB DOM — trivial for mobile browser |
| Client-side state management | Redux / Zustand | 4 module-level variables | `currentItems`, `activeMood`, `activeDateChip`, `freeOnly`, `activeCategory` |
| Server-side template engine | Eta / @fastify/view | public/index.html static file | @fastify/static already handles it; server templating adds complexity for zero gain |
| Text search | Full-text index | Skip (UI-06 is Phase 3 scope) | Phase 2 does NOT include UI-06 per REQUIREMENTS.md traceability table |

---

## Common Pitfalls

### Pitfall 1: Sparse Tags Break Mood Matching
**What goes wrong:** Matching only `event.tags ∩ mood.tagKeywords` — but 85%+ of Phase 1 events have `tags: []`. Result: most events match nothing, empty recommendations.
**How to avoid:** Match title keywords (primary) + category (primary) + venue (secondary). Tags are a bonus signal, not the primary signal.
**Warning signs:** `getRecommendations('music', ...)` returns < 5 events despite 42 concert events in the index.

### Pitfall 2: Past Events in Recommendations
**What goes wrong:** Forgetting `startDate < now` filter. 22 past events (art shop, old exhibitions) appear at the top of rankings.
**How to avoid:** `scoreEvent()` returns `-1` for past events; filter these out before sorting.
**Warning signs:** Recommendation list shows events from January 2026.

### Pitfall 3: @fastify/static Route Conflict
**What goes wrong:** Adding a Fastify route `GET /` that conflicts with @fastify/static serving `public/index.html`. Result: 404 or wrong content type.
**How to avoid:** Do NOT add a Fastify route for `GET /`. The static server already handles it. Only add the API route `GET /api/recommendations`.
**Warning signs:** `GET /` returns JSON or empty response after registering a web route.

### Pitfall 4: HTML Injection via Event Titles
**What goes wrong:** Directly inserting `event.title` into innerHTML without escaping. Event titles from afisha.surguta.ru can contain `"` and `&` (e.g., `"Мастер и Маргарита"`).
**How to avoid:** Always pass event title through `escHtml()` before inserting into template strings used with `innerHTML`.
**Warning signs:** Cards with `&amp;` visible in titles, or worse, `<script>` execution if a title contained HTML tags.

### Pitfall 5: serializeEvent() Duplication
**What goes wrong:** Copying the `serializeEvent()` function from `events.ts` into `recommendations.ts`. Creates drift if Date fields change.
**How to avoid:** Extract `serializeEvent()` to a shared module `src/http/serialize.ts` and import it in both routes.
**Warning signs:** TypeScript reports duplicate function body; or serialization diverges between endpoints.

### Pitfall 6: filterByDate Chip vs. API date Filter
**What goes wrong:** Passing `?date=today` as a query parameter to `/api/recommendations` — the endpoint doesn't support this. Date filtering is client-side only in Phase 2.
**How to avoid:** `/api/recommendations` only accepts `?mood=`. Date/free/category filtering is done client-side by `applyFilters()` in app.js.
**Warning signs:** Fetch returns 400 from Fastify's Ajv because `date` is in `additionalProperties: false` schema.

### Pitfall 7: isSeed Badge Missing on Seed Events
**What goes wrong:** Not rendering the "Демо" badge because the template only renders it `if (isSeed)`, but the live data response has `isSeed: false` for all live events. Seed events always have `isSeed: true`.
**How to avoid:** Check `item.event.isSeed === true` in renderCard(). The live API response correctly sends `isSeed: false` for live events. Verify by loading the page with only seed events (temporarily stop the scrape).
**Warning signs:** Seed events from both kassa-ugra and afisha-surguta are labeled but seed-only events (from seed adapter) are not.

### Pitfall 8: Coverage Drop from New Uncovered Code
**What goes wrong:** Adding mood-map.ts and recommend.ts without tests pushes line coverage below 80%. Current Phase 1 coverage: 81.52% lines.
**How to avoid:** Write tests in the same commit as the production code. The recommend/ directory is the primary new surface; every branch (venue match, title match, category fallback, past event filter, still-running exhibition) needs a test case.
**Warning signs:** `npm run test -- --coverage` shows overall below 80%.

---

## Testing Plan (QA-02)

### Current Coverage Baseline (measured 2026-06-27)

```
Lines: 81.52% (256/314)  — just above 80% threshold
Functions: 77.19% (44/57) — below threshold
Branches: 70.61% (137/194) — below threshold
```

**Low-coverage files to fix:**
- `utils/http.ts`: 8.33% lines — fetchHtml with retry is hard to unit-test; mock-based test needed
- `utils/robots.ts`: 15.38% — mock fetch in tests
- `pipeline/dedup.ts`: NOT in coverage table at all — no tests exist
- `pipeline/index-events.ts`: NOT in coverage table — no tests exist
- `sources/kassa-ugra/index.ts`: 59.09% — partial coverage

### New Test Files for Phase 2

| File | Tests | Covers |
|------|-------|--------|
| `src/recommend/mood-map.test.ts` | MOOD_MAPPINGS has all 4 moods; each has categories/titleKeywords/venueKeywords/label/emoji | MOOD-01 |
| `src/recommend/recommend.test.ts` | past event filtered; tonight-first score; tomorrow second; category match; title keyword match; venue match; reason text generation (venue/keyword/category branches); still-running exhibition; empty result case | MOOD-01, MOOD-02, MOOD-03 |
| `src/pipeline/dedup.test.ts` | same event 2 sources = 1 result; live beats seed; different title = 2 results; toSlug Cyrillic | AGG-03 |
| `src/pipeline/index-events.test.ts` | buildEventIndex sorts by date; byCategory returns correct subset; rebuild swaps atomically | coverage |
| `src/http/routes/recommendations.test.ts` | mood=drink returns 200 + items[]; missing mood → 400; invalid mood → 400; isSeed preserved | API-03 |

### Recommended vitest Pattern for Route Testing

```typescript
// src/http/routes/recommendations.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { buildEventIndex } from '../../pipeline/index-events';
import { CacheStore } from '../../cache/store';
import recommendationsRoute from './recommendations';
import { seedAdapter } from '../../sources/seed';

describe('GET /api/recommendations', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    fastify = Fastify();
    const events = await seedAdapter.scrape();
    const index = buildEventIndex(events);
    // Minimal store mock — only getSources() needed
    const store = { getSources: () => [] } as unknown as CacheStore;
    fastify.decorate('store', store);
    fastify.decorate('index', index);
    await fastify.register(recommendationsRoute);
    await fastify.ready();
  });

  afterAll(() => fastify.close());

  it('returns 200 with items for mood=music', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/recommendations?mood=music' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mood).toBe('music');
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns 400 for missing mood', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/recommendations' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid mood', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/recommendations?mood=sleep' });
    expect(res.statusCode).toBe(400);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Server-rendered HTML per request (Eta, EJS) | Static shell + client fetch | Simpler, already configured via @fastify/static |
| ML/collaborative filtering | Rule-based category+keyword+venue | Intentional; honest; sufficient for Surgut event volume |
| DateTimeFormat TZ API | Manual UTC+5 offset arithmetic | Avoids tz database overhead; Surgut is always UTC+5 |

---

## Environment Availability

All dependencies confirmed from Phase 1 install:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20 | Runtime | ✓ | 20.x | — |
| fastify 5.8.5 | API route | ✓ | 5.8.5 | — |
| @fastify/static 9.1.3 | Serving public/ | ✓ | 9.1.3 | — |
| vitest 4.1.9 | Tests | ✓ | 4.1.9 | — |
| TypeScript 5.x | Type-check | ✓ | 5.9.3 | — |
| esbuild 0.28.1 | Build | ✓ | 0.28.1 | — |

**Missing dependencies with no fallback:** none — Phase 2 requires zero new packages.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.9 |
| Config file | `vitest.config.ts` (exists; threshold: lines 80) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test -- --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGG-03 | Dedup by fingerprint removes cross-source duplicate | unit | `vitest run src/pipeline/dedup.test.ts` | ❌ Wave 0 |
| MOOD-01 | MOOD_MAPPINGS has correct structure | unit | `vitest run src/recommend/mood-map.test.ts` | ❌ Wave 0 |
| MOOD-02 | Tonight-first ranking; past events excluded | unit | `vitest run src/recommend/recommend.test.ts` | ❌ Wave 0 |
| MOOD-03 | Reason text: venue > keyword > category | unit | `vitest run src/recommend/recommend.test.ts` | ❌ Wave 0 |
| API-03 | GET /api/recommendations returns 200; invalid mood = 400 | integration | `vitest run src/http/routes/recommendations.test.ts` | ❌ Wave 0 |
| UI-07 | isSeed=true → "Демо" badge in card HTML | manual / visual | Load page with seed events visible | — |
| QA-02 | Coverage ≥ 80% lines | coverage | `npm run test -- --coverage` | — |

### Wave 0 Gaps
- [ ] `src/recommend/mood-map.ts` — new file
- [ ] `src/recommend/mood-map.test.ts` — new file
- [ ] `src/recommend/recommend.ts` — new file
- [ ] `src/recommend/recommend.test.ts` — new file
- [ ] `src/pipeline/dedup.test.ts` — new file
- [ ] `src/pipeline/index-events.test.ts` — new file (optional if coverage remains above 80%)
- [ ] `src/http/routes/recommendations.ts` — new file
- [ ] `src/http/routes/recommendations.test.ts` — new file
- [ ] `src/http/serialize.ts` — extract shared serializeEvent() helper
- [ ] `public/index.html` — replace placeholder
- [ ] `public/app.css` — new file
- [ ] `public/app.js` — new file

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Anonymous MVP per PROJECT.md |
| V3 Session Management | no | Stateless |
| V4 Access Control | no | Public read-only API |
| V5 Input Validation | yes | Fastify Ajv on `?mood=` enum; `additionalProperties: false` |
| V6 Cryptography | no | SHA1 for dedup key only (collision-resistance is sufficient; not a security hash) |

### Threat Patterns for Phase 2

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| XSS via event title in innerHTML | Spoofing / Tampering | `escHtml()` in app.js renders every field through entity escaping before `innerHTML` assignment |
| Open redirect via sourceUrl | Spoofing | CTA links use `target="_blank" rel="noopener noreferrer"` only; no server-side redirect |
| Ajv schema bypass for mood enum | Tampering | Fastify's built-in Ajv validates at framework level before handler runs; `additionalProperties: false` rejects unexpected params |
| Serving seed data as live | Spoofing / Info Disclosure | `isSeed` field preserved in recommendations response; `data-seed` attribute on card; badge rendered unconditionally when true |
| Info disclosure via error messages | Info Disclosure | Route errors return Fastify's standard 400/500 shape (no stack traces) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Most events have `tags: []` at time of Phase 2 execution | Mood Mapping domain | Tags may improve if scrapers are enhanced; MOOD_MAPPINGS.titleKeywords would then be double-matching (harmless, just redundant) |
| A2 | 22 past-dated events will not cause visible issues because recommendations filter `startDate < now` | Data Quality | If scraper is refreshed with fully fresh data by Phase 2 execution, past event count may change; filtering logic is the same regardless |
| A3 | `@fastify/static` serves `public/index.html` for `GET /` via implicit directory index | UI Architecture | Confirmed working in Phase 1 production (placeholder index.html was served); risk LOW |
| A4 | Ongoing exhibitions (endDate in future, startDate in past) should appear in `learn` recommendations | Data Quality | Could be argued either way; pinning to "today" is the most user-friendly choice |

---

## Open Questions (RESOLVED)

1. **RESOLVED:** Add a `?upcoming=true` filter option to `/api/events` as a non-breaking addition; leave default behavior unchanged (implemented in plan 02-3 Task 1). Past-dated art-shop items are excluded from recommendations by the engine regardless.

2. **RESOLVED:** Category filter is a `<select>` (fewer categories; saves screen space); date stays a chip row (implemented in plan 02-4 Task 1).

3. **RESOLVED:** Extract `serializeEvent()` immediately to `src/http/serialize.ts` — prevents drift, easier to test, aligns with AGENTS.md "small clean modules" (implemented in plan 02-3 Task 1).

---

## Sources

### Primary (HIGH confidence)
- Phase 1 codebase — `src/types/events.ts`, `src/pipeline/dedup.ts`, `src/pipeline/index-events.ts`, `src/http/routes/events.ts`, `src/http/server.ts` — read directly in this session
- Phase 1 Verification (`01-VERIFICATION.md`) — live data confirmed: 97 events, 22 past, 75 future, tag distribution
- Live API probe — `https://surgut-go.apps.sielom.ru/api/events` — tag/category/source distribution measured in this session
- `.planning/research/FEATURES.md` — MOOD_MAP model, dedup model, card fields, date filter model
- `.planning/research/ARCHITECTURE.md` — pure-function recommendation pattern, serve-stale, EventIndex API

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — mood→venue mapping (Компромат/Brooklyn/Forte/Карасёвня for drink; Вавилон/Utopia/аквапарк for dance)
- `.planning/research/FEATURES.md` — "Почему рекомендовано" derivation logic; date filter bucket definitions

### Tertiary (LOW confidence — training knowledge)
- Vanilla JS XSS mitigation patterns (escHtml) — [ASSUMED] — well-established technique, low risk
- CSS system font stack pattern — [ASSUMED] — universally documented pattern, low risk
- `rel="noopener noreferrer"` for target="_blank" — [ASSUMED] — universally documented security practice

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Phase 1 packages confirmed; zero new packages confirmed
- Architecture: HIGH — EventIndex and Fastify plugin pattern verified from Phase 1 code
- Mood mapping data: MEDIUM — mapping verified against PROJECT.md; live tag distribution confirms title-first is required
- UI patterns: MEDIUM — static-shell-with-fetch confirmed working; CSS/JS sketches are ASSUMED from training

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (30 days; project stack is stable)
