/**
 * afisha.ru/surgut source adapter.
 *
 * Scrapes https://www.afisha.ru/surgut/events/ and /surgut/concerts/ (first page
 * SSR HTML only — "Показать ещё" loads more via AJAX, out of scope for Phase 3)
 * and normalises events to the NormalizedEvent model.
 *
 * Compliance (SRC-04, SRC-07, AGG-01, AGG-02, AGG-05):
 *   - Checks robots.txt before each listing URL (isAllowed); skips disallowed;
 *     throws only if ALL listing URLs are disallowed.
 *   - 2 s politeness delay between the two page fetches (robots.txt has no Crawl-delay).
 *   - Polite User-Agent + retry via fetchHtml.
 *   - isSeed:false on all scraped events (AGG-02).
 *   - Min-results guard: fewer than 2 events throws ParseError (AGG-05).
 *   - hasTime set from parseDateFull (UX-01 model field).
 *
 * Selector strategy (Pitfall 1: CSS module classes are Next.js-hashed, rotate on deploy):
 *   Use only content-stable selectors:
 *     [role="listitem"] — semantic container for each event card in both /events/ and /concerts/
 *     a[href^="/concert/"], a[href^="/performance/"], a[href^="/event/"] — event page links
 *     aria-label / title attributes — accessibility attributes carrying the event title
 *
 * Event card structure observed 2026-06-27 on both pages:
 *   [role=listitem][aria-label="TITLE"] (concerts page) OR
 *   [role=listitem][title="TITLE"][aria-label="TITLE. DATE, VENUE. price"] (events page)
 *     └─ a[href^="/concert/"] — image link (no query string)
 *     └─ text: "GENRE TITLE DATE в TIME, VENUE От PRICE ₽"
 *     └─ a[href*="?tab="] — ticket/price button "От N ₽"
 *
 * Pitfall 4 equivalent: [role=listitem] elements without a /concert/ or /performance/ link
 * inside are editorial/navigation items — the find() check naturally skips them.
 */

// cheerio/slim excludes the undici-backed fromURL helper (unused here); the full
// 'cheerio' entry statically imports undici, whose lazy internal require() breaks
// inside the single-file esbuild --format=cjs bundle (boot-time MODULE_NOT_FOUND).
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

const SOURCE_NAME = 'afisha-ru';
const HOME_URL = 'https://www.afisha.ru';
/** Two listing pages: /events/ covers all categories; /concerts/ has the largest volume */
const LISTING_URLS = [
  `${HOME_URL}/surgut/events/`,
  `${HOME_URL}/surgut/concerts/`,
] as const;
/** Politeness delay between page fetches (robots.txt has no Crawl-delay declared) */
const POLITENESS_MS = 2_000;
/** Per-page fetch timeout; 2 pages × 8 s + 2 s delay = 18 s < 20 s adapter timeout */
const PAGE_TIMEOUT_MS = 8_000;

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
 * Naive category classification by title keywords.
 */
function classifyCategory(title: string): EventCategory {
  const t = title.toLowerCase();
  if (/спектакл|театр|пьес|мюзикл|оперет|опер|балет/.test(t)) return 'theater';
  if (/выставк|галере|экспозиц|музей/.test(t)) return 'exhibition';
  if (/вечеринк|клуб|дискотек/.test(t)) return 'club';
  if (/лекци|мастер.класс|тренинг|семинар|воркшоп/.test(t)) return 'lecture';
  if (/стенд.ап|stand.up|комеди/.test(t)) return 'standup';
  // Afisha.ru is predominantly concerts and performances
  return 'concert';
}

/** Async sleep helper for politeness between page fetches */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public parser — testable without network
// ---------------------------------------------------------------------------

/**
 * Parse an afisha.ru /surgut/events/ or /surgut/concerts/ page HTML and
 * return NormalizedEvent[].
 *
 * Works on either listing page (both use [role=listitem] event cards with the
 * same structural selectors). The adapter calls this function once per page
 * and concatenates/deduplicates the results.
 *
 * @param html - Raw decoded HTML from afisha.ru
 * @returns Normalized events extracted from [role=listitem] containers
 * @throws Error with 'ParseError' prefix when fewer than 2 events found (AGG-05)
 */
