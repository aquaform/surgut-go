# Feature Research

**Domain:** City event aggregator / afisha — "what to do tonight" with mood-based entry
**Researched:** 2026-06-26
**Confidence:** HIGH (table stakes and dedup), MEDIUM (mood UX patterns, ranking heuristics)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a city-guide visitor assumes exist. Missing any of these makes the product feel broken, not MVP.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Mood / vibe entry point (4 big buttons) | It's the entire premise of the app — opening screen must deliver this immediately | LOW | Server-render 4 buttons; no JS framework needed |
| Event card with title, date/time, venue, price | Standard in every afisha from Yandex to Eventbrite — users refuse to click through for basics | LOW | Must humanize dates: "сегодня, 20:00" not ISO string |
| CTA "Открыть / Купить билет" linking to source | Users expect to go buy a ticket or see full event page; dead-end cards kill trust | LOW | External link, `rel="noopener noreferrer"`, `target="_blank"` |
| Source attribution on each card | If data can be stale, users need to know where it came from to verify | LOW | Small badge: "Источник: kassa-ugra.ru" |
| Date quick-filters (Сегодня / Завтра / Выходные / 7 дней) | Facebook Events, Яндекс Афиша, Eventbrite all use time-bucket pattern — date pickers feel alien for events | LOW | Compute server-side in Asia/Yekaterinburg timezone; no JS date picker needed |
| Category filter or tabs | Users who arrive without a mood still expect a way to browse by type | LOW | Reuse category tags already on events |
| Mobile-first layout | City-guide use case is overwhelmingly mobile; desktop fallback is enough | LOW | CSS-only, no framework |
| /health endpoint returning 200 "ok" | Dokploy contract; deploy fails without it | LOW | One-liner Fastify route |
| /api/events and /api/recommendations?mood= | Consumers (including the frontend) need a stable JSON contract | MEDIUM | Fastify + Zod schema validation |

### Differentiators (Competitive Advantage)

Features that set this product apart from generic afisha aggregators and deliver the core value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Honest source status per-source (live / cached / blocked / error) | Only product in Surgut that tells you exactly how fresh the data is; builds trust | MEDIUM | /api/sources/status endpoint + UI indicator per source card; colored dot: green/yellow/red |
| Demo/seed data explicitly labeled "Демо-данные" | Never show fabricated live data; users learn they can trust what's labeled live | LOW | Seed JSON marked `source: "demo"`, UI badge always visible |
| "Почему рекомендовано" badge on each card | Transparency about why a card appeared; follows Netflix/Spotify "Because you..." pattern that research shows increases trust and engagement | LOW | Derive at query time from which mood-matched tag fired; e.g., "Стендап · клубный вечер" |
| Tonight-first ranking within mood | Most relevant to user intent is what's happening tonight, then tomorrow, not alphabetical or crawl order | LOW | Sort: today evening (17:00+) first → today daytime → tomorrow → rest ascending |
| Known Surgut venue normalization | Venues like "Brooklyn Bowl", "Компромат", "Вавилон" vary across sources; hardcode canonical names + mood affinity | LOW | Static lookup table, O(1) matching at ingest |
| Free/paid toggle filter | Users with budget constraints need one-tap filtering; "бесплатно" events are a key differentiator in city guides | LOW | Server-side: priceText contains "бесплатно" OR price == 0 |
| Persistent cache surviving restarts | App remains useful even when all scrapers are blocked; competitors go dark | LOW | JSON file on disk with TTL; survives container restart |

### Anti-Features (Deliberately NOT Build for MVP)

Features that seem valuable but create cost/complexity disproportionate to MVP validation.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User accounts / login / saved favorites | "I want to save events I like" | Adds auth surface, session management, GDPR obligations, DB schema — none of this validates core value | Stateless anonymous use; add after retention is proven |
| In-app ticket purchase / payment processing | "One-stop shop" appeal | Requires payment provider integration, PCI compliance, ticketing platform APIs — months of work | Redirect to source ticketing page via CTA; sufficient for MVP |
| Real-time geolocation / map view / routing | "Show events near me" | GPS permissions, map tile licensing, geocoding API costs, privacy questions | Venue address in card; add map link to 2GIS/Yandex Maps post-MVP |
| Push notifications / email alerts | "Notify me about upcoming events" | Requires accounts, subscription management, notification infrastructure, unsubscribe flows | None; no accounts in MVP |
| User reviews / comments / ratings | "Community feeling" | Moderation cost, spam, troll risk, adds social graph complexity | Link to source reviews if they exist |
| ML / collaborative filtering recommendations | "Smarter personalization" | Training data, model serving, drift monitoring — overkill before user base exists | Static mood→tag mapping table covers the problem; honest and inspectable |
| Fabricating "live" events when scrapers fail | "Always show something" | Undermines trust entirely — the core value is honest data | Show source status + labeled demo seed; never unlabeled fake live |
| Text search across all events | "Search by keyword" | Lower priority than mood+date filters for this use case; full-text search adds indexing complexity | Category filter + date buckets cover 80% of intent; add search after core works |
| Social sharing deep links | "Share this event" | Minor utility, but requires canonical URLs per event; adds routing complexity | Post-MVP; users can share the source URL from the CTA |
| Infinite scroll / pagination | "Load more" UX | Adds JS state management; events per mood per city are few enough to show all | Limit to 50 events per response initially; reassess when data volume grows |

