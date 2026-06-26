/**
 * kassa-ugra.ru source adapter.
 *
 * Scrapes https://kassa-ugra.ru/afisha (pages 1–3) and normalises events to
 * the NormalizedEvent model. Uses confirmed CSS selectors from SELECTORS.md
 * (Wave-0 live probe, 2026-06-27).
 *
 * Compliance (SRC-02, SRC-07, AGG-01, AGG-02, AGG-05):
 *   - Checks robots.txt before any fetch (isAllowed)
 *   - 2 s politeness delay between pages (no Crawl-delay declared in robots.txt)
 *   - Polite User-Agent + retry via fetchHtml
 *   - timeoutMs 30 000 covers 3 × 8 s page fetches + 2 × 2 s delays
 *   - isSeed:false on all scraped events
 *   - Min-results guard: fewer than 2 events on a page throws ParseError
 */

// cheerio/slim excludes the undici-backed fromURL helper (unused here); the full
// 'cheerio' entry statically imports undici, whose lazy internal require() breaks
// inside the single-file esbuild --format=cjs bundle (boot-time MODULE_NOT_FOUND).
import * as cheerio from 'cheerio/slim';
import { createHash } from 'node:crypto';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import { parseRussianDate } from '../../utils/date';
import { parseRussianPrice } from '../../utils/price';
import { fetchHtml } from '../../utils/http';
import { isAllowed } from '../../utils/robots';
import type { SourceAdapter } from '../base';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_NAME = 'kassa-ugra';
const HOME_URL = 'https://kassa-ugra.ru';
const LISTING_URL = `${HOME_URL}/afisha`;
/** Politeness delay between page fetches (robots.txt has no Crawl-delay) */
const POLITENESS_MS = 2_000;
/** Per-page fetch timeout; 3 pages × 8 s + 2 × 2 s delay ≈ 28 s < 30 s adapter timeout */
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
 * kassa-ugra is predominantly a ticketing site for concerts and shows.
 */
function classifyCategory(title: string): EventCategory {
  const t = title.toLowerCase();
  if (/оперет|балет|спектакл|театр|пьес|мюзикл/.test(t)) return 'theater';
  if (/выставк|галере|экспозиц|музей/.test(t)) return 'exhibition';
  if (/вечеринк|клуб|дискотек/.test(t)) return 'club';
  if (/лекци|мастер.класс|тренинг|семинар|воркшоп/.test(t)) return 'lecture';
  if (/стенд.ап|stand.up|комеди/.test(t)) return 'standup';
  // Ticketing sites default to concert (the vast majority of events)
  return 'concert';
}

/** Async sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public parser — testable without network
// ---------------------------------------------------------------------------

/**
 * Parse a kassa-ugra.ru /afisha page HTML and return NormalizedEvent[].
 *
 * Designed to work with a single page OR with the fixture file which contains
 * 3 pages concatenated (cheerio handles multiple <html> roots leniently).
 *
 * @param html - Raw decoded UTF-8 HTML from kassa-ugra.ru/afisha
 * @returns Normalized events extracted from all div.event containers
 * @throws Error with 'ParseError' prefix when fewer than 2 events found (AGG-05)
 */
export function parseKassaUgra(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const now = new Date();
  const events: NormalizedEvent[] = [];

  $('div.event').each((_i, el) => {
    // Title + source URL
    const titleEl = $(el).find('.title a[href^="/event/"]').first();
    const title = titleEl.text().trim();
    const href = titleEl.attr('href');
    if (!title || !href) return; // skip malformed containers

    const sourceUrl = `${HOME_URL}${href}`;

    // Date: icon-calendar span contains multiline whitespace → normalise
    const dateRaw = $(el).find('li:has(i.icon-calendar) span').first().text();
    const dateStr = dateRaw.replace(/\s+/g, ' ').trim();
    const startDate = parseRussianDate(dateStr);
    if (!startDate || isNaN(startDate.getTime())) return; // skip unparseable dates

    // Price: optional li — absent when no ticket price listed
    const priceRaw = $(el).find('li:has(i.icon-purse) span').first().text().trim();
    const price = parseRussianPrice(priceRaw);

    // Venue
    const venue = $(el).find('li:has(i.icon-location) span').first().text().trim();

    // Image: outer anchor (not the inner title anchor) contains the cover image
    const imageEl = $(el).find('> a[href^="/event/"] > img, a[href^="/event/"]:first-of-type > img').first();
    const imageUrl = imageEl.attr('src') || undefined;

    const id = makeId(sourceUrl, startDate);

    events.push({
      id,
      title,
      startDate,
      venue: venue || '',
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
    });
  });

  // Min-results guard: HTTP 200 with < 2 events signals a structural change (AGG-05)
  if (events.length < 2) {
    throw new Error(
      `ParseError: kassa-ugra returned <2 events on HTTP 200 (got ${events.length})`,
    );
  }

  return events;
}

// ---------------------------------------------------------------------------
// Adapter (network-facing)
// ---------------------------------------------------------------------------

/**
 * SourceAdapter for kassa-ugra.ru.
 *
 * Scrapes /afisha pages 1–3 with 2 s politeness delay between pages.
 * timeoutMs 30 000 is intentionally large to accommodate 3 page fetches
 * plus politeness delays without tripping the pipeline-level withTimeout.
 */
export const kassaUgraAdapter: SourceAdapter = {
  name: SOURCE_NAME,
  displayName: 'Касса Югра',
  homeUrl: HOME_URL,
  /** Must cover: 3 × PAGE_TIMEOUT_MS + 2 × POLITENESS_MS ≈ 28 s */
  timeoutMs: 30_000,

  async scrape(): Promise<NormalizedEvent[]> {
    // robots.txt check before any fetch (SRC-07)
    const allowed = await isAllowed(LISTING_URL);
    if (!allowed) {
      throw new Error('kassa-ugra: scraping disallowed by robots.txt for ' + LISTING_URL);
    }

    const pageUrls = [LISTING_URL, `${LISTING_URL}?page=2`, `${LISTING_URL}?page=3`];
    const allEvents: NormalizedEvent[] = [];

    for (let i = 0; i < pageUrls.length; i++) {
      if (i > 0) {
        // Politeness: 2 s between pages (robots.txt declares no Crawl-delay)
        await sleep(POLITENESS_MS);
      }
      const html = await fetchHtml(pageUrls[i]!, PAGE_TIMEOUT_MS);
      // Each page should have events; parseKassaUgra throws if a page returns < 2
      const pageEvents = parseKassaUgra(html);
      allEvents.push(...pageEvents);
    }

    // Dedup by id in case pages overlap (defensive; uncommon in practice)
    const seen = new Map<string, NormalizedEvent>();
    for (const e of allEvents) {
      if (!seen.has(e.id)) seen.set(e.id, e);
    }
    const result = Array.from(seen.values());

    // Final min-results guard on aggregate
    if (result.length < 2) {
      throw new Error(
        `ParseError: kassa-ugra returned <2 events across all pages (got ${result.length})`,
      );
    }

    return result;
  },
};
