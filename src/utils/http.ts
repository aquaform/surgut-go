/**
 * Polite HTTP fetch utility for Surgut event source scrapers.
 *
 * Design goals (SRC-07):
 *   - Descriptive User-Agent so source operators can identify the bot
 *   - AbortSignal.timeout: prevents hung connections from blocking the refresh loop
 *   - p-retry: 2 retries with exponential back-off (1–4 s) for transient failures
 *   - charset detection: decodes windows-1251 responses with TextDecoder
 *   - Throws on non-2xx status so callers can distinguish network vs parse errors
 *   - SSRF-safe by construction: only hardcoded source URLs are ever passed to fetchHtml
 */

import pRetry from 'p-retry';

/** Headers sent with every outbound request */
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': 'surgut-go/1.0 (+https://surgut-go.apps.sielom.ru)',
  'Accept-Language': 'ru-RU,ru;q=0.9',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Encoding': 'gzip, deflate, br',
};

/**
 * Fetch a URL and return decoded HTML.
 *
 * Wraps native fetch in p-retry (2 retries, 1–4 s back-off).
 * Detects `charset=windows-1251` in Content-Type and decodes accordingly;
 * all other responses are read as UTF-8 via res.text().
 *
 * @param url       - Absolute URL to fetch (hardcoded source URLs only — no user input)
 * @param timeoutMs - Per-attempt abort timeout in milliseconds (default 10 s)
 * @throws If all retries fail or the response status is not 2xx
 */
export async function fetchHtml(url: string, timeoutMs = 10_000): Promise<string> {
  return pRetry(
    async () => {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: DEFAULT_HEADERS,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      // Charset detection: Drupal 7 legacy sites may declare windows-1251
      const contentType = res.headers.get('content-type') ?? '';
      const charset = contentType.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase();
      if (charset === 'windows-1251') {
        const buf = await res.arrayBuffer();
        return new TextDecoder('windows-1251').decode(buf);
      }

      return res.text();
    },
    {
      retries: 2,
      minTimeout: 1_000,
      maxTimeout: 4_000,
      onFailedAttempt: ({ error, attemptNumber }) => {
        // Only log; do not swallow — pRetry will re-throw on final attempt
        console.error(`fetchHtml attempt ${attemptNumber} failed for ${url}: ${error.message}`);
      },
    },
  );
}