---

## Feature Dependencies

```
[Mood buttons] ──requires──> [Mood→tag mapping table]
                                  └──requires──> [Normalized event tags at ingest]
                                                     └──requires──> [Scraper + normalizer pipeline]

[Source status UI] ──requires──> [/api/sources/status]
                                      └──requires──> [Cache with per-source metadata]

["Почему рекомендовано"] ──requires──> [Mood→tag mapping table]
                           ──derives from──> [event.tags intersection with mood tags]

[Deduplication] ──requires──> [Normalized title + date + venue before insertion]
                └──enhances──> [Event cards] (no duplicate cards shown)

[Date quick-filters] ──requires──> [All dates in ISO-8601 UTC; TZ conversion server-side]

[Free/paid toggle] ──requires──> [Normalized priceText field at ingest]

[Demo seed data] ──must not conflict with──> [Live data status display]
                  └──labeled with source: "demo" always]
```

### Dependency Notes

- **Scraper pipeline is the root dependency** — mood buttons, filters, dedup, and status all depend on having normalized events in cache. Build and test ingest first.
- **Mood→tag mapping table is pure config** — a TypeScript constant, not a DB table. Changing mappings is a config edit, not a schema migration.
- **"Почему рекомендовано" is derived at query time**, not stored. Computed by intersecting `event.tags` with the active mood's tag set and returning the matching tags as human-readable text.
- **Date filters are server-side** — the server computes "today" in Asia/Yekaterinburg (UTC+5), no client-side JS needed.

---

## Mood → Category/Tag Mapping (Concrete Model)

This is the core algorithm for the recommender; it is rule-based, not ML.

```typescript
const MOOD_MAP: Record<string, { tags: string[]; venues: string[]; label: string }> = {
  drink: {
    tags: ['бар', 'стендап', 'open mic', 'клуб', 'вечеринка', 'коктейль', 'lounge'],
    venues: ['Компромат', 'Brooklyn Bowl', 'Forte & Piano', 'Карасёвня'],
    label: 'Выпить и расслабиться',
  },
  dance: {
    tags: ['вечеринка', 'клуб', 'поп', 'хип-хоп', 'электроника', 'dance', 'dj'],
    venues: ['Вавилон', 'Utopia', 'аквапарк'],
    label: 'Потанцевать',
  },
  learn: {
    tags: ['лекция', 'квиз', 'выставка', 'музей', 'театр', 'образование', 'история', 'мастер-класс'],
    venues: ['Исторический парк', 'Сургутский краеведческий музей'],
    label: 'Узнать что-то новое',
  },
  music: {
    tags: ['концерт', 'филармония', 'живой звук', 'рок', 'джаз', 'оркестр', 'CAGMO', 'акустика'],
    venues: ['Филармония', 'CAGMO'],
    label: 'Насладиться музыкой',
  },
};
```

**Ranking order for mood results:**
1. Events with startDate = today AND startTime >= 17:00 (tonight)
2. Events with startDate = today AND startTime < 17:00 (today daytime)
3. Events with startDate = tomorrow
4. Events within next 7 days, ascending by startDate
5. Within each bucket: events with more complete data (has imageUrl, priceText, venue) ranked above sparse records

**"Почему рекомендовано" generation:**
```
matchedTags = event.tags ∩ MOOD_MAP[mood].tags
venueMatch  = MOOD_MAP[mood].venues.includes(normalize(event.venue))

if (venueMatch)   → "Площадка подходит под настроение"
if (matchedTags)  → matchedTags.slice(0, 2).map(capitalize).join(' · ')
else              → "Категория: " + event.category
```

