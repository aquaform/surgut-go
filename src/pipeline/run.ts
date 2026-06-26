/**
 * runPipeline — parallel scrape with per-source error isolation.
 *
 * Design guarantees (AGG-05, CACHE-03, SRC-08, T-01-10, T-01-11, T-01-12):
 * - Promise.allSettled: one source failure never rejects the whole pipeline
 * - withTimeout: each adapter is bounded by its declared timeoutMs
 * - serve-stale: on rejection, prev events for that source are retained (CACHE-03)
 * - Min-results guard: adapter itself throws (AGG-05) — treated as rejection here
 * - SourceResult.error: human-readable message only, no stack traces (T-01-12)
 */

import type { NormalizedEvent, SourceResult } from '../types/events';
import type { SourceAdapter } from '../sources/base';

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
 *   - status 'error' on the SourceResult
 *   - previous events for that source retained (serve-stale, CACHE-03)
 *   - no empty array overwriting the cache (AGG-05)
 *
 * @param registry - Active source adapters to run in parallel
 * @param prev - Previous pipeline result; used for serve-stale on failure
 * @returns Aggregate of fresh + retained events plus per-source SourceResult[]
 */
export async function runPipeline(
  registry: SourceAdapter[],
  prev?: PipelineResult,
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
      sources.push({
        name: adapter.name,
        displayName: adapter.displayName,
        homeUrl: adapter.homeUrl,
        status: 'live',
        eventCount: events.length,
        fetchedAt: now,
      });
    } else {
      // Rejection path: error isolation + serve-stale
      const reason = result.reason;
      // Human-readable message only — never expose stack (T-01-12)
      const errorMsg = reason instanceof Error ? reason.message : String(reason);

      // Retain previous events for this source (serve-stale, CACHE-03)
      const staleEvents = prevEventsFor(adapter.name, prev);
      allEvents.push(...staleEvents);

      sources.push({
        name: adapter.name,
        displayName: adapter.displayName,
        homeUrl: adapter.homeUrl,
        status: 'error',
        eventCount: staleEvents.length,
        fetchedAt: null,
        error: errorMsg,
      });
    }
  }

  return { events: allEvents, sources };
}
