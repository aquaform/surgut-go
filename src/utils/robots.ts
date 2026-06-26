/**
 * robots.txt compliance layer for Surgut event source scrapers.
 *
 * Design goals (SRC-07):
 *   - Check robots.txt before every scrape cycle
 *   - Cache parsed robots.txt per origin to avoid redundant fetches
 *   - Default to allowed (true) when robots.txt itself is unreachable
 *   - Use the same User-Agent as fetchHtml for consistent allow/deny matching
 *
 * Crawl-delay handling:
 *   The robots.txt Crawl-delay value is intentionally NOT enforced here.
 *   Each source adapter is responsible for enforcing its own inter-request delay:
 *     - afisha.surguta.ru: Crawl-delay 10 → adapter sleeps 10 s between requests
 *     - kassa-ugra.ru: No Crawl-delay → adapter sleeps 2 s between pages (politeness)
 *   This separation keeps the robots layer stateless and easy to unit-test.
 */

import robotsParser from 'robots-parser';
import { fetchHtml, DEFAULT_HEADERS } from './http';

const USER_AGENT = DEFAULT_HEADERS['User-Agent'];

/** In-process cache of parsed robots.txt instances, keyed by origin URL */
const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

/**
 * Check whether scraping `url` is permitted by the source's robots.txt.
 *
 * Fetches and caches the parsed robots.txt for the URL's origin.
 * If robots.txt is unreachable (network error, 404, etc.), returns true
 * (conservative default: assume allowed).
 *
 * @param url - Absolute URL to check (must have an HTTP/HTTPS scheme)
 * @returns   true if scraping is allowed or robots.txt is unavailable,
 *            false if explicitly disallowed
 */
export async function isAllowed(url: string): Promise<boolean> {
  const { origin } = new URL(url);

  if (!robotsCache.has(origin)) {
    try {
      const robotsTxt = await fetchHtml(`${origin}/robots.txt`);
      robotsCache.set(origin, robotsParser(`${origin}/robots.txt`, robotsTxt));
    } catch {
      // robots.txt unreachable → default to allowed (benefit of the doubt)
      return true;
    }
  }

  const robots = robotsCache.get(origin);
  if (!robots) return true;

  return robots.isAllowed(url, USER_AGENT) ?? true;
}

/**
 * Clear the in-process robots.txt cache.
 * Useful for testing or long-running processes that want to re-fetch robots.txt.
 */
export function clearRobotsCache(): void {
  robotsCache.clear();
}