---

## Event Deduplication (Concrete Model)

**Problem:** The same concert appears on afisha.surguta.ru, kassa-ugra.ru, and afisha.ru with slightly different titles.

**Deduplication key (fingerprint):**
```
fingerprint = normalize(title) + "|" + toISO(startDate) + "|" + normalize(venue)

normalize(s) = s
  .toLowerCase()
  .replace(/[^а-яёa-z0-9\s]/g, '')  // strip punctuation
  .replace(/\s+/g, ' ')
  .trim()
```

**Merge rules:**
- Exact fingerprint match → merge immediately; store all sourceUrls as array
- Fuzzy match (Levenshtein distance of normalized titles ≤ 3, same date ±0 days, same venue) → candidate duplicate; log for review but merge in v1 if confidence > 80%
- Time window: events at same venue within ±30 minutes treated as same event

**Source preference when merging (pick "winner" for display):**
Priority order: afisha.surguta.ru > kassa-ugra.ru > kassir.ru > afisha.ru > yandex afisha > tbank
(Local sources have most accurate venue/local details; national aggregators fill gaps)

**Store both:** `event.sourceUrl` (winner) and `event.alternativeUrls[]` (all dupes) for debugging.

---

## Event Card Content (Concrete Fields)

Minimum complete event card for display:

| Field | Required | Format | Example |
|-------|----------|--------|---------|
| `title` | YES | Raw text, capitalized | "Стендап-вечер: Новые лица" |
| `startDate` | YES | Human: "сегодня, 20:00" or "пт, 27 июн, 19:30" | Server formats, not ISO on card |
| `venue` | YES | Canonical name | "Brooklyn Bowl" |
| `priceText` | YES | Raw text or "Бесплатно" | "от 500 ₽" / "Бесплатно" |
| `sourceName` | YES | Display name | "kassa-ugra.ru" |
| `sourceUrl` | YES | Full URL | for CTA button |
| `category` | YES | Single primary | "Стендап" |
| `tags[]` | YES | Array of strings | ["стендап", "open mic", "бар"] |
| `reasonText` | YES | Derived at query time | "Стендап · Open mic" |
| `imageUrl` | NO | Absolute URL or null | Show placeholder if null |
| `ageLimit` | NO | String | "18+" |
| `address` | NO | Text | "ул. Энергетиков, 8" |

**CTA button text logic:**
- Source is a ticketing platform (kassa-ugra, kassir, tbank) → "Купить билет"
- Source is informational (afisha.surguta.ru, afisha.ru) → "Открыть"

---

## Date Filter Implementation

**Server-side bucket computation (Asia/Yekaterinburg, UTC+5):**

| Filter | Logic |
|--------|-------|
| Сегодня | startDate.date == today |
| Завтра | startDate.date == today + 1 day |
| Выходные | startDate.date in [next Saturday, next Sunday] (or current weekend if not past) |
| 7 дней | startDate.date between today and today + 7 days inclusive |

**Free filter:** `priceText.includes('бесплатно') || price === 0`

**UI pattern:** Horizontal scrollable chip row on mobile. One active chip highlighted. Chips: "Сегодня" · "Завтра" · "Выходные" · "7 дней" · "Бесплатные". No date picker.

---

## Source Status / Freshness Display

**Per-source status model:**

| Status | Meaning | UI indicator |
|--------|---------|-------------|
| `live` | Scraped successfully within TTL | Green dot · "Обновлено N мин назад" |
| `cached` | Cache hit but TTL expired | Yellow dot · "Кэш от HH:MM" |
| `blocked` | HTTP 403/429 or robots.txt violation detected | Red dot · "Источник недоступен" |
| `error` | Unexpected parse failure | Red dot · "Ошибка парсинга" |
| `demo` | Seed/fallback data, never real | Orange badge · "Демо-данные" |

**Implementation:** `/api/sources/status` returns array of `{name, url, status, lastScrapedAt, eventCount}`.
UI: Small status panel below filters, collapsed by default, expandable for transparency.

**Critical invariant:** Demo/seed events are ALWAYS labeled in the card as "Демо". Never mix unlabeled demo with live events.

---

## MVP Definition

### Launch With (v1)

