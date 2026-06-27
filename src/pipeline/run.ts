/**
 * runPipeline — parallel scrape with per-source error isolation.
 *
 * Design guarantees (AGG-05, CACHE-03, SRC-08, T-01-10, T-01-11, T-01-12):
 * - Promise.allSettled: one source failure never rejects the whole pipeline
 * - withTimeout: each adapter is bounded by its declared timeoutMs
 * - serve-stale: on rejection, prev events for that source are retained (CACHE-03)
 * - Min-results guard: adapter itself throws (AGG-05) — treated as rejection here
 * - SourceResult.error: human-readable message only, no stack traces (T-01-12)
 *
 * Wave-3 additions (03-4, T-03-12, T-03-13):
 * - 403→blocked mapping: HTTP 403 / 'blocked' errors map to status 'blocked' (not 'error')
 *   so a Yandex block never shows as a transient failure (T-03-12)
 * - disabledSources: optional list of non-scraped sources that appear in
 *   /api/sources/status as 'blocked' with their reason (T-03-13)
 */

import type { NormalizedEvent, SourceResult } from '../types/events';
import type { SourceAdapter } from '../sources/base';
import type { DisabledSource } from '../sources/registry';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PipelineResult {
  events: NormalizedEvent[];
  sources: SourceResult[];
}

// ---------------------------------------------------------------------------
// withTimeout helper
// ---------------------------------------------------------------------------

/**
 * Race a promise against a deadline.
 * Rejects with a descriptive Error if the promise takes longer than `ms`.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Serve-stale helper
// ---------------------------------------------------------------------------

/**
 * Extract events that belong to a specific source from a previous result.
 * Returns empty array if no previous data exists for that source.
 */
function prevEventsFor(
  sourceName: string,
  prev: PipelineResult | undefined,
): NormalizedEvent[] {
  if (!prev) return [];
  return prev.events.filter((e) => e.sourceName === sourceName);
}

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

/**
 * Run all adapters in parallel with per-source error isolation.
 *
 * Each adapter is raced against its declared `timeoutMs`.
 * Failures (any throw, including the adapter's min-results ParseError) are
 * caught by allSettled and result in:
 *   - status 'blocked' if the error message includes 'HTTP 403' or 'blocked' (T-03-12)
 *   - status 'error' for all other rejections
 *   - previous events for that source retained in both cases (serve-stale, CACHE-03)
 *   - no empty array overwriting the cache (AGG-05)
 *
 * Disabled sources (disabledSources param) are never scraped — they are appended
 * to the result .sources array directly with status 'blocked', eventCount 0, and
 * fetchedAt null (T-03-13, SRC-05, SRC-06 default-off).
 *
 * @param registry       - Active source adapters to run in parallel
 * @param prev           - Previous pipeline result; used for serve-stale on failure
 * @param disabledSources - Non-scraped sources to surface as 'blocked' in /api/sources/status
 * @returns Aggregate of fresh + retained events plus per-source SourceResult[]
 */
export async function runPipeline(
  registry: SourceAdapter[],
  prev?: PipelineResult,
  disabledSources?: DisabledSource[],
): Promise<PipelineResult> {
  const settled = await Promise.allSettled(
    registry.map((adapter) => withTimeout(adapter.scrape(), adapter.timeoutMs)),
  );

  const allEvents: NormalizedEvent[] = [];
  const sources: SourceResult[] = [];
  const now = new Date();

  for (let i = 0; i < registry.length; i++) {
    const adapter = registry[i]!;
    const result = settled[i]!;

    if (result.status === 'fulfilled') {
      const events = result.value;
      allEvents.push(...events);
      // Seed adapter must not report 'live' — honest status required (AGG-02, CACHE-04)
      const status = adapter.name === 'seed' ? 'seed' : 'live';
      sources.push({
        name: adapter.name,
        displayName: adapter.displayName,
        homeUrl: adapter.homeUrl,
        status,
        eventCount: events.length,
        fetchedAt: now,
      });
    } else {
      // Rejection path: error isolation + serve-stale
      const reason = result.reason;
      // Human-readable message only — never expose stack (T-01-12)
      const errorMsg = reason instanceof Error ? reason.message : String(reason);

      // T-03-12: HTTP 403 or 'blocked' message → status 'blocked' (not 'error').
      // This allows a Yandex block (or any deliberate source block) to be
      // distinguished from a transient scrape failure in /api/sources/status.
      const isBlocked =
        errorMsg.includes('HTTP 403') || errorMsg.toLowerCase().includes('blocked');

      // Retain previous events for this source (serve-stale, CACHE-03)
      // Note: stale events are retained even when status is 'blocked'.
      const staleEvents = prevEventsFor(adapter.name, prev);
      allEvents.push(...staleEvents);

      sources.push({
        name: adapter.name,
        displayName: adapter.displayName,
        homeUrl: adapter.homeUrl,
        status: isBlocked ? 'blocked' : 'error',
        eventCount: staleEvents.length,
        fetchedAt: null,
        error: errorMsg,
      });
    }
  }

  // T-03-13: Append disabled sources as 'blocked' entries.
  // These sources are never scraped — we just report their intentional-disabled state.
  // eventCount 0 and fetchedAt null enforce honesty (no invented data, AGENTS.md).
  if (disabledSources && disabledSources.length > 0) {
    for (const ds of disabledSources) {
      sources.push({
        name: ds.name,
        displayName: ds.displayName,
        homeUrl: ds.homeUrl,
        status: 'blocked',
        eventCount: 0,
        fetchedAt: null,
        error: ds.reason,
      });
    }
  }

  return { events: allEvents, sources };
}
