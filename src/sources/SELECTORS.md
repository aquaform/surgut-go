# Confirmed CSS Selectors — Wave-0 Discovery

**Probed:** 2026-06-27
**Method:** Live `curl` with `User-Agent: surgut-go/1.0 (+https://surgut-go.apps.sielom.ru)`
**Status:** Both sources are server-rendered (SSR). No JavaScript required.

---

## kassa-ugra.ru/afisha

**Pages fetched:** page 1, page 2, page 3 (2 s apart per robots.txt; no crawl-delay declared)
**Combined fixture size:** 103 171 bytes (3 pages concatenated)
**Event links found:** 156 `href="/event/"` anchors (52 unique event containers across 3 pages)

### Confirmed Selectors

| Element | Cheerio Selector | Notes |
|---------|-----------------|-------|
| Event container | `div.event` | 52 occurrences across 3 pages (~17 per page) |
| Title | `div.event .title a[href^="/event/"]` | `.text().trim()` |
| Event URL | `div.event .title a[href^="/event/"]` | `attr('href')` — prepend `https://kassa-ugra.ru` |
| Image URL | `div.event > a[href^="/event/"] > img` | `attr('src')` — external CDN URL |
| Venue | `div.event li:has(i.icon-location) span` | `.text().trim()` |
| Date string | `div.event li:has(i.icon-calendar) span` | `.text().trim()` — contains whitespace/newlines; normalize with `/\s+/g → ' '` |
| Price string | `div.event li:has(i.icon-purse) span` | `.text().trim()` — optional; absent when no price listed |
| Date section header | `h4` (sibling before event groups) | `.text().replace(/\s+/g,' ').trim()` → e.g. `"27 июня, 2026"` |

### Confirmed HTML Structure (verbatim sample)

```html
<div class="event">
  <a href="/event/349507">
    <img src="https://tickets.s3.yandex.net/upload/ugra/.../activity-list-349506.jpg" alt="МакSим">
  </a>
  <div class="buy">...</div>
  <div class="info">
    <div class="title">
      <a href="/event/349507">МакSим</a>
    </div>
    <div class="details">
      <ul class="info-list info-list-card info-card">
        <li><i class="icon-location"></i><span>Вавилон</span></li>
        <li><i class="icon-calendar"></i><span>6\n\t\t\t\t\t\tsен\n\t\t\t\t\t\t20:00\n\t\t\t\t\t\tВс</span></li>
        <li><i class="icon-purse"></i><span>5500 - 8800</span></li>
      </ul>
    </div>
  </div>
</div>
```

### Date String Normalization

The `icon-calendar` span contains multiline whitespace. Always normalize before parsing:
```
rawDate.replace(/\s+/g, ' ').trim()
// "6\n\t\t\t\tsен\n\t\t\t\t20:00\n\t\t\t\tВс" → "6 сен 20:00 Вс"
```

Confirmed date formats in fixture:
- `"27 июн 23:00 Сб"` — abbreviated month + time + weekday letter
- `"6 сен 20:00 Вс"` — same pattern
- `"15 сен 19:00 Вт"` — same pattern
- Some events have no weekday letter: `"15 янв 19:00"`

Section headers (for year resolution):
- Format: `"DD месяца, YYYY"` e.g. `"27 июня, 2026"`, `"6 сентября, 2026"`, `"3 октября, 2026"`
- Use these h4 headers to carry the year forward for events without explicit year in listing date

### Price String Formats

Confirmed from fixture:
- `"5500 - 8800"` — range with spaces
- `"3500 - 12000"` — range
- Absent li entirely when no price listed (e.g. Вечеринка в аквапарке has no price li)

### Charset

Response: `text/html; charset=utf-8` — no special decoding needed.

### robots.txt Summary

`Disallow: /*.php$`, `Disallow: /*.doc$` — `/afisha` is allowed. **No Crawl-delay**.

---

## afisha.surguta.ru

**Page fetched:** `/` (main page — single request, no pagination)
**Fixture size:** 240 809 bytes
**Content-Type response header:** `text/html; charset=utf-8` — **UTF-8, not windows-1251**
**Event containers found:** 38 `div.event-element` divs
**Event /content/ links found:** 115 (includes repeated links for image + title + more)

> **Pitfall 10 RESOLVED:** Charset is UTF-8, not Windows-1251. No `TextDecoder('windows-1251')` needed.

### Confirmed Selectors