- [ ] Scraper pipeline for at least 2 sources (afisha.surguta.ru + kassa-ugra.ru) with JSON file cache — without real events, everything else is meaningless
- [ ] Mood-based recommendation endpoint (/api/recommendations?mood=) with MOOD_MAP and tonight-first ranking
- [ ] 4 mood buttons on main page → filtered event cards
- [ ] Event card: title, humanized date/time, venue, price, source, "почему рекомендовано", CTA
- [ ] Date quick-filters: Сегодня / Завтра / Выходные / 7 дней (chip row)
- [ ] Free/paid toggle
- [ ] Source status display (live/cached/blocked) visible in UI
- [ ] Honest demo seed data labeled "Демо-данные" as fallback when all scrapers fail
- [ ] Deduplication by fingerprint (normalized title + date + venue)
- [ ] /health and /api/sources/status endpoints

### Add After Validation (v1.x)

- [ ] Text search — add when users report finding specific events hard; keyword search across title+venue
- [ ] More sources (afisha.ru, Яндекс Афиша, kassir.ru) — add as scraper stability is confirmed
- [ ] Category tabs/filter — add when mood alone is insufficient for browsing
- [ ] Social share button — trivial to add, wait to confirm demand

### Future Consideration (v2+)

- [ ] User accounts / favorites — only if retention data shows repeat visits
- [ ] Map view with venue pins — add when geolocation use case is validated
- [ ] Native app (PWA → installable) — after web product is proven
- [ ] Scraper for VK Events (vk.com) — community events not on official afisha, high effort

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Scraper pipeline + cache | HIGH | MEDIUM | P1 |
| 4 mood buttons → event cards | HIGH | LOW | P1 |
| Event card (title, date, venue, price, CTA) | HIGH | LOW | P1 |
| Date quick-filters | HIGH | LOW | P1 |
| "Почему рекомендовано" badge | MEDIUM | LOW | P1 |
| Source status (live/cached) | HIGH | LOW | P1 |
| Demo seed fallback labeled | HIGH | LOW | P1 |
| Deduplication | MEDIUM | LOW | P1 |
| Free/paid toggle | MEDIUM | LOW | P1 |
| /api/sources/status endpoint | MEDIUM | LOW | P1 |
| Category filter | MEDIUM | LOW | P2 |
| Text search | LOW | MEDIUM | P2 |
| Additional scrapers (3+ sources) | MEDIUM | MEDIUM | P2 |
| Social sharing | LOW | LOW | P3 |
| Map / geolocation | MEDIUM | HIGH | P3 |
| User accounts | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Яндекс Афиша | afisha.surguta.ru | Our Approach |
|---------|--------------|-------------------|--------------|
| Mood / vibe entry | No (genre tabs) | No (category list) | YES — 4 mood buttons, core differentiator |
| Date filters | Yes (today/week/weekend) | Limited | Chip row: Сегодня/Завтра/Выходные/7 дней |
| Source transparency | No (aggregates silently) | No (single source) | YES — per-source status, freshness age |
| Deduplication | Yes (internal) | N/A | Yes — fingerprint merge at ingest |
| Demo/stale labeling | No | No | YES — explicit badge, never unmarked |
| Free/paid filter | Yes | Partial | Yes — toggle |
| Mobile-first | Yes (app) | No (desktop) | YES — server-rendered HTML/CSS |
| "Почему рекомендовано" | No | No | YES — derived tag explanation |
| In-app ticketing | YES (ticket sales) | No | No — external CTA only |
| User accounts | YES | No | No in MVP |

---

## Sources

- [UXmatters: Date Filters — Calendar Design Patterns](https://www.uxmatters.com/mt/archives/2011/08/date-filters-successful-calendar-design-patterns.php)
- [Evolvingweb: Popular Date Filter UI Patterns](https://evolvingweb.com/blog/most-popular-date-filter-ui-patterns-and-how-decide-each-one)
- [Grepsr: Data Deduplication and Normalization in Web Pipelines](https://www.grepsr.com/blog/data-deduplication-normalization-grepsr-web-pipelines/)
- [Groupbwt: Events Data Scraping Architecture Guide](https://groupbwt.com/blog/events-data-scraping/)
- [Tacnode: Stale Data, Freshness SLAs](https://tacnode.io/post/what-is-stale-data)
- [Eleken: Card UI Design Best Practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- [arxiv: Explainability in Music Recommender Systems](https://arxiv.org/pdf/2201.10528) — "Because you" pattern trust research
- [Яндекс Афиша feature set](https://afisha.yandex.ru/surgut) — competitor analysis
- [Multi Source Event Scraper (Apify)](https://apify.com/alexdyn.com/multi-source-event-scraper) — dedup signals reference

---

*Feature research for: surgut-go city event aggregator*
*Researched: 2026-06-26*