export function parseAfishaRu(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const now = new Date();
  const events: NormalizedEvent[] = [];
  // Track IDs within a single parse call to prevent duplicates when the image
  // link and the title link inside one card share the same href.
  const seenIds = new Set<string>();

  // Iterate [role=listitem] containers. Only actual event cards contain
  // a[href^="/concert/"], a[href^="/performance/"], or a[href^="/event/"]
  // as descendants — editorial/nav listitems don't have those links.
  $('[role="listitem"]').each((_i, el) => {
    // --- Event URL ---
    // Find the primary event link (not the ?tab=schedule ticket button).
    // Both pages have the anchor without a query string as the image/cover link.
    const linkEl = $(el)
      .find('a[href^="/concert/"], a[href^="/performance/"], a[href^="/event/"]')
      .filter((_j, a) => {
        const href = $(a).attr('href') ?? '';
        return !href.includes('?');
      })
      .first();

    const href = linkEl.attr('href');
    if (!href) return; // no event link → skip editorial/nav listitem (Pitfall 4 equivalent)

    const sourceUrl = `${HOME_URL}${href}`;

    // --- Title ---
    // Events page:   listitem has title="EVENT TITLE" (clean, just the name)
    //                and aria-label="EVENT TITLE. DATE, VENUE. Билеты от N ₽"
    // Concerts page: listitem has aria-label="EVENT TITLE" (just the title, no date)
    // Strategy: use title attr first (events page), then aria-label (concerts page).
    let title = ($(el).attr('title') ?? '').trim();
    if (!title) {
      const ariaLabel = ($(el).attr('aria-label') ?? '').trim();
      // Guard: if aria-label contains full info (". DD месяца в HH:MM" after title),
      // extract only the part before the first ". date" sequence.
      const fullInfoIdx = ariaLabel.search(/\.\s+\d{1,2}\s+[а-яёА-ЯЁ]+\s+в\s+\d{2}:\d{2}/);
      title = fullInfoIdx > 0 ? ariaLabel.slice(0, fullInfoIdx).trim() : ariaLabel;
    }
    if (!title) return; // skip containers with no resolvable title

    // --- Date + venue ---
    // Card text format: "GENRE TITLE DD месяца в HH:MM[, VENUE] От N ₽"
    // The date regex extracts the date string and the optional venue.
    const fullText = $(el).text();
    const dateVenueMatch = fullText.match(
      /(\d{1,2}\s+[а-яёА-ЯЁ]+\s+в\s+\d{2}:\d{2})(?:,\s*(.+?))?(?:От|\d+\s*₽|$)/,
    );
    if (!dateVenueMatch) return; // skip cards with no parseable date

    const dateStr = dateVenueMatch[1]!.trim();
    const parsed = parseDateFull(dateStr);
    if (!parsed || isNaN(parsed.date.getTime())) return;

    const { date: startDate, hasTime } = parsed;
    const venue = (dateVenueMatch[2] ?? '').trim();

    // --- Price ---
    // The ticket/price button uses href="...?tab=schedule" on both pages.
    // text() → "От 2800 ₽" or "2000 ₽" or empty string when not available.
    const priceEl = $(el).find('a[href*="?tab="]').first();
    const priceRaw = priceEl.length ? priceEl.text().trim() : '';
    const price = parseRussianPrice(priceRaw);

    // --- Image ---
    // The image is inside the primary event link anchor.
    const imageUrl = linkEl.find('img').first().attr('src') ?? undefined;

    const id = makeId(sourceUrl, startDate);
    // Skip duplicate IDs within one parse call (image + title anchors can share same href)
    if (seenIds.has(id)) return;
    seenIds.add(id);

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
      imageUrl,
      fetchedAt: now,
      isSeed: false,
      hasTime,
    });
  });

  // Min-results guard: HTTP 200 with <2 events signals structural change (AGG-05)
  if (events.length < 2) {
    throw new Error(
      `ParseError: afisha-ru returned <2 events on HTTP 200 (got ${events.length})`,
    );
  }

  return events;
}

// ---------------------------------------------------------------------------
// Adapter (network-facing)
// ---------------------------------------------------------------------------

/**
 * SourceAdapter for afisha.ru/surgut.
 *
 * Checks robots.txt for EACH of the two listing URLs before fetching.
 * If only one URL is allowed, fetches that one only.
 * If all URLs are disallowed, throws (source blocked).
 * Applies a 2 s politeness delay between page fetches.
 * timeoutMs 20 000 covers: 2 × PAGE_TIMEOUT_MS (8 s) + POLITENESS_MS (2 s) = 18 s.
 */
export const afishaRuAdapter: SourceAdapter = {
  name: SOURCE_NAME,
  displayName: 'Афиша.ру Сургут',
  homeUrl: HOME_URL,
  /** Must cover: 2 × PAGE_TIMEOUT_MS + POLITENESS_MS = 18 s */
  timeoutMs: 20_000,

  async scrape(): Promise<NormalizedEvent[]> {
    // Check robots.txt for EACH listing URL (plan requirement: check BOTH)
    const [allowed0, allowed1] = await Promise.all([
      isAllowed(LISTING_URLS[0]),
      isAllowed(LISTING_URLS[1]),
    ]);

    if (!allowed0 && !allowed1) {
      throw new Error('afisha-ru: scraping disallowed by robots.txt for all listing URLs');
    }

    const urlsToFetch = [
      ...(allowed0 ? [LISTING_URLS[0]] : []),
      ...(allowed1 ? [LISTING_URLS[1]] : []),
    ] as string[];

    const allEvents: NormalizedEvent[] = [];

    for (let i = 0; i < urlsToFetch.length; i++) {
      if (i > 0) {
        // Politeness: 2 s between pages (robots.txt declares no Crawl-delay)
        await sleep(POLITENESS_MS);
      }
      try {
        const html = await fetchHtml(urlsToFetch[i]!, PAGE_TIMEOUT_MS);
        // parseAfishaRu throws ParseError if <2 events on this page; catch to continue
        const pageEvents = parseAfishaRu(html);
        allEvents.push(...pageEvents);
      } catch (err) {
        console.error(
          `afisha-ru: error fetching/parsing ${urlsToFetch[i]}: ${(err as Error).message}`,
        );
        // Continue to next page — the other listing URL may still yield events
      }
    }

    // Dedup by id across both pages (events/concerts pages may overlap)
    const seen = new Map<string, NormalizedEvent>();
    for (const e of allEvents) {
      if (!seen.has(e.id)) seen.set(e.id, e);
    }
    const result = Array.from(seen.values());

    // Final min-results guard on aggregate (AGG-05)
    if (result.length < 2) {
      throw new Error(
        `ParseError: afisha-ru returned <2 events across all pages (got ${result.length})`,
      );
    }

    return result;
  },
};
