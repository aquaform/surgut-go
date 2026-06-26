/**
 * afisha.surguta.ru source adapter.
 *
 * Scrapes https://afisha.surguta.ru/ (main listing page — all events in SSR DOM,
 * no pagination needed) and normalises events to the NormalizedEvent model.
 * Uses confirmed CSS selectors from SELECTORS.md (Wave-0 live probe, 2026-06-27).
 *
 * Compliance (SRC-03, SRC-07, AGG-01, AGG-02, AGG-05):
 *   - Checks robots.txt (isAllowed) before any fetch
 *   - Crawl-delay 10 s constant present for future detail-page fetches (SRC-07)
 *     Phase 1 fetches the single listing page only (no inter-request delay needed).
 *   - Polite User-Agent + retry via fetchHtml; charset is UTF-8 (confirmed, not CP1251)
 *   - Age rating stripped from title → ageLimit (Pitfall 7)
 *   - Price stripped from title for art-section events → priceText/priceMin (Pitfall 6)
 *   - Range dates: year resolved from date-display-end when date-display-start has no year
 *   - isSeed:false on all scraped events (AGG-02)
 *   - Min-results guard: fewer than 2 events throws ParseError (AGG-05)
 */

import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import type { NormalizedEvent, EventCategory } from '../../types/events';
import { parseRussianDate, RU_MONTHS } from '../../utils/date';
import { parseRussianPrice } from '../../utils/price';
import { fetchHtml } from '../../utils/http';
import { isAllowed } from '../../utils/robots';
import type { SourceAdapter } from '../base';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_NAME = 'afisha-surguta';
const HOME_URL = 'https://afisha.surguta.ru';
const LISTING_URL = `${HOME_URL}/`;

/**
 * Mandatory inter-request delay required by robots.txt Crawl-delay: 10 (SRC-07).
 * Phase 1 fetches only the single listing page — no delay is applied between requests.
 * This constant is intentionally in place so any future detail-page fetch loop
 * (e.g. to obtain start times) applies the correct delay:
 *
 *   for (const link of eventLinks) {
 *     await sleep(CRAWL_DELAY_MS);
 *     const detail = await fetchHtml(link);
 *   }
 */
export const CRAWL_DELAY_MS = 10_000;

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

/** Async sleep helper — used for crawl-delay enforcement in future detail fetches */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Category classification by title/venue content heuristics.
 * afisha.surguta.ru has no category URLs (JS-driven tabs only — confirmed live probe).
 */
function classifyCategory(title: string, venue: string): EventCategory {
  const combined = (title + ' ' + venue).toLowerCase();
  if (/выставк|галере|экспозиц|музей|картин|арт.сургут/.test(combined)) return 'exhibition';
  if (/спектакл|оперет|опер|балет|театр|пьес|мюзикл/.test(combined)) return 'theater';
  if (/концерт|орке?стр|джаз|рок|поп|хор|ансамбль/.test(combined)) return 'concert';
  if (/вечеринк|клуб|дискотек/.test(combined)) return 'club';
  if (/лекци|мастер.класс|тренинг|семинар|воркшоп|курс|обучени|школа/.test(combined)) return 'lecture';
  return 'other';
}

/**
 * Resolve the start year for a range event when date-display-start has no year.
 *
 * Algorithm: extract end year and end month from endDateStr; if start month ≤ end
 * month they are in the same year, otherwise start is in the year before end.
 *
 * Example:
 *   startDateStr = "9 февраля",  endDateStr = "31 декабря 2026"
 *   startMonth=2, endMonth=12, 2 ≤ 12 → startYear=2026 ✓
 *
 *   startDateStr = "10 ноября", endDateStr = "30 сентября 2027"
 *   startMonth=11, endMonth=9, 11 > 9 → startYear=2027-1=2026 ✓
 */
function resolveRangeStartYear(startDateStr: string, endDateStr: string): number {
  // Extract year from end date
  const endYearMatch = endDateStr.match(/(\d{4})\s*$/);
  if (!endYearMatch) return new Date().getUTCFullYear();
  const endYear = +endYearMatch[1];

  // Extract start month
  const startMonthMatch = startDateStr.match(/\d{1,2}\s+([а-яёА-ЯЁ]+)/i);
  const startMonth = startMonthMatch ? (RU_MONTHS[startMonthMatch[1].toLowerCase()] ?? null) : null;

  // Extract end month
  const endMonthMatch = endDateStr.match(/\d{1,2}\s+([а-яёА-ЯЁ]+)/i);
  const endMonth = endMonthMatch ? (RU_MONTHS[endMonthMatch[1].toLowerCase()] ?? null) : null;

  if (startMonth === null || endMonth === null) return endYear;
  return startMonth <= endMonth ? endYear : endYear - 1;
}

/**
 * Parse the start Date from a range where start has no year but end does.
 * Returns null if date cannot be determined.
 */
function parseRangeStart(startDateStr: string, endDateStr: string): Date | null {
  const startYear = resolveRangeStartYear(startDateStr, endDateStr);

  const m = startDateStr.match(/^(\d{1,2})\s+([а-яёА-ЯЁ]+)/i);
  if (!m) return null;

  const [, d, mon] = m;
  const month = RU_MONTHS[mon.toLowerCase()];
  if (!month) return null;

  return new Date(Date.UTC(startYear, month - 1, +d, 0, 0, 0));
}

// ---------------------------------------------------------------------------
// Public parser — testable without network
// ---------------------------------------------------------------------------