| Element | Cheerio Selector | Notes |
|---------|-----------------|-------|
| Event container | `div.event-element` | 38 containers found (all events in DOM — SSR confirmed) |
| Event URL | `div.teaser-title a[href^="/content/"]` | `attr('href')` — prepend `https://afisha.surguta.ru` |
| Title | `div.teaser-title a[href^="/content/"]` | `.text().trim()` — may have age limit suffix (strip separately) |
| Organization/Venue | `div.field-name-field-add-organization .field-item` | `.text().trim()` |
| Single date | `span.date-display-single` | Format: `"DD месяца YYYY"` e.g. `"27 июня 2026"` |
| Date range start | `span.date-display-start` | Format: `"DD месяца"` (no year) e.g. `"18 сентября"` |
| Date range end | `span.date-display-end` | Format: `"DD месяца YYYY"` e.g. `"29 декабря 2026"` |
| Image URL | `div.field-name-field-add-additional-images img` | `attr('src')` — absolute URL on afisha.surguta.ru |
| Free entry indicator | `img[alt="Свободный вход"]` inside event | Confirms `isFree: true` |

### Confirmed HTML Structure (condensed real sample)

```html
<div class="event-element node-ad-discount element-type-usual element-even" data-nid="20375">
  <div class="node-inner node node-ad-discount node-promoted node-teaser node-even">
    <div class="pos-abs">
      <div class="field-name-field-add-additional-images ...">
        <a href="/content/ekspoziciya-ryurikovichi-862-1598">
          <img src="https://afisha.surguta.ru/sites/default/files/.../48a80cd9.jpg" ...>
        </a>
      </div>
    </div>
    <div class="field-name-field-add-organization ...">
      <div class="field-item even">Исторический парк "Россия - Моя история. Югра."</div>
    </div>
    <div class="teaser-title">
      <a href="/content/ekspoziciya-ryurikovichi-862-1598">Экспозиция «Рюриковичи 862–1598»</a>
    </div>
    <div class="field-name-field-add-date ...">
      <div class="field-item even">
        <span class="date-display-start">18 сентября</span>
        -
        <span class="date-display-end">29 декабря 2026</span>
      </div>
    </div>
    ...
  </div>
</div>
```

### Date Formats Observed

| Pattern | Example | Notes |
|---------|---------|-------|
| Single date | `"27 июня 2026"` | `span.date-display-single` |
| Single date | `"26 мая 2026"` | `span.date-display-single` |
| Range start | `"18 сентября"` | `span.date-display-start` — NO year (must infer from end date or current year) |
| Range end | `"29 декабря 2026"` | `span.date-display-end` — HAS year |
| Old events | `"9 февраля 2024"` | Past date — filter out (startDate < now) downstream |

26 single-date events, 20 date-range events (38 total containers confirmed).

### Price Patterns Observed

- Prices in event TITLES: `"Картина \"Вид на храм\" 60000 ₽"` — parser must strip `\s+\d[\d\s]*[₽р].*$` from title
- Free entry: `img[alt="Свободный вход"]` (confirmed in HTML)
- Most event pages show price on individual content page only — listing page has no inline price

### Category Classification

No clean category URLs exist (taxonomy/term/N → 403; /concerts, /theater → 404). Parser must classify by content heuristics applied to title + description. JavaScript category tabs on the page are UI-only filters over the already-rendered full event list.

### Charset

Response `Content-Type: text/html; charset=utf-8` — standard UTF-8. No Windows-1251 decoding required.

### robots.txt Summary

`Crawl-delay: 10` — enforce 10 s between any two requests to afisha.surguta.ru.
`/content/*` is allowed. `/admin/*`, `/search/*`, `/user/login/*`, `/includes/*`, `/modules/*`, `/scripts/*`, `/themes/*` are blocked.
For Phase 1 (listing page only, single request): no inter-request delay needed.
If visiting individual `/content/` pages for time precision: apply 10 s delay between each.

---

## Summary for Parser Plans

| Source | Event Selector | Title | Venue | Date | Price |
|--------|---------------|-------|-------|------|-------|
| kassa-ugra | `div.event` | `.title a` text | `li:has(i.icon-location) span` | `li:has(i.icon-calendar) span` (normalize whitespace) | `li:has(i.icon-purse) span` (optional) |
| afisha-surguta | `div.event-element` | `.teaser-title a` text | `.field-name-field-add-organization .field-item` | `span.date-display-single` OR `span.date-display-start`/`end` | Title parse for ₽ pattern |

Both sources confirmed server-rendered. No JavaScript required. No blocker.
