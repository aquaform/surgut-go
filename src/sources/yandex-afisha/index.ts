/**
 * afisha.yandex.ru/surgut source adapter — disabled by default (tosRisk:true).
 *
 * Live-probe evidence (2026-06-27):
 *   - https://afisha.yandex.ru/surgut returns HTTP 200 with SSR events in initial HTML.
 *   - Events visible in carousel: "Пикник" (15 сентября, 19:00), "КняZz" (12 декабря, 19:00).
 *   - Only the /surgut root page works — /surgut/concerts returns HTTP 404.
 *   - Date format: "DD месяца, HH:MM" (Format 4) — requires parseDateFull (not parseRussianDate).
 *   - robots.txt: /surgut content is ALLOWED (confirmed 2026-06-26 in PITFALLS.md).
 *
 * Yandex ToS §3.1 (fetched live 2026-06-27):
 *   "Яндекс вправе устанавливать ограничения в использовании сервисов Яндекса для всех
 *    пользователей. Яндекс может запретить автоматическое обращение к своим сервисам…"
 *   Translation: Yandex may block automated access without notice at any time.
 *
 * Therefore this adapter ships with `enabled: false` and `tosRisk: true`.
 * An operator must explicitly enable it and accept the ToS risk.
 *
 * HTTP 403 handling (T-03-08):
 *   If Yandex blocks the request (403), scrape() rethrows a tagged error
 *   `'HTTP 403 — source blocked'` so the 03-4 pipeline maps it to status 'blocked'
 *   rather than 'error' — preventing a transient block from crashing the refresh loop.
 *
 * Selector strategy (Pitfall 1 equivalent — avoid hashed CSS class names):
 *   Main card links: a[href*="/surgut/concert/"], a[href*="/surgut/performance/"]
 *   — filter out #schedule (ticket button) links and deduplicate carousel clones.
 *   Title: h3 inside the card container (semantic element, stable).
 *   Venue + date: p element containing "• DD месяца, HH:MM" text.
 *   Price: [data-test-id="ticketsPrice.price"] span (test-id attributes are stable).
 *
 * Deduplication: carousel repeats each event 2–3× — dedup by event slug.
 */

// cheerio/slim excludes the undici-backed fromURL helper; the full 'cheerio' entry
// statically imports undici, which breaks inside the esbuild CJS bundle at boot time.
import * as cheerio from 'cheerio/slim';
import { createHash } from 'node:crypto';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import { parseDateFull } from '../../utils/date';
import { parseRussianPrice } from '../../utils/price';
import { fetchHtml } from '../../utils/http';
import { isAllowed } from '../../utils/robots';
import type { SourceAdapter } from '../base';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_NAME = 'yandex-afisha';
const HOME_URL = 'https://afisha.yandex.ru';
/** Only the root /surgut page is SSR-rich; /surgut/concerts returns HTTP 404. */
const LISTING_URL = `${HOME_URL}/surgut`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic event ID.
 * Formula: sha1(sourceName + sourceUrl + startDate.toISOString().slice(0,10))
 */
function makeId(sourceUrl: string, startDate: Date): string {
  return createHash('sha1')
    .update(SOURCE_NAME + sourceUrl + startDate.toISOString().slice(0, 10))
    .digest('hex');
}

/**
 * Naive category classifier by title keywords.
 */
function classifyCategory(title: string): EventCategory {
  const t = title.toLowerCase();
  if (/спектакл|театр|пьес|мюзикл|оперет|опер|балет/.test(t)) return 'theater';
  if (/выставк|галере|экспозиц|музей/.test(t)) return 'exhibition';
  if (/вечеринк|клуб|дискотек/.test(t)) return 'club';
  if (/лекци|мастер.класс|семинар|воркшоп/.test(t)) return 'lecture';
  if (/стенд.ап|stand.up|комеди/.test(t)) return 'standup';
  return 'concert';
}

// ---------------------------------------------------------------------------
// Public parser — testable without network
// ---------------------------------------------------------------------------

/**
 * Parse the afisha.yandex.ru/surgut main page HTML and return NormalizedEvent[].
 *
 * Extracts events from the featured carousel. The carousel contains 2–5 unique
 * events repeated 2–3× as clones; deduplication is by event slug.
 *
 * Date format 4 "DD месяца, HH:MM" (e.g. "15 сентября, 19:00") is handled by
 * parseDateFull — which returns hasTime:true for this format.
 *
 * @param html - Raw decoded UTF-8 HTML from afisha.yandex.ru/surgut
 * @returns Normalized events extracted from featured carousel cards
 * @throws Error with 'ParseError' prefix when fewer than 2 events found (AGG-05)
 */