/**
 * Parse the afisha.surguta.ru main listing page HTML and return NormalizedEvent[].
 *
 * @param html - Raw decoded UTF-8 HTML from afisha.surguta.ru/
 * @returns Normalized events extracted from all div.event-element containers
 * @throws Error with 'ParseError' prefix when fewer than 2 events found (AGG-05)
 */
export function parseAfishaSurguta(html: string): NormalizedEvent[] {
  const $ = cheerio.load(html);
  const now = new Date();
  const events: NormalizedEvent[] = [];

  $('div.event-element').each((_i, el) => {
    // Title + source URL
    const titleEl = $(el).find('div.teaser-title a[href^="/content/"]').first();
    const rawTitle = titleEl.text().trim();
    const href = titleEl.attr('href');
    if (!rawTitle || !href) return; // skip incomplete containers

    const sourceUrl = `${HOME_URL}${href}`;

    // --- Title normalization ---

    // 1. Strip age rating suffix: "«Весы» 18+ " → ageLimit="18+", title="«Весы»" (Pitfall 7)
    const ageLimitMatch = rawTitle.match(/\s+(\d{1,2}\+)\s*$/);
    const ageLimit = ageLimitMatch ? ageLimitMatch[1] : undefined;
    let title = ageLimitMatch
      ? rawTitle.slice(0, rawTitle.length - ageLimitMatch[0].length).trim()
      : rawTitle.trim();

    // 2. Strip trailing price from title for art-section events (Pitfall 6)
    //    Pattern: "Картина ... 33 000 ₽" — space + number (with optional spaces) + ₽
    let priceFromTitle = '';
    const priceInTitleMatch = title.match(/\s+(\d[\d\s]*\s*₽)\s*$/);
    if (priceInTitleMatch) {
      priceFromTitle = priceInTitleMatch[1];
      title = title.slice(0, title.length - priceInTitleMatch[0].length).trim();
    }

    // --- Date parsing ---

    const singleDateText = $(el).find('span.date-display-single').first().text().trim();
    const startDateText = $(el).find('span.date-display-start').first().text().trim();
    const endDateText = $(el).find('span.date-display-end').first().text().trim();

    let startDate: Date | null = null;
    let endDate: Date | undefined;

    if (singleDateText) {
      // Single date: "DD месяца YYYY" (full genitive month + year)
      startDate = parseRussianDate(singleDateText);
    } else if (startDateText) {
      if (endDateText) {
        // Range: start often has no year; resolve year from end date
        startDate = parseRangeStart(startDateText, endDateText);
        const parsedEnd = parseRussianDate(endDateText);
        endDate = parsedEnd ?? undefined;
      } else {
        startDate = parseRussianDate(startDateText);
      }
    }

    if (!startDate || isNaN(startDate.getTime())) return; // skip events with no parseable date

    // --- Venue ---
    const venue = $(el)
      .find('div.field-name-field-add-organization .field-item')
      .first()
      .text()
      .trim();

    // --- Image ---
    const imageUrl =
      $(el).find('div.field-name-field-add-additional-images img').first().attr('src') ||
      undefined;

    // --- Free entry badge ---
    const isFreeByBadge = $(el).find('img[alt="Свободный вход"]').length > 0;

    // --- Price ---
    let price: ReturnType<typeof parseRussianPrice>;
    if (priceFromTitle) {
      price = parseRussianPrice(priceFromTitle);
    } else if (isFreeByBadge) {
      price = { minRub: 0, maxRub: 0, isFree: true, displayText: 'Бесплатно' };
    } else {
      price = parseRussianPrice(''); // "Цена не указана"
    }

    const id = makeId(sourceUrl, startDate);

    events.push({
      id,
      title,
      startDate,
      endDate,
      venue: venue || '',
      priceText: price.displayText,
      priceMin: price.minRub ?? undefined,
      priceMax: price.maxRub ?? undefined,
      isFree: price.isFree,
      sourceName: SOURCE_NAME,
      sourceUrl,
      category: classifyCategory(title, venue),
      tags: [],
      ageLimit,
      imageUrl,
      fetchedAt: now,
      isSeed: false,
    });
  });

  // Min-results guard (AGG-05)
  if (events.length < 2) {
    throw new Error(
      `ParseError: afisha-surguta returned <2 events on HTTP 200 (got ${events.length})`,
    );
  }

  return events;
}

// ---------------------------------------------------------------------------
// Adapter (network-facing)
// ---------------------------------------------------------------------------

/**
 * SourceAdapter for afisha.surguta.ru.
 *
 * Phase 1: fetches only the single main listing page (/).
 * The CRAWL_DELAY_MS constant (10 000 ms) is defined at the module level for
 * future detail-page fetches — any future code adding detail-page requests MUST
 * use `await sleep(CRAWL_DELAY_MS)` between requests (SRC-07).
 */
export const afishaSurgutaAdapter: SourceAdapter = {
  name: SOURCE_NAME,
  displayName: 'Афиша Сургута',
  homeUrl: HOME_URL,
  timeoutMs: 12_000,

  async scrape(): Promise<NormalizedEvent[]> {
    // robots.txt check before fetch (SRC-07)
    const allowed = await isAllowed(LISTING_URL);
    if (!allowed) {
      throw new Error('afisha-surguta: scraping disallowed by robots.txt for ' + LISTING_URL);
    }

    // Phase 1: single request — no inter-request delay needed.
    // CRAWL_DELAY_MS (10 000) must be applied between any future additional requests.
    const html = await fetchHtml(LISTING_URL, 10_000);
    return parseAfishaSurguta(html);
  },
};