export function parseYandexAfisha(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const now = new Date();
  const events: NormalizedEvent[] = [];
  /** Dedup by slug to skip carousel clones */
  const seenSlugs = new Set<string>();

  // Select all anchors pointing to event pages (/surgut/concert/ or /surgut/performance/).
  // Two anchor types per card:
  //   1. Main card link: href="/surgut/concert/SLUG?queryparams"  (no #)
  //   2. Ticket button:  href="/surgut/concert/SLUG?queryparams#schedule"
  // We want type (1) — filter out links containing '#schedule'.
  $('a[href*="/surgut/concert/"], a[href*="/surgut/performance/"]').each((_i, el) => {
    const rawHref = $(el).attr('href') ?? '';

    // Skip ticket/schedule button links
    if (rawHref.includes('#schedule')) return;

    // Extract canonical slug (strip query string, keep path only)
    const slugMatch = rawHref.match(/^(\/surgut\/(?:concert|performance)\/[^?#]+)/);
    if (!slugMatch) return;
    const slug = slugMatch[1]!;

    // Dedup: carousel clones repeat the same event multiple times
    if (seenSlugs.has(slug)) return;
    seenSlugs.add(slug);

    const sourceUrl = `${HOME_URL}${slug}`;

    // Traverse to card container (direct parent of the main card anchor)
    const card = $(el).parent();

    // Title: h3 semantic element inside card (stable; also carries data-test-id="featured.slideTitle")
    const title = card.find('h3').first().text().trim();
    if (!title) return;

    // Venue + date: paragraph containing "Venue • DD месяца, HH:MM" text
    // Format 4 pattern: /\d{1,2}\s+[а-яёА-ЯЁ]+,\s+\d{2}:\d{2}/
    let dateStr = '';
    let venue = '';
    card.find('p').each((_j, p) => {
      if (dateStr) return; // already found
      const pText = $(p).text().trim();
      const dateMatch = pText.match(/(\d{1,2}\s+[а-яёА-ЯЁ]+,\s+\d{2}:\d{2})/i);
      if (dateMatch) {
        dateStr = dateMatch[1]!;
        // Venue is the part before " • date"
        const venueMatch = pText.match(/^(.+?)\s*•\s*\d{1,2}/);
        venue = venueMatch ? venueMatch[1]!.trim() : '';
      }
    });

    if (!dateStr) return;

    const parsed = parseDateFull(dateStr);
    if (!parsed || isNaN(parsed.date.getTime())) return;

    const { date: startDate, hasTime } = parsed;

    // Price: [data-test-id="ticketsPrice.price"] span (stable test-id attribute)
    // Fallback: regex on full card text for "от N ₽"
    const priceSpan = card.find('[data-test-id="ticketsPrice.price"]').first();
    const priceRaw = priceSpan.length
      ? priceSpan.text().trim()
      : (card.text().match(/от\s+[\d\s]+₽/i)?.[0] ?? '');
    const price = parseRussianPrice(priceRaw);

    const id = makeId(sourceUrl, startDate);

    events.push({
      id,
      title,
      startDate,
      venue,
      priceText: price.displayText,
      priceMin: price.minRub ?? undefined,
      priceMax: price.maxRub ?? undefined,
      isFree: price.isFree,
      sourceName: SOURCE_NAME,
      sourceUrl,
      category: classifyCategory(title),
      tags: [],
      fetchedAt: now,
      isSeed: false,
      hasTime,
    });
  });

  // Min-results guard: HTTP 200 with <2 events signals structural/selector breakage (AGG-05)
  if (events.length < 2) {
    throw new Error(
      `ParseError: yandex-afisha returned <2 events on HTTP 200 (got ${events.length})`,
    );
  }

  return events;
}

// ---------------------------------------------------------------------------
// Adapter (network-facing) — disabled by default per ToS §3.1
// ---------------------------------------------------------------------------

/**
 * Disabled-by-default SourceAdapter for afisha.yandex.ru/surgut.
 *
 * `enabled: false` — must NOT be added to sourceRegistry without operator consent.
 * `tosRisk: true`  — Yandex ToS §3.1 permits blocking automated access without notice.
 *
 * 03-4 wiring must check `enabled` before calling `scrape()`. When `enabled:true`,
 * scrape() performs: robots gate → fetchHtml → parse → return events.
 * A 403 response rethrows as 'HTTP 403 — source blocked' (T-03-08 mitigated).
 */
export const yandexAfishaAdapter: SourceAdapter & { enabled: boolean; tosRisk: boolean } = {
  name: SOURCE_NAME,
  displayName: 'Яндекс Афиша Сургут',
  homeUrl: HOME_URL,
  timeoutMs: 10_000,

  /** OFF by default — ToS §3.1 risk. Operator must explicitly set enabled:true. */
  enabled: false,

  /**
   * Documented: Yandex ToS §3.1 permits blocking automated access without notice.
   * The 403 → 'blocked' status mapping in 03-4 run.ts handles this gracefully.
   */
  tosRisk: true,

  async scrape(): Promise<NormalizedEvent[]> {
    // robots.txt gate: /surgut is ALLOWED per live probe 2026-06-26
    const allowed = await isAllowed(LISTING_URL);
    if (!allowed) {
      throw new Error('yandex-afisha: scraping disallowed by robots.txt for ' + LISTING_URL);
    }

    let html: string;
    try {
      html = await fetchHtml(LISTING_URL, 10_000);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      // T-03-08: 403 → tagged rethrow so 03-4 maps to status 'blocked', not 'error'
      if (msg.includes('403')) {
        throw new Error('HTTP 403 — source blocked');
      }
      throw err;
    }

    return parseYandexAfisha(html);
  },
};
